"use client";
import { useEffect, useState } from "react";
import type { Address } from "viem";
import { VerifyPanel } from "@/components/VerifyPanel";
import { appConfig } from "@/lib/config";

export default function VerifyPage() {
  const [drawId, setDrawId] = useState("");
  const [shown, setShown] = useState<string | null>(null);
  const [origin, setOrigin] = useState("<app url>");
  useEffect(() => setOrigin(window.location.origin), []);
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="font-serif text-3xl font-semibold">Verify a draw</h1>
      <p className="text-sm text-muted">
        Enter an on-chain draw number. Your browser reads the commitments directly from MST, fetches the published entry and winner lists, and recomputes the result itself.
      </p>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setShown(drawId.trim()); }}>
        <input className="input" inputMode="numeric" pattern="\d+" placeholder="Draw number, e.g. 12" value={drawId} onChange={(e) => setDrawId(e.target.value)} />
        <button className="btn-primary">Load</button>
      </form>
      {shown && (
        <div className="card">
          <VerifyPanel key={shown} registry={appConfig.registry as Address} onchainId={shown} />
        </div>
      )}
      <div className="card space-y-2 text-sm">
        <h2 className="font-serif text-lg font-semibold">Prefer not to trust this website?</h2>
        <p className="text-muted">Use the open-source command-line verifier, which talks to any MST RPC endpoint you choose:</p>
        <pre className="mono overflow-x-auto rounded bg-paper p-3">{`npx drawledger-verify --rpc ${appConfig.rpcUrl} \\
  --registry ${appConfig.registry || "<registry>"} --draw <id> \\
  --from-block ${appConfig.deployBlock.toString()} --api ${origin}`}</pre>
      </div>
    </div>
  );
}
