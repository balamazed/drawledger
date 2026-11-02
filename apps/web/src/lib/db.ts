import "server-only";
import { readFileSync } from "fs";
import path from "path";

type Row = Record<string, unknown>;
interface Db {
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
}

const g = globalThis as unknown as { __dlDb?: Promise<Db> };

async function connect(): Promise<Db> {
  const schema = readFileSync(path.join(process.cwd(), "db/schema.sql"), "utf8");
  if (process.env.DATABASE_URL) {
    const postgres = (await import("postgres")).default;
    const sql = postgres(process.env.DATABASE_URL, { max: 5, prepare: false });
    await sql.unsafe(schema);
    return { query: async <T>(text: string, params: unknown[] = []) => (await sql.unsafe(text, params as never[])) as unknown as T[] };
  }
  // Embedded Postgres for local development and tests
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data");
  const pg = dir === "memory" ? new PGlite() : new PGlite(dir);
  await pg.exec(schema);
  return { query: async <T>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows };
}

export function db(): Promise<Db> {
  g.__dlDb ??= connect();
  return g.__dlDb;
}
