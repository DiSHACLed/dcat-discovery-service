import type * as RDF from '@rdfjs/types';
import type { IShape } from 'query-shape-detection';
import type { Result } from './result/types';

export type SparqlSource  = { type: "sparql"; endpoint: string };
export type RdfSource     = { type: "rdf"; url: string; format: string };

export type Queryable = {
  queryBindings: (sparql: string) => Promise<AsyncIterable<RDF.Bindings>>;
  queryQuads:    (sparql: string) => Promise<RDF.Quad[]>;
};

export type CatalogSource = {
  source: SparqlSource | RdfSource | (() => Queryable | Promise<Queryable>);
  graph?: string;
};

export type EntityType = "dcat:Dataset" | "dcat:Distribution" | "dcat:DataService";

export type NonEmptyArray<T> = [T, ...T[]];

export function isNonEmpty<T>(arr: T[]): arr is NonEmptyArray<T> {
  return arr.length > 0;
}

export function filterNonNil<T>(arr: (T | null)[]): T[] {
  const result: T[] = [];
  for (const x of arr) { if (x !== null) result.push(x); }
  return result;
}

export type CatalogEntity = {
  entity: string;
  entityType: EntityType;
  shapes: NonEmptyArray<IShape>;
};

export type CatalogRecord = {
  id: string;
  source: CatalogSource;
  entities: NonEmptyArray<CatalogEntity>;
};

export type SearchEntityResult = {
  entity: string;
  entityType: EntityType;
  result: Result;
};

export type SearchCatalogResult = {
  catalog: string;
  entities: SearchEntityResult[];
};
