import { query } from 'mu';
import { DataFactory } from 'n3';
import { BindingsFactory } from '@comunica/utils-bindings-factory';
import type * as RDF from '@rdfjs/types';
import type { Queryable } from './types';

// SPARQL 1.1 Query Results JSON Format
type SparqlJsonTerm =
  | { type: 'uri';     value: string }
  | { type: 'bnode';   value: string }
  | { type: 'literal'; value: string; 'xml:lang'?: string; datatype?: string };

type SparqlJsonResult = {
  head:    { vars: string[] };
  results: { bindings: Record<string, SparqlJsonTerm>[] };
};

function termFromJson(t: SparqlJsonTerm): RDF.Term {
  if (t.type === 'uri')   return DataFactory.namedNode(t.value);
  if (t.type === 'bnode') return DataFactory.blankNode(t.value);
  if (t['xml:lang'])      return DataFactory.literal(t.value, t['xml:lang']);
  if (t.datatype)         return DataFactory.literal(t.value, DataFactory.namedNode(t.datatype));
  return DataFactory.literal(t.value);
}

async function muQuery(sparql: string): Promise<SparqlJsonResult> {
  const result = await query(sparql);
  if (result === null) throw new Error('[mu-queryable] mu.query() returned null — response was not valid JSON');
  return result as SparqlJsonResult;
}

const bindingsFactory = new BindingsFactory(DataFactory);

async function queryBindings(sparql: string): Promise<AsyncIterable<RDF.Bindings>> {
  const result = await muQuery(sparql);
  const bindings = result.results.bindings.map(row =>
    bindingsFactory.fromRecord(
      Object.fromEntries(
        Object.entries(row).map(([k, v]) => [k, termFromJson(v)])
      )
    )
  );
  return (async function* () { yield* bindings; })();
}

async function queryQuads(sparql: string): Promise<RDF.Quad[]> {
  const result = await muQuery(sparql);
  return result.results.bindings.map(row => {
    const s = row['s'];
    const p = row['p'];
    const o = row['o'];
    if (!s || !p || !o) throw new Error(`[mu-queryable] CONSTRUCT result row missing s/p/o: ${JSON.stringify(row)}`);
    return DataFactory.quad(
      termFromJson(s) as RDF.Quad['subject'],
      termFromJson(p) as RDF.Quad['predicate'],
      termFromJson(o) as RDF.Quad['object'],
      DataFactory.defaultGraph(),
    );
  });
}

export const muQueryable: Queryable = { queryBindings, queryQuads }

