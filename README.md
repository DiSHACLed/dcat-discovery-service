This is a mu-microservice (using the [mu-javascript-template](https://github.com/mu-semtech/mu-javascript-template)) implementing the
[DCAT-AP Feeds discovery specification](https://semiceu.github.io/LDES-DCAT-AP-feeds/).

Given a SPARQL query from a client, it scans one or more configured DCAT-AP catalog sources loaded into memory, finds `dcat:Dataset`, `dcat:Distribution`, and `dcat:DataService` entities that have associated SHACL shapes, and returns which entities match the query — along with the containment level for each.

The service does **not** expose a catalog of its own and does **not** generate shapes.

The shape-matching algorithm is provided by [query-shape-detection](https://github.com/DiSHACLed/query-shape-matching-algorithm).

---

# How it works

1. **On startup**, for all catalog sources (SPARQL endpoints or links to RDF files) listed in `CATALOG_SOURCES`, the service does the following: 
   + look for dcat entities; `dcat:Dataset`, `dcat:Distribution`, and `dcat:DataService`
   + look each of these entities, look for any associated shacl shapes via the following annotations:
     - `sh:shapesGraph`
     - `dct:conformsTo`
     - `dcat:qualifiedRelation`
   + for each entity, we use `shaclShapeFromQuads` to get a list of parsed shapes; and loading this all into memory.
2. On a `GET /discover` request, the client's SPARQL query is parsed into star patterns; the results is matched against every shape of each entity via `solveShapeQueryContainment`.
3. The response lists each entity together with its catalog source, RDF type, and containment results. 
    Entities that only have `REJECTED` containments are omitted.
4. A separate `POST /reload` endpoint allows what has been done in step (1) for a specific catalog (without restarting the service).

---

# In-memory data model

After startup (and after each `POST /reload`), the service holds all catalog data in a single array:

```ts
const catalogStore: CatalogRecord[] = [];
```

The types that make up this store (see `types.ts`):

```ts
// Source descriptors — mirror the CATALOG_SOURCES config objects
type SparqlSource  = { type: "sparql"; endpoint: string; graph: string };
type RdfSource     = { type: "rdf"; url: string; format: string; graph?: string };
type CatalogSource = SparqlSource | RdfSource;

// One DCAT entity together with every shape found via its annotations
type CatalogEntity = {
  entity: string;                                                          // entity IRI
  entityType: "dcat:Dataset" | "dcat:Distribution" | "dcat:DataService";
  shapes: IShape[];   // IShape from query-shape-detection; shape.name holds the shape IRI
};

// The in-memory record for one catalog source
type CatalogRecord = {
  source: CatalogSource;
  entities: CatalogEntity[];
};
```

**Reading the store:**

- `catalogStore` has one `CatalogRecord` per entry in `CATALOG_SOURCES`.
- Each `CatalogRecord` groups all `CatalogEntity` objects discovered from that source.
- Each `CatalogEntity` has a `shapes` array — one `IShape` per shape IRI found via `sh:shapesGraph`, `dct:conformsTo`, or `dcat:qualifiedRelation`. The shape's IRI is available as `shape.name`.
- `IShape` is the type returned by `shaclShapeFromQuads` from `query-shape-detection`. It is passed directly to `solveShapeQueryContainment` at query time.

Entities that have no resolvable shapes are stored with `shapes: []` and are skipped during matching.

---

# Configuration

`CATALOG_SOURCES` is **required**. The service will refuse to start without it.

```
CATALOG_SOURCES   # required; JSON array of source descriptor objects (see below)
```

## Source descriptor formats

Two source types are supported:

| `type` | Required fields | Optional fields | Notes |
|--------|----------------|-----------------|-------|
| `"sparql"` | `endpoint`, `graph` | — | Issues a SPARQL CONSTRUCT against the endpoint, scoped to the named graph |
| `"rdf"` | `url`, `format` | `graph` | Fetches an RDF file. `text/turtle` and `application/n-triples` are single-graph formats — no `graph` field needed. `application/trig` is multi-graph — `graph` is required to identify which named graph within the document holds the catalog. |

## Example configuration in `docker-compose.yml`

```yaml
environment:
  CATALOG_SOURCES: >
    [
      {
        "type": "sparql",
        "endpoint": "http://database:8890/sparql",
        "graph": "http://mu.semte.ch/graphs/public"
      },
      {
        "type": "rdf",
        "url": "https://example.org/catalog.ttl",
        "format": "text/turtle"
      },
      {
        "type": "rdf",
        "url": "https://example.org/catalog.trig",
        "format": "application/trig",
        "graph": "http://example.org/graphs/catalog"
      }
    ]
```

The first entry is the local mu-semtech triplestore (routed through the sparql-parser authorization proxy). The second and third are external RDF files fetched directly by URL.

---

# API

## `GET /discover?query=<url-encoded SPARQL>`

Matches the incoming SPARQL query against all in-memory catalog entities and returns those that have at least one matching star pattern.

### Example request

```bash
QUERY='PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX ex: <http://example.org/>
PREFIX schema: <http://schema.org/>

SELECT ?person ?firend WHERE {
  ?person schema:birthDate ?date ;
          foaf:name ?age .
  ?person foaf:knows ?friend.
}'

curl -G http://localhost/discovery/discover \
  --data-urlencode "query=${QUERY}"
```

Direct access (dev port, bypasses dispatcher):

```bash
curl -G http://localhost:8887/discover \
  --data-urlencode "query=${QUERY}"
```

### Example response (200)

```json
{
  "results": [
    {
      "catalog": "http://database:8890/sparql",
      "entityType": "dcat:Dataset",
      "entity": "http://example.com/datasets/people-with-name",
      "containments": [ 
            { "person": "ALIGNED", "shape": "http://example.com/shapes/person" }, 
            { "friend": "REJECTED" },
         ]
    },
    {
      "catalog": "https://example.org/catalog.ttl",
      "entityType": "dcat:Distribution",
      "entity": "http://example.com/datasets/people-with-name-and-friends",
      "containments": [ 
            { "person": "DEPEND", "shape": "http://example.com/shapes/person" }, 
            { "friend": "CONTAIN", "shape": "http://example.com/shapes/person" },
         ]
    },
  ]
}
```

Entities with only `containment: "REJECTED"` are omitted — they have no star pattern overlap with the query and are not useful to the client.

### Error responses

| Status | Condition |
|--------|-----------|
| `400 Bad Request` | `query` parameter is missing or is not a valid SPARQL query |
| `500 Internal Server Error` | Unexpected internal error |

---

## `POST /reload`

Reloads the relevant data (see step 1 from earlier) from a single catalog source into memory without restarting the service. The request body must be a JSON object that matches one of the descriptors in `CATALOG_SOURCES` exactly — matched by `endpoint`+`graph` for SPARQL sources, or by `url` for RDF sources.

### Reload a SPARQL source

```bash
curl -X POST http://localhost/discovery/reload \
  -H 'Content-Type: application/json' \
  -d '{
    "type": "sparql",
    "endpoint": "http://database:8890/sparql",
    "graph": "http://mu.semte.ch/graphs/public"
  }'
```

### Reload an RDF file source

```bash
curl -X POST http://localhost/discovery/reload \
  -H 'Content-Type: application/json' \
  -d '{
    "type": "rdf",
    "url": "https://example.org/catalog.ttl",
    "format": "text/turtle"
  }'
```

### Error responses

| Status | Condition |
|--------|-----------|
| `400 Bad Request` | Body does not match any source listed in `CATALOG_SOURCES` |
| `500 Internal Server Error` | The source could not be fetched or parsed |

A typical use case is to call `POST /reload` after the shape-generation-service has annotated new distributions, rather than restarting the container.

---

# Shape-matching library

This service depends on [`query-shape-detection`](https://github.com/DiSHACLed/query-shape-matching-algorithm) — a TypeScript library that calculates containment between SPARQL queries and SHACL shapes at the star-pattern level.

The repository is included as a local clone at `./query-shape-matching-algorithm`. Reference it with a `file:` path so that local modifications are picked up automatically:

```json
"dependencies": {
  "query-shape-detection": "file:./query-shape-matching-algorithm"
}
```

> **Note:** The npm package `query-shape-detection` on npmjs.com is outdated. Other forks also exist but are not maintained.
>
> When `npm install` resolves the `file:` dependency it automatically runs the library's `prepare` script (`tsc`), so no separate build step is required — the `build/` output is produced as part of a normal install.

## Key functions

```ts
import {
  generateQuery,
  shaclShapeFromQuads,
  solveShapeQueryContainment,
  ContainmentResult,
} from 'query-shape-detection';
import { Parser as SPARQLParser } from '@traqula/parser-sparql-1-1';
import { toAlgebra } from '@traqula/algebra-sparql-1-1';
import * as N3 from 'n3';

// 1. Parse the client's SPARQL query into star patterns
const query = generateQuery(toAlgebra(new SPARQLParser().parse(sparqlString)));

// 2. Parse a SHACL shape from quads
//    quads: RDF.Quad[] fetched from the triplestore or an RDF file
//    shapeIri: the IRI of the sh:NodeShape to parse
const shape = await shaclShapeFromQuads(quads, shapeIri);

// 3. Run containment matching across all shapes for all entities
const result = solveShapeQueryContainment({ query, shapes });
// result.starPatternsContainment: Map<starPatternName, IContainmentResult>
//   where IContainmentResult = { result: ContainmentResult, target?: string[], bindings: Map<...> }
// result.visitShapeBoundedResource: Map<shapeName, boolean>
```

## Containment result values

| Result         | Description                                                  |
| :------------- | :----------------------------------------------------------- |
| **`CONTAIN`**  | All triple patterns in the graph star pattern are covered by the shape's constraints. |
| **`ALIGNED`**  | At least one triple pattern matches, but some parts of the graph star pattern are not covered. |
| **`DEPEND`**   | The pattern is reachable via a property that links to another shape (nested containment). |
| **`REJECTED`** | No part of the star pattern matches any property defined in the shape. |

## Shape annotation properties

When scanning catalog entities, the service recognises three ways a shape may be attached to a `dcat:Dataset`, `dcat:Distribution`, or `dcat:DataService`:

```turtle
# 1. sh:shapesGraph — written by the shape-generation-service
<http://example.org/distributions/abc>
    sh:shapesGraph <http://example.org/shapeGraphs/myShapeGraph> .

# 2. dct:conformsTo — standard DCAT-AP conformance declaration
<http://example.org/datasets/xyz>
    dct:conformsTo <http://example.org/shapes/MyShapeOne>, <http://example.org/shapes/MyShapeTwo>.

# 3. dcat:qualifiedRelation — structured provenance link
<http://example.org/services/ghi>
    dcat:qualifiedRelation [
        dcat:hadRole <http://example.org/shapes/MyShapeOne>, dcat:hadRole <http://example.org/shapes/MyShapeTwo>
    ] .
```

---

# TypeScript setup

The mu-javascript-template transpiles `.ts` files automatically (no type-checking at build time; sourcemaps are included). Use `app.ts` as the entrypoint — the template picks it up without any extra configuration.

Since the `mu` module does not ship TypeScript types, declare them locally in a `mu.d.ts` file at the root of the service:

```ts
// mu.d.ts
declare module 'mu' {
  import { Application, ErrorRequestHandler } from 'express';
  export const app: Application;
  export function query(sparql: string): Promise<any>;
  export function update(sparql: string): Promise<any>;
  export const errorHandler: ErrorRequestHandler;
}
```

---

# Development notes

- Run inside the mu-semtech stack with `NODE_ENV=development`; mount sources at `/app`.
- After adding the dispatcher route for `/discovery/*` in `dispatcher.ex`, restart:
  ```sh
  docker compose restart dispatcher
  ```
- Entities must already have a shape annotation (`sh:shapesGraph`, `dct:conformsTo`, or `dcat:qualifiedRelation`) before this service can match them. Run the shape-generation-service on the relevant distributions first.
- Use `POST /reload` after new shapes are generated, rather than restarting the container.
- To attach the Chrome debugger, expose port `9229` in `docker-compose.yml` and open `chrome://inspect`.

---

# Implementation plan

The spec above is complete; the service is not yet implemented beyond the `mu-javascript-template` boilerplate in `app.ts`. The following phases cover everything that needs to be built, roughly in order.

## Phase 1 — Project setup

DONE

## Phase 2 — Catalog loading

Everything that happens on startup (and on `POST /reload`):

- Parse and validate the `CATALOG_SOURCES` environment variable on startup; refuse to start if it is absent or not valid JSON matching the expected schema.
- Implement a **SPARQL source loader**: issue a SPARQL CONSTRUCT scoped to the configured named graph against the endpoint, collect the resulting quads.
- Implement an **RDF file source loader**: fetch the URL, parse the response body with N3 according to `format` (`text/turtle`, `application/n-triples`, `application/trig`); for TriG sources, filter quads to the named graph specified by `graph`.
- Implement **DCAT entity discovery**: scan the loaded quads for subjects typed `dcat:Dataset`, `dcat:Distribution`, or `dcat:DataService`.
- Implement **shape resolution**: for each discovered entity, find shape IRIs attached via `sh:shapesGraph`, `dct:conformsTo`, and `dcat:qualifiedRelation`; fetch and parse each shape with `shaclShapeFromQuads`; build the `IShape[]` array (the shape IRI is available as `shape.name`).
- On startup, run the above for every source in `CATALOG_SOURCES` and populate `catalogStore: CatalogRecord[]`.

## Phase 3 — `GET /discover`

- Return `400` if the `query` parameter is missing.
- Parse the query string as SPARQL; return `400` if parsing fails.
- Run `generateQuery(toAlgebra(...))` to decompose the query into star patterns.
- For each `CatalogEntity` in `catalogStore` that has at least one shape, call `solveShapeQueryContainment` with the parsed query and that entity's shapes.
- Discard entities where every star-pattern result is `REJECTED`.
- Serialize and return the remaining entities as the JSON response documented above.

## Phase 4 — `POST /reload`

- Parse the request body; return `400` if it does not match either a `SparqlSource` or `RdfSource` schema.
- Look up the matching `CatalogRecord` in `catalogStore` — matched by `endpoint`+`graph` for SPARQL sources, by `url` for RDF sources; return `400` if no match is found.
- Re-run the catalog loading logic (Phase 2) for that one source; replace the existing `CatalogRecord` in `catalogStore` with the freshly loaded one.
- Return `200` on success; `500` if fetching or parsing the source fails.
