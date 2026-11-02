import { defineChain, type Chain } from "viem";

// Parameters verified against Chainlist, ethereum-lists and MST's own SDK (Nov 2026)
export const mstCoral: Chain = defineChain({
  id: 54635,
  name: "MST Coral Testnet",
  nativeCurrency: { name: "MST Coral Coin", symbol: "tMSTC", decimals: 18 },
  rpcUrls: { default: { http: ["https://coralrpc.mstblockchain.com"], webSocket: ["wss://coralrpc.mstblockchain.com"] } },
  blockExplorers: { default: { name: "mstscan", url: "https://coral.mstscan.com" } },
  testnet: true,
});

export const mstTestnet: Chain = defineChain({
  id: 91562037,
  name: "MST Testnet",
  nativeCurrency: { name: "MST Test Coin", symbol: "tMSTC", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnetrpc.mstblockchain.com"], webSocket: ["wss://testnetrpc.mstblockchain.com"] } },
  blockExplorers: { default: { name: "mstscan", url: "https://testnet.mstscan.com" } },
  testnet: true,
});

export const mstMainnet: Chain = defineChain({
  id: 4646,
  name: "MST Mainnet",
  nativeCurrency: { name: "MSTC", symbol: "MSTC", decimals: 18 },
  rpcUrls: { default: { http: ["https://mariorpc.mstblockchain.com"] } },
  blockExplorers: { default: { name: "mstscan", url: "https://mstscan.com" } },
});

export const localHardhat: Chain = defineChain({
  id: 31337,
  name: "Hardhat",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
  testnet: true,
});

export const chains: Record<string, Chain> = { mstCoral, mstTestnet, mstMainnet, localHardhat };

export function chainById(id: number): Chain | undefined {
  return Object.values(chains).find((c) => c.id === id);
}

export function explorerTx(chainId: number, hash: string): string | null {
  const c = chainById(chainId);
  return c?.blockExplorers ? `${c.blockExplorers.default.url}/tx/${hash}` : null;
}

export function explorerAddress(chainId: number, address: string): string | null {
  const c = chainById(chainId);
  return c?.blockExplorers ? `${c.blockExplorers.default.url}/address/${address}` : null;
}
