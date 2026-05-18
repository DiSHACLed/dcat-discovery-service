This is a mu-microservice (using the [mu-javascript-template](https://github.com/mu-semtech/mu-javascript-template)) implementing the
[DCAT-AP Feeds discovery specification](https://semiceu.github.io/LDES-DCAT-AP-feeds/).

Given a SPARQL query from a client, it scans one or more configured DCAT-AP catalog sources loaded into memory, finds `dcat:Dataset`, `dcat:Distribution`, and `dcat:DataService` entities that have associated SHACL shapes, and returns for each entity the results of the[query-shape matching algorithm](https://github.com/DiSHACLed/query-shape-matching-algorithm).

The service does **not** expose a catalog of its own, **nor** does it generate shapes.

# How it works

1. **On startup**, for all catalog sources (SPARQL endpoints or links to RDF files) listed in `CATALOG_SOURCES`, the service does the following: 
   + look for dcat entities; `dcat:Dataset`, `dcat:Distribution`, and `dcat:DataService`
   + look each of these entities, look for any associated shacl shapes via the following annotations:
     - `sh:shapesGraph`
     - `dct:conformsTo`
     - `dcat:qualifiedRelation`
   + for each entity, we use `shaclShapeFromQuads` to get a list of parsed shapes; and loading this all into memory.
2. On a `GET /search` request, the client's SPARQL query is parsed into star patterns; the results is matched against every shape of each entity via `solveShapeQueryContainment`.
3. The response lists each entity together with its catalog source, RDF type, and containment results. 
4. A separate `POST /reload` endpoint allows what has been done in step (1) for a specific catalog (without restarting the service).
---

# In-memory data model

After startup (and after each `POST /reload`), the service holds all catalog data in a single array:

```ts
const catalogStore: CatalogRecord[] = [];
```

The types that make up this store (see `types.ts`):

- Each `CatalogEntity` has a `shapes` array — one `IShape` per shape IRI found via `sh:shapesGraph`, `dct:conformsTo`, or `dcat:qualifiedRelation`. The shape's IRI is available as `shape.name`.
- `IShape` is the type returned by `shaclShapeFromQuads` from the [query-shape-matching library]((https://github.com/DiSHACLed/query-shape-matching-algorithm)) library.

# Configuration

`CATALOG_SOURCES` (defined in config/sources.ts) is **required**. The service will refuse to start without it.

# API

## `GET /discover?query=<url-encoded SPARQL>`

Matches the incoming SPARQL query against all in-memory catalog entities and returns those that have at least one non-`REJECTED` star pattern result, grouped by catalog source.

### Example request

```bash
QUERY='PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX ex: <http://example.org/>
PREFIX schema: <http://schema.org/>

SELECT ?person ?friend WHERE {
  ?person schema:birthDate ?date ;
          foaf:name ?name .
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

## `POST /reload`

Reloads the relevant data (see step 1 from earlier) from a single catalog source into memory without restarting the service. 
The request body must be a an index to the correspoinding element in `CATALOG_SOURCES`.

### Error responses

| Status | Condition |
|--------|-----------|
| `400 Bad Request` | Index is not within scope of `CATALOG_SOURCES` |
| `500 Internal Server Error` | The source could not be fetched or parsed |

A typical use case is to call `POST /reload` after the shape-generation-service has annotated new distributions, rather than restarting the container.

# Shape-matching library

This service depends on [`query-shape-detection`](https://github.com/DiSHACLed/query-shape-matching-algorithm) — a TypeScript library that calculates containment between SPARQL queries and SHACL shapes at the star-pattern level.

The repository is included as a local clone at `./query-shape-matching-algorithm`. Reference it with a `file:` path so that local modifications are picked up automatically:

```json
"dependencies": {
  "query-shape-detection": "file:./query-shape-matching-algorithm"
}
```

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