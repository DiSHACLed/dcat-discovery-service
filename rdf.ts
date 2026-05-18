import * as N3 from 'n3';
import type { RdfSource } from './types';

export async function fetchIntoStore(source: RdfSource): Promise<N3.Store> {
  const response = await fetch(source.url, { headers: { Accept: source.format } });
  if (!response.ok) throw new Error(`Failed to fetch <${source.url}>: ${response.status}`);
  const text = await response.text();
  const quads = await parseRdf(text, source.format);
  const store = new N3.Store();
  store.addQuads(quads);
  return store;
}

async function parseRdf(text: string, format: string): Promise<N3.Quad[]> {
  return new Promise((resolve, reject) => {
    const quads: N3.Quad[] = [];
    new N3.Parser({ format }).parse(text, (err, quad) => {
      if (err) return reject(err);
      if (quad) quads.push(quad);
      else resolve(quads);
    });
  });
}
