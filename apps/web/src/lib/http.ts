import { NextResponse } from "next/server";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { bigintReplacer } from "@drawledger/core";
import { sessionAddress } from "./session";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function json(data: unknown, status = 200) {
  return new NextResponse(JSON.stringify(data, bigintReplacer), { status, headers: { "content-type": "application/json" } });
}

// Wraps a route handler with consistent error responses
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      const req = args[0];
      if (req instanceof Request) assertSameOrigin(req);
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      if (e instanceof ZodError) return json({ error: "Invalid input", issues: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, 400);
      console.error(e);
      return json({ error: "Internal error" }, 500);
    }
  };
}

export async function parseBody<S extends ZodTypeAny>(req: Request, schema: S): Promise<z.output<S>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "Body must be JSON");
  }
  return schema.parse(body);
}

export async function requireOperator() {
  const address = await sessionAddress();
  if (!address) throw new HttpError(401, "Sign in with your wallet first");
  return address;
}

export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

// Rejects cross-site writes; browsers always send Origin on POST, PATCH and DELETE
export function assertSameOrigin(req: Request) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (new URL(origin).host !== host) throw new HttpError(403, "Cross-site request blocked");
}
