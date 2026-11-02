import "server-only";
import path from "path";
import { SCHEMA_SQL } from "./schema";

type Row = Record<string, unknown>;
interface Db {
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
}

const g = globalThis as unknown as { __dlDb?: Promise<Db> };

async function connect(): Promise<Db> {
  const schema = SCHEMA_SQL;
  const url = process.env.DATABASE_URL?.trim().replace(/^["']|["']$/g, "");
  if (url) {
    const postgres = (await import("postgres")).default;
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
    const sql = postgres(url, { max: 5, prepare: false, ssl: local ? false : "require", connect_timeout: 10 });
    await sql.unsafe(schema);
    return { query: async <T>(text: string, params: unknown[] = []) => (await sql.unsafe(text, params as never[])) as unknown as T[] };
  }
  // Hosted platforms have read-only disks, so the embedded database only works locally
  if (process.env.VERCEL || process.env.NODE_ENV === "production" && !process.env.PGLITE_DIR) {
    throw new Error("DATABASE_URL is not set");
  }
  // Embedded Postgres for local development and tests
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data");
  const pg = dir === "memory" ? new PGlite() : new PGlite(dir);
  await pg.exec(schema);
  return { query: async <T>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows };
}

export function db(): Promise<Db> {
  // A failed connection is not cached, so fixing the setting works without a restart
  g.__dlDb ??= connect().catch((e) => {
    g.__dlDb = undefined;
    throw e;
  });
  return g.__dlDb;
}
