import { toHex } from "viem";

export function randomToken(bytes = 16) {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return Buffer.from(b).toString("base64url");
}

export function slugify(title: string, chainDrawId: bigint) {
  const base = title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "draw";
  return `${base}-${chainDrawId}`;
}

export function shortHash(h: string, n = 8) {
  return `${h.slice(0, 2 + n)}`;
}

export { toHex };
