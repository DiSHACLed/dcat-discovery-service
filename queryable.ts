import * as N3 from 'n3';
import type * as RDF from '@rdfjs/types';
import { QueryEngine } from '@comunica/query-sparql';
import type { CatalogSource, Queryable } from './types';
import { fetchIntoStore } from './rdf';

const engine = new QueryEngine();

async function constructQuads(source: { type: 'sparql'; value: string } | N3.Store, query: string): Promise<RDF.Quad[]> {
  const stream = await engine.queryQuads(query, { sources: [source] });
  const quads: RDF.Quad[] = [];
  for await (const q of stream) quads.push(q);
  return quads;
}

export function queryableFromComunicaSource(
  comunicaSource: { type: 'sparql'; value: string } | N3.Store
): Queryable {
  return {
    queryBindings: async (sparql: string) => engine.queryBindings(sparql, { sources: [comunicaSource] }),
    queryQuads:    async (sparql: string) => constructQuads(comunicaSource, sparql),
  };
}

export async function constructQueryable(source: CatalogSource): Promise<Queryable> {
  const s = source.source;

  if (typeof s === 'function') {
    return s();
  }

  const comunicaSource: { type: 'sparql'; value: string } | N3.Store =
    s.type === 'sparql'
      ? { type: 'sparql', value: s.endpoint }
      : await fetchIntoStore(s);

  return queryableFromComunicaSource(comunicaSource);
}
