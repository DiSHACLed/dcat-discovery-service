import { solveShapeQueryContainment } from 'query-shape-detection';
import type { IQuery } from 'query-shape-detection';
import type { CatalogEntity, CatalogRecord, SearchCatalogResult, SearchEntityResult } from './types';
import { toResult } from './result/result';

function catalogLabel(record: CatalogRecord): string {
  const inner = record.source.source;
  if (typeof inner === 'function') return 'custom queryable';
  return inner.type === 'sparql' ? inner.endpoint : inner.url;
}

function searchEntity(entity: CatalogEntity, query: IQuery): SearchEntityResult {
  const result = solveShapeQueryContainment({ query, shapes: entity.shapes });
  return { entity: entity.entity, entityType: entity.entityType, result: toResult(result) };
}

function searchCatalog(record: CatalogRecord, query: IQuery): SearchCatalogResult {
  const entities = record.entities.map(entity => searchEntity(entity, query));
  return { catalog: catalogLabel(record), entities };
}

export function search(store: CatalogRecord[], query: IQuery): SearchCatalogResult[] {
  return store.map(record => searchCatalog(record, query));
}
