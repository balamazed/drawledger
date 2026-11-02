import { encodeAbiParameters, encodePacked, keccak256, toHex, type Address, type Hex } from "viem";

// Fresh 32 random bytes as hex, for secrets and entry salts
export function randomBytes32(): Hex {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return toHex(bytes);
}

// Public, pseudonymous identifier of one entry; only the holder of the salt can link it to themselves
export function computeEntryHash(drawId: bigint, salt: Hex): Hex {
  return keccak256(encodeAbiParameters([{ type: "uint256" }, { type: "bytes32" }], [drawId, salt]));
}

// What the operator commits at draw creation, matching DrawRegistry.reveal
export function computeSeedCommitment(operator: Address, secret: Hex): Hex {
  return keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [operator, secret]));
}

export function deriveSeed(drawId: bigint, secret: Hex, targetBlockHash: Hex): Hex {
  return keccak256(
    encodeAbiParameters([{ type: "uint256" }, { type: "bytes32" }, { type: "bytes32" }], [drawId, secret, targetBlockHash]),
  );
}

export function scoreOf(seed: Hex, entryHash: Hex): bigint {
  return BigInt(keccak256(encodePacked(["bytes32", "bytes32"], [seed, entryHash])));
}

// Hash of the draw's public terms, committed on-chain as metadataHash
export function computeMetadataHash(terms: Record<string, unknown>): Hex {
  return keccak256(toHex(canonicalJson(terms)));
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function compareHex(a: Hex, b: Hex): number {
  const x = BigInt(a);
  const y = BigInt(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

export function toBytes32(value: bigint): Hex {
  return toHex(value, { size: 32 });
}
