import { app, errorHandler } from 'mu';
import type { Request, Response } from 'express';
import { Parser as SPARQLParser } from '@traqula/parser-sparql-1-1';
import { toAlgebra } from '@traqula/algebra-sparql-1-1';
import { generateQuery } from 'query-shape-detection';
import type { CatalogRecord } from './types';
import { filterNonNil } from './types';
import { loadCatalog } from './load';
import { search } from './search';
import { prettyCatalogStore, prettySearchResults } from './pretty';
import { sources } from './config/sources';
import { MU_ID } from './config/sources';

const sparqlParser = new SPARQLParser();

export const catalogStore: CatalogRecord[] = filterNonNil(
  await Promise.all(Object.entries(sources).map(([id, src]) => loadCatalog(id, src)))
);
console.log(prettyCatalogStore(catalogStore));

// ─── GET /index ───────────────────────────────────────────────────────────────

app.get('/index', (req: Request, res: Response) => {
  if (req.accepts('application/json')) {
    return res.json(catalogStore.map(({ id, source, entities }) => ({
      id,
      source,
      entities: entities.map(({ entity, entityType, shapes }) => ({
        entity,
        entityType,
        shapes: shapes.map(s => s.toJson()),
      })),
    })));
  }
  res.type('text/plain').send(prettyCatalogStore(catalogStore));
});

// ─── GET /search ──────────────────────────────────────────────────────────────

app.get('/search', (req: Request, res: Response) => {
  const queryString = req.query['query'] as string | undefined;
  if (!queryString)
    return res.status(400).json({ error: 'Missing required query parameter: query' });

  let query;
  try {
    query = generateQuery(toAlgebra(sparqlParser.parse(queryString)));
  } catch (e: any) {
    return res.status(400).json({ error: `Invalid SPARQL query: ${e.message}` });
  }

  const starPatternNames = Array.from(query.starPatterns.keys());
  const results = search(catalogStore, query);
  const text = prettySearchResults(starPatternNames, results);
  console.log(text);

  if (req.accepts('text/plain'))
    return res.type('text/plain').send(text);

  res.json({ results });
});

// ─── POST /reload ─────────────────────────────────────────────────────────────

async function reloadSource(id: string): Promise<void> {
  const record = await loadCatalog(id, sources[id]!);
  const existing = catalogStore.findIndex(r => r.id === id);
  if (record === null) {
    if (existing !== -1) catalogStore.splice(existing, 1);
  } else if (existing !== -1) {
    catalogStore.splice(existing, 1, record);
  } else {
    catalogStore.push(record);
  }
}

app.post('/reload', async (req: Request, res: Response) => {
  const body: { id?: unknown } = req.body;
  const id = typeof body?.id === 'string' ? body.id : undefined;
  const validIds = Object.keys(sources);
  if (id === undefined || !validIds.includes(id))
    return res.status(400).send(`id must be one of: ${validIds.join(', ')}`);

  try {
    await reloadSource(id);
    res.type('text/plain').send(prettyCatalogStore(catalogStore));
  } catch {
    res.status(500).send('Failed to reload source');
  }
});

// ─── POST /delta for mu-internal ──────────────────────────────────────────────────────────────

app.post('/delta', async (req: Request, res: Response) => {
  // we assume changeset has at least one dct:conformsTo (see rules.js of app)
  console.log('[DELTA] Received Changeset[]; refreshing mu index!');
  try {
    await reloadSource(MU_ID);
    console.log('[DELTA] Reloaded mu-internal due to dct:conformsTo change');
    console.log(prettyCatalogStore(catalogStore));
  } catch {
    console.error('[delta] Reload of mu-internal failed');
    return res.status(500).json({ error: 'Reload failed' });
  }
  res.status(200).end();
});

app.use(errorHandler);