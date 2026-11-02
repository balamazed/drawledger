"use client";
import type { Hex } from "viem";

const key = (commitment: string) => `drawledger:secret:${commitment.toLowerCase()}`;

export interface StoredSecret {
  secret: Hex;
  commitment: Hex;
  title: string;
  chainId: number;
  registry: string;
  operator: string;
  savedAt: string;
}

// The seed secret never leaves the operator's browser until they reveal it on-chain
export function saveSecret(s: StoredSecret) {
  localStorage.setItem(key(s.commitment), JSON.stringify(s));
}

export function loadSecret(commitment: string): StoredSecret | null {
  try {
    const raw = localStorage.getItem(key(commitment));
    return raw ? (JSON.parse(raw) as StoredSecret) : null;
  } catch {
    return null;
  }
}

export function downloadSecret(s: StoredSecret) {
  const blob = new Blob([JSON.stringify(s, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `drawledger-secret-${s.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function readSecretFile(file: File): Promise<StoredSecret> {
  const parsed = JSON.parse(await file.text()) as StoredSecret;
  if (!/^0x[0-9a-fA-F]{64}$/.test(parsed.secret)) throw new Error("That file does not contain a DrawLedger secret");
  return parsed;
}
