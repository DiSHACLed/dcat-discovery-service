import type { CatalogSource } from '../types';
import { muQueryable } from '../mu-queryable';
import { makePaginatedSource } from '../paginated';

export const sources: CatalogSource[] = [

    { 
        source: () => muQueryable, // internal endpoint but going through sparql-parser
        graph: "http://mu.semte.ch/graphs/public" 
    },
    {
        source: makePaginatedSource('http://dcat-serve-paginated'), // the internal paginated version
    },
    {
        source: { type: "rdf", url: "http://static-server:3000/water.trig", format: "application/trig" },
        graph: "http://example.org/graphs/catalog"
    },
    {
        source: { type: "rdf", url: "http://static-server:3000/books.trig", format: "application/trig" },
        graph: "http://example.org/graphs/catalog"
    }
]