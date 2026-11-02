"use client";
import { useSession } from "@/lib/client/use-session";
import { hasWallet } from "@/lib/client/wallet";
import { Notice } from "./ui";

// Renders children only for a signed-in operator
export function SignInGate({ children }: { children: (address: string) => React.ReactNode }) {
  const { address, loading, error, login, logout } = useSession();
  if (loading) return <p className="text-sm text-muted">Loading…</p>;
  if (!address) {
    return (
      <div className="card max-w-lg space-y-4">
        <h1 className="font-serif text-2xl font-semibold">Sign in as an organiser</h1>
        <p className="text-sm text-muted">
          Connect BridgeKey or MetaMask and sign a one-time message. Signing is free and sends no transaction. You will need a little test MSTC for the draw bond and transaction fees.
        </p>
        {!hasWallet() && <Notice tone="warn">No browser wallet detected. Install BridgeKey or MetaMask, then reload.</Notice>}
        {error && <Notice tone="bad">{error}</Notice>}
        <button className="btn-primary" onClick={login}>Connect wallet and sign in</button>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>Signed in as <span className="mono">{address}</span></span>
        <button className="underline" onClick={logout}>Sign out</button>
      </div>
      {children(address)}
    </div>
  );
}
