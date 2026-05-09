declare module 'mu' {
  import { Application, ErrorRequestHandler } from 'express';
  export const app: Application;
  export function query(sparql: string): Promise<any>;
  export function update(sparql: string): Promise<any>;
  export const errorHandler: ErrorRequestHandler;
}
