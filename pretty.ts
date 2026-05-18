import type { CatalogEntity, CatalogRecord, SearchCatalogResult, SearchEntityResult } from './types';
import { prettyResult } from './result/pretty';

function sourceLabel(record: CatalogRecord): string {
  const { source: inner, graph } = record.source;
  const graphPart = graph ? ` (graph: ${graph})` : '';
  const base = typeof inner === 'function'
    ? 'custom queryable'
    : inner.type === 'sparql'
      ? `sparql @ ${inner.endpoint}`
      : `rdf @ ${inner.url}`;
  return `${base}${graphPart}`;
}

function prettyCatalogEntity(entity: CatalogEntity): string[] {
  const lines = [`      · ${entity.entityType.padEnd(20)} ${entity.entity}`];
  if (entity.shapes.length > 0)
    lines.push(`          shapes: ${entity.shapes.map(s => s.name).join(', ')}`);
  return lines;
}

function prettyCatalogRecord(index: number, record: CatalogRecord): string[] {
  const lines = ['', `[${index}] ${sourceLabel(record)}`];
  if (record.entities.length === 0) {
    lines.push('    (no entities)');
  } else {
    lines.push(`    ${record.entities.length} entit${record.entities.length !== 1 ? 'ies' : 'y'}:`);
    for (const entity of record.entities)
      lines.push(...prettyCatalogEntity(entity));
  }
  return lines;
}

export function prettyCatalogStore(store: CatalogRecord[]): string {
  const lines = [`=== Catalog Store (${store.length} source${store.length !== 1 ? 's' : ''}) ===`];
  for (const [i, record] of store.entries())
    lines.push(...prettyCatalogRecord(i + 1, record));
  return lines.join('\n');
}

function prettySearchEntityResult(result: SearchEntityResult): string[] {
  return [`    [${result.entityType}] ${result.entity}`, ...prettyResult(result.result)];
}

function prettySearchCatalogResult(result: SearchCatalogResult): string[] {
  const lines = ['', `  catalog: ${result.catalog}`];
  for (const entity of result.entities)
    lines.push(...prettySearchEntityResult(entity));
  return lines;
}

export function prettySearchResults(starPatternNames: string[], results: SearchCatalogResult[]): string {
  const lines = [`=== /search ===`, `Query star patterns: ${starPatternNames.join(', ') || '(none)'}`];
  if (results.length === 0) {
    lines.push('  (no matches)');
  } else {
    for (const result of results)
      lines.push(...prettySearchCatalogResult(result));
  }
  return lines.join('\n');
}
