import "server-only";
import { createPublicClient, http, type PublicClient } from "viem";
import { appConfig } from "./config";

const g = globalThis as unknown as { __dlClient?: PublicClient };

export function publicClient(): PublicClient {
  g.__dlClient ??= createPublicClient({ chain: appConfig.chain, transport: http(appConfig.rpcUrl) }) as PublicClient;
  return g.__dlClient;
}
