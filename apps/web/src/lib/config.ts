import { chainById, localHardhat, mstCoral } from "@drawledger/core";
import type { Address, Chain } from "viem";

const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || mstCoral.id);
const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || chainById(chainId)?.rpcUrls.default.http[0] || "";
const base: Chain = chainById(chainId) ?? localHardhat;

// Single source of network settings for server and browser
export const appConfig = {
  chainId,
  rpcUrl,
  chain: { ...base, rpcUrls: { default: { http: [rpcUrl] } } } as Chain,
  registry: (process.env.NEXT_PUBLIC_REGISTRY_ADDRESS || "") as Address,
  deployBlock: BigInt(process.env.NEXT_PUBLIC_REGISTRY_DEPLOY_BLOCK || "0"),
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
