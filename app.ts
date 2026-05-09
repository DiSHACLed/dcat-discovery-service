// see https://github.com/mu-semtech/mu-javascript-template for more info

import { app, errorHandler } from 'mu';
import type { CatalogSource, CatalogRecord } from './types';
import { loadCatalog } from './load';
import { matchesSource } from './util';

const raw = process.env.CATALOG_SOURCES;
if (!raw) throw new Error("CATALOG_SOURCES is required");
const sources: CatalogSource[] = JSON.parse(raw);

export const catalogStore: CatalogRecord[] = await Promise.all(sources.map(loadCatalog));

// POST /reload
app.post('/reload', async (req, res) => {
  const body: CatalogSource = req.body;
  const index = catalogStore.findIndex(record => matchesSource(record.source, body));
  if (index === -1) return res.status(400).send("No matching source in CATALOG_SOURCES");
  try {
    catalogStore[index] = await loadCatalog(body);
    res.status(200).send();
  } catch (e) {
    res.status(500).send("Failed to reload source");
  }
});

app.use(errorHandler);
