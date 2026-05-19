import * as fs from 'fs';
import * as url from 'url';
import * as path from 'path';
import type * as RDF from '@rdfjs/types';
import { shaclShapeFromQuads } from 'query-shape-detection';
import type { IShape } from 'query-shape-detection';
import type { CatalogSource, CatalogRecord, CatalogEntity, EntityType, Queryable } from './types';
import { isNonEmpty, filterNonNil } from './types';
import { constructQueryable } from './queryable';

const RELEVANT_QUADS_TEMPLATE = fs.readFileSync(
  path.join(path.dirname(url.fileURLToPath(import.meta.url)), 'relevant-quads.sparql'),
  'utf-8'
);

function relevantQuads(queryable: Queryable, shapeIri: string, shapesGraph?: string): Promise<RDF.Quad[]> {
  const query = RELEVANT_QUADS_TEMPLATE
    .replace('<SHAPE_IRI>', `<${shapeIri}>`)
    .replace('<GRAPH_SCOPE>', shapesGraph ? `GRAPH <${shapesGraph}>` : '');
  return queryable.queryQuads(query);
}

const IRI_TO_ENTITY_TYPE: Record<string, EntityType> = {
  'http://www.w3.org/ns/dcat#Dataset':      'dcat:Dataset',
  'http://www.w3.org/ns/dcat#Distribution': 'dcat:Distribution',
  'http://www.w3.org/ns/dcat#DataService':  'dcat:DataService',
};

function curie(iri: string): EntityType {
  const type = IRI_TO_ENTITY_TYPE[iri];
  if (!type) throw new Error(`Unexpected entity type IRI: ${iri}`);
  return type;
}

function graphScope(body: string, graph?: string): string {
  return graph ? `GRAPH <${graph}> { ${body} }` : body;
}

type Row = { resource: string; type: EntityType; shapeIri: string; shapesGraph?: string };

async function queryRows(queryable: Queryable, sparql: string): Promise<Row[]> {
  const rows: Row[] = [];
  const bindings = await queryable.queryBindings(sparql);
  for await (const b of bindings) {
    const shapesGraph = b.get('shapesGraph')?.value;
    rows.push({
      resource: b.get('resource')!.value,
      type:     curie(b.get('type')!.value),
      shapeIri: b.get('shape')!.value,
      ...(shapesGraph !== undefined && { shapesGraph }),
    });
  }
  return rows;
}

async function discoverCatalogEntities(queryable: Queryable, graph?: string): Promise<CatalogEntity[]> {
  const DCAT = 'http://www.w3.org/ns/dcat#';
  const DCT  = 'http://purl.org/dc/terms/';
  const SH   = 'http://www.w3.org/ns/shacl#';
  const PREFIXES = `PREFIX dcat: <${DCAT}> PREFIX dct: <${DCT}> PREFIX sh: <${SH}>`;
  const ALL_TYPES  = `VALUES ?type { dcat:Dataset dcat:Distribution dcat:DataService }`;
  const DATA_TYPES = `VALUES ?type { dcat:Dataset dcat:DataService }`;

  const rows = (await Promise.all([
    queryRows(queryable, `${PREFIXES}
      SELECT ?resource ?type ?shape WHERE {
        ${graphScope(`${ALL_TYPES} ?resource a ?type ; dct:conformsTo ?shape . ?shape a sh:NodeShape .`, graph)}
      }`),
    queryRows(queryable, `${PREFIXES}
      SELECT ?resource ?type ?shape WHERE {
        ${graphScope(`${DATA_TYPES} ?resource a ?type ; dcat:qualifiedRelation ?rel . ?rel dct:relation ?shape . ?shape a sh:NodeShape .`, graph)}
      }`),
    queryRows(queryable, `${PREFIXES}
      SELECT ?resource ?type ?shape ?shapesGraph WHERE {
        ${graphScope(`${ALL_TYPES} ?resource a ?type ; sh:shapesGraph ?shapesGraph .`, graph)}
        GRAPH ?shapesGraph { ?shape a sh:NodeShape . }
      }`),
  ])).flat();

  // in theory, we could annotate a resource in different ways...
  const seen = new Set<string>();
  const deduped = rows.filter(r => {
    const key = `${r.resource}\0${r.shapeIri}`;
    return seen.has(key) ? false : (seen.add(key), true);
  });

  // parsing of each shapeIri in parallel
  const resolved : {resource : string, type : EntityType, shape : IShape}[] = (await Promise.all(
    deduped.map(async row => {
      const shape = await shaclShapeFromQuads(await relevantQuads(queryable, row.shapeIri, row.shapesGraph), row.shapeIri);
      return shape instanceof Error ? null : { resource: row.resource, type: row.type, shape };
    })
  )).filter((r): r is { resource: string; type: EntityType; shape: IShape } => r !== null);

  // the remainder is just bureaucracy
  const byResource = new Map<string, { type: EntityType; shapes: IShape[] }>();
  for (const { resource, type, shape } of resolved) {
    if (!byResource.has(resource)) byResource.set(resource, { type, shapes: [] });
    byResource.get(resource)!.shapes.push(shape);
  }

  return filterNonNil(
    Array.from(byResource.entries()).map(([entity, { type, shapes }]) =>
      isNonEmpty(shapes) ? { entity, entityType: type, shapes } : null
    )
  );

}

export async function loadCatalog(id: string, source: CatalogSource): Promise<CatalogRecord | null> {
  const s = source.source;
  const label = typeof s === 'function'
    ? 'custom queryable'
    : s.type === 'sparql' ? s.endpoint : s.url;

  let queryable: Queryable;
  try {
    queryable = await constructQueryable(source);
  } catch (e) {
    console.warn(`[LOAD] Failed to load source ${id} (${label}): ${e}`);
    return null;
  }

  const entities = await discoverCatalogEntities(queryable, source.graph);
  if (!isNonEmpty(entities)) {
    console.warn(`[LOAD] No annotated entities found for source ${id} (${label}) — skipping catalog.`);
    return null;
  }
  return { id, source, entities };
}
