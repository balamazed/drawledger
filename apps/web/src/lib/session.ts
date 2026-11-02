import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import type { Address } from "viem";

const COOKIE = "dl_session";
const TTL_SECONDS = 12 * 60 * 60;

function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be at least 32 characters");
    return new TextEncoder().encode("dev-only-session-secret-change-me-0000");
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(address: Address) {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(address.toLowerCase())
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(key());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

export async function sessionAddress(): Promise<Address | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    return (payload.sub as Address) ?? null;
  } catch {
    return null;
  }
}
