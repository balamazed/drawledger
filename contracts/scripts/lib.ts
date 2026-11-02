import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import { chainById } from "@drawledger/core";

export const deploymentsDir = path.join(__dirname, "../deployments");

export function explorerBase(chainId: number): string | null {
  if (chainId === 54635) return "https://coral.mstscan.com";
  if (chainId === 91562037) return "https://testnet.mstscan.com";
  if (chainId === 4646) return "https://mstscan.com";
  return null;
}

export function saveJson(file: string, data: unknown) {
  mkdirSync(deploymentsDir, { recursive: true });
  writeFileSync(path.join(deploymentsDir, file), JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
}

export function loadJson<T>(file: string): T | null {
  const p = path.join(deploymentsDir, file);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as T) : null;
}

export interface Deployment {
  network: string;
  chainId: number;
  registry: `0x${string}`;
  deployBlock: string;
  deployTx: `0x${string}`;
  deployer: `0x${string}`;
  treasury: `0x${string}`;
  minBondWei: string;
  deployedAt: string;
  explorer: string | null;
}

// hardhat-viem only knows chains bundled with viem, so MST's chain is passed in explicitly
export async function mstClients(hre: HardhatRuntimeEnvironment) {
  const configured = hre.network.config.chainId;
  const known = configured !== undefined ? chainById(configured) : undefined;
  const opts = known && configured !== 31337 ? { chain: known } : {};
  const publicClient = await hre.viem.getPublicClient(opts);
  const wallets = await hre.viem.getWalletClients(opts);
  return { publicClient, wallets, opts };
}
