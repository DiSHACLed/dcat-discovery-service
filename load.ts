import type * as RDF from '@rdfjs/types';
import { shaclShapeFromQuads } from 'query-shape-detection';
import type { IShape } from 'query-shape-detection';
import type { CatalogSource, CatalogRecord, CatalogEntity, EntityType, Queryable } from './types';
import { isNonEmpty, filterNonNil } from './types';
import { constructQueryable } from './queryable';

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

async function resolveShapes(
  rows: Row[],
  getRelevantQuads: (shapeIri: string, shapesGraph?: string) => Promise<RDF.Quad[]>,
): Promise<{ row: Row; shape: IShape }[]> {
  const seen = new Set<string>();
  const deduped = rows.filter(r => {
    const key = `${r.resource}\0${r.shapeIri}`;
    return seen.has(key) ? false : (seen.add(key), true);
  });

  const resolved = await Promise.all(deduped.map(async row => ({
    row,
    shape: await shaclShapeFromQuads(await getRelevantQuads(row.shapeIri, row.shapesGraph), row.shapeIri),
  })));

  return resolved.filter((r): r is { row: Row; shape: IShape } => !(r.shape instanceof Error));
}

function groupByResource(resolved: { row: Row; shape: IShape }[]): CatalogEntity[] {
  const byResource = new Map<string, { type: EntityType; shapes: IShape[] }>();
  for (const { row, shape } of resolved) {
    if (!byResource.has(row.resource)) byResource.set(row.resource, { type: row.type, shapes: [] });
    byResource.get(row.resource)!.shapes.push(shape);
  }

  return filterNonNil(
    Array.from(byResource.entries()).map(([entity, { type, shapes }]) =>
      isNonEmpty(shapes) ? { entity, entityType: type, shapes } : null
    )
  );
}

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

async function discoverEntities(queryable: Queryable, graph?: string): Promise<CatalogEntity[]> {
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

  const getRelevantQuads = (shapeIri: string, shapesGraph?: string) =>
    queryable.queryQuads(
      shapesGraph
        ? `CONSTRUCT { ?s ?p ?o } WHERE { GRAPH <${shapesGraph}> { ?s ?p ?o } }` // TODO restrict!!
        : `CONSTRUCT { ?s ?p ?o } WHERE { ${graphScope(`?s ?p ?o`, graph)} }`
    );

  const resolved = await resolveShapes(rows, getRelevantQuads);
  return groupByResource(resolved);
}

export async function loadCatalog(source: CatalogSource): Promise<CatalogRecord | null> {
  const s = source.source;
  const label = typeof s === 'function'
    ? 'custom queryable'
    : s.type === 'sparql' ? s.endpoint : s.url;

  let queryable: Queryable;
  try {
    queryable = await constructQueryable(source);
  } catch (e) {
    console.warn(`[load] Failed to load source ${label}: ${e}`);
    return null;
  }

  const entities = await discoverEntities(queryable, source.graph);
  if (!isNonEmpty(entities)) {
    console.warn(`[load] No annotated entities found for source ${label} — skipping catalog.`);
    return null;
  }
  return { source, entities };
}
