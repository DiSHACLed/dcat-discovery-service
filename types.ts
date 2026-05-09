import type { IShape } from 'query-shape-detection';

export type SparqlSource  = { type: "sparql"; endpoint: string; graph: string };
export type RdfSource     = { type: "rdf"; url: string; format: string; graph?: string };
export type CatalogSource = SparqlSource | RdfSource;

export type CatalogEntity = {
  entity: string;
  entityType: "dcat:Dataset" | "dcat:Distribution" | "dcat:DataService";
  shapes: IShape[];
};

export type CatalogRecord = {
  source: CatalogSource;
  entities: CatalogEntity[];
};
