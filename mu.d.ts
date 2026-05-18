declare module 'mu' {
  import { Application, ErrorRequestHandler } from 'express';

  interface QueryOptions {
    sudo?: boolean;
    scope?: string;
  }

  type SparqlEscapeType =
    | 'string'
    | 'uri'
    | 'bool'
    | 'decimal'
    | 'int'
    | 'float'
    | 'date'
    | 'dateTime';

  export const app: Application;
  export const errorHandler: ErrorRequestHandler;

  export function query(queryString: string, options?: QueryOptions): Promise<object | null>;
  export function update(queryString: string, options?: QueryOptions): Promise<object | null>;

  export function uuid(): string;
  export function beforeExit(callback: () => Promise<void>): void;

  export function sparqlEscape(value: unknown, type: SparqlEscapeType): string;
  export function sparqlEscapeString(value: string): string;
  export function sparqlEscapeUri(value: string): string;
  export function sparqlEscapeDecimal(value: string | number): string;
  export function sparqlEscapeInt(value: string | number): string;
  export function sparqlEscapeFloat(value: string | number): string;
  export function sparqlEscapeDate(value: Date | string | number): string;
  export function sparqlEscapeDateTime(value: Date | string | number): string;
  export function sparqlEscapeBool(value: unknown): string;
}
