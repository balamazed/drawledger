import { chainById, localHardhat, mstCoral } from "@drawledger/core";
import type { Address, Chain } from "viem";

// Tolerates values pasted with spaces, quotes or a leading NAME=
function clean(value: string | undefined) {
  const v = (value ?? "").trim().replace(/^["']|["']$/g, "");
  return v.includes("=") ? v.slice(v.lastIndexOf("=") + 1).trim() : v;
}

const chainId = Number(clean(process.env.NEXT_PUBLIC_CHAIN_ID).match(/\d+/)?.[0] ?? mstCoral.id);
const rpcUrl = clean(process.env.NEXT_PUBLIC_RPC_URL) || chainById(chainId)?.rpcUrls.default.http[0] || "";
const base: Chain = chainById(chainId) ?? localHardhat;

// Single source of network settings for server and browser
export const appConfig = {
  chainId,
  rpcUrl,
  chain: { ...base, rpcUrls: { default: { http: [rpcUrl] } } } as Chain,
  registry: (clean(process.env.NEXT_PUBLIC_REGISTRY_ADDRESS).match(/0x[0-9a-fA-F]{40}/)?.[0] ?? "") as Address,
  deployBlock: BigInt(clean(process.env.NEXT_PUBLIC_REGISTRY_DEPLOY_BLOCK).match(/\d+/)?.[0] ?? "0"),
  explorer: base.blockExplorers?.default.url ?? null,
};

export function isConfigured() {
  return /^0x[0-9a-fA-F]{40}$/.test(appConfig.registry) && !!appConfig.rpcUrl;
}

export function txLink(hash: string) {
  return appConfig.explorer ? `${appConfig.explorer}/tx/${hash}` : null;
}

export function addressLink(address: string) {
  return appConfig.explorer ? `${appConfig.explorer}/address/${address}` : null;
}
