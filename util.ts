import type { CatalogSource } from './types';

export function matchesSource(a: CatalogSource, b: CatalogSource): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "sparql" && b.type === "sparql")
    return a.endpoint === b.endpoint && a.graph === b.graph;
  if (a.type === "rdf" && b.type === "rdf")
    return a.url === b.url;
  return false;
}
