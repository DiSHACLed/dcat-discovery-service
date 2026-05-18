import * as N3 from 'n3';
import type * as RDF from '@rdfjs/types';
import { fetchIntoStore } from './rdf';
import { queryableFromComunicaSource } from './queryable';
import type { Queryable } from './types';

const HYDRA_LAST = 'http://www.w3.org/ns/hydra/core#last';

function buildPageUrl(baseUrl: string, page: number): string {
  const u = new URL(baseUrl);
  u.searchParams.set('page', String(page));
  return u.toString();
}

function extractPageNumber(url: string): number {
  const match = /[?&]page=(\d+)/.exec(url);
  if (!match?.[1]) throw new Error(`[paginated] Could not extract page number from URL: ${url}`);
  return parseInt(match[1], 10);
}

async function fetchPage(baseUrl: string, page: number): Promise<N3.Store> {
  return fetchIntoStore({ type: 'rdf', url: buildPageUrl(baseUrl, page), format: 'text/turtle' });
}

function storeQueryable(store: N3.Store): Queryable {
  return queryableFromComunicaSource(store);
}

export function makePaginatedSource(baseUrl: string): () => Promise<Queryable> {
  return async () => {
    // Fetch page 1
    const firstStore = await fetchPage(baseUrl, 1);

    // Determine total number of pages via hydra:last
    const lastUrl = firstStore.getQuads(null, HYDRA_LAST, null, null)[0]?.object.value;
    if (!lastUrl) throw new Error(`[paginated] No hydra:last found in page 1 of <${baseUrl}>`);
    const lastPage = extractPageNumber(lastUrl);

    // Fetch remaining pages in parallel
    const remaining = await Promise.all(
      Array.from({ length: lastPage - 1 }, (_, i) => fetchPage(baseUrl, i + 2))
    );

    const stores: N3.Store[] = [firstStore, ...remaining];

    return {
      queryBindings: async (sparql: string): Promise<AsyncIterable<RDF.Bindings>> => {
        const all = await Promise.all(stores.map(s => storeQueryable(s).queryBindings(sparql)));
        return (async function* () { for (const it of all) yield* it; })();
      },
      queryQuads: async (sparql: string): Promise<RDF.Quad[]> => {
        const all = await Promise.all(stores.map(s => storeQueryable(s).queryQuads(sparql)));
        return all.flat();
      },
    };
  };
}
