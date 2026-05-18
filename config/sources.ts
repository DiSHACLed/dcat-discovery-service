import type { CatalogSource } from '../types';
import { muQueryable } from '../mu-queryable';
import { makePaginatedSource } from '../paginated';

// do not to use the same key twice 
// type checker should complain already so no runtime check is needed

export const MU_ID = "mu-internal"; // key the use for mu endpoint

export const sources: Record<string, CatalogSource> = {
    [MU_ID]: {
        source: () => muQueryable, // internal endpoint but going through sparql-parser
        graph: "http://mu.semte.ch/graphs/public"
    },
    "paginated": {
        source: makePaginatedSource('http://dcat-serve-paginated'), // the internal paginated version
    },
    "water": {
        source: { type: "rdf", url: "http://static-server:3000/water.trig", format: "application/trig" },
        graph: "http://example.org/graphs/catalog"
    },
    "books": {
        source: { type: "rdf", url: "http://static-server:3000/books.trig", format: "application/trig" },
        graph: "http://example.org/graphs/catalog"
    }
};
