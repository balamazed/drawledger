"use client";
import { createPublicClient, createWalletClient, custom, getAddress, http, type Address, type EIP1193Provider, type PublicClient, type WalletClient } from "viem";
import { createSiweMessage } from "viem/siwe";
import { appConfig } from "../config";
import { api } from "./api";

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

export function hasWallet() {
  return typeof window !== "undefined" && !!window.ethereum;
}

export function browserPublicClient(): PublicClient {
  return createPublicClient({ chain: appConfig.chain, transport: http(appConfig.rpcUrl) }) as PublicClient;
}

// Asks the injected wallet (BridgeKey, MetaMask) for an account on the configured MST network
export async function connectWallet(): Promise<{ wallet: WalletClient; address: Address }> {
  if (!window.ethereum) throw new Error("No browser wallet found. Install BridgeKey or MetaMask.");
  const wallet = createWalletClient({ chain: appConfig.chain, transport: custom(window.ethereum) });
  const [raw] = await wallet.requestAddresses();
  const address = getAddress(raw);
  await ensureChain(wallet);
  return { wallet, address };
}

async function ensureChain(wallet: WalletClient) {
  if ((await wallet.getChainId()) === appConfig.chainId) return;
  try {
    await wallet.switchChain({ id: appConfig.chainId });
  } catch {
    await wallet.addChain({ chain: appConfig.chain });
    await wallet.switchChain({ id: appConfig.chainId });
  }
}

export async function signIn(): Promise<Address> {
  const { wallet, address } = await connectWallet();
  const { nonce } = await api<{ nonce: string }>("/api/auth/nonce");
  const message = createSiweMessage({
    domain: window.location.host,
    address,
    statement: "Sign in to DrawLedger as a draw operator. This does not send a transaction or cost gas.",
    uri: window.location.origin,
    version: "1",
    chainId: appConfig.chainId,
    nonce,
    issuedAt: new Date(),
    expirationTime: new Date(Date.now() + 10 * 60 * 1000),
  });
  const signature = await wallet.signMessage({ account: address, message });
  await api("/api/auth/verify", { method: "POST", json: { message, signature } });
  return address;
}
