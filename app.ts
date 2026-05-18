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

const sparqlParser = new SPARQLParser();

export const catalogStore: CatalogRecord[] = filterNonNil(
  await Promise.all(sources.map(loadCatalog))
);
console.log(prettyCatalogStore(catalogStore));

// ─── GET /index ───────────────────────────────────────────────────────────────

app.get('/index', (req: Request, res: Response) => {
  if (req.accepts('application/json')) {
    return res.json(catalogStore.map(({ source, entities }) => ({
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

app.post('/reload', async (req: Request, res: Response) => {
  const body: { index?: unknown } = req.body;
  const index = typeof body?.index === 'number' ? body.index : NaN;
  if (!Number.isInteger(index) || index < 0 || index >= sources.length)
    return res.status(400).send(`index must be an integer in [0, ${sources.length - 1}]`);

  try {
    const record = await loadCatalog(sources[index]!);
    if (record === null) {
      catalogStore.splice(index, 1);
    } else {
      catalogStore.splice(index, 1, record);
    }
    res.type('text/plain').send(prettyCatalogStore(catalogStore));
  } catch {
    res.status(500).send('Failed to reload source');
  }
});

app.use(errorHandler);
