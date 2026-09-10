import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { db } from "./db";

/** Thrown by services/controllers; becomes an HTTP status. */
export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message); }
}
export const notFound = (what: string) => new HttpError(404, `${what} not found`);
export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, details);
export const conflict = (msg: string) => new HttpError(409, msg);

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init);
}

/**
 * Wraps a route handler: connects to Mongo, runs it, and maps errors to JSON.
 * Controllers stay thin: parse → service → presenter.
 */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      await db();
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) return NextResponse.json({ error: err.message, details: err.details ?? null }, { status: err.status });
      if (err instanceof ZodError) return NextResponse.json({ error: "Invalid request", details: err.issues }, { status: 400 });
      console.error(err);
      const message = err instanceof Error ? err.message : "Unexpected error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let json: unknown;
  try { json = await req.json(); } catch { throw badRequest("Body must be JSON"); }
  return schema.parse(json);
}

export function query(req: Request): URLSearchParams {
  return new URL(req.url).searchParams;
}

/** Route context params are async in Next 15+. */
export type Params<T extends string> = { params: Promise<Record<T, string>> };
