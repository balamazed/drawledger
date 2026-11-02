"use client";
import { useState } from "react";
import type { Address, Hex } from "viem";
import { drawRegistryAbi, readDraw, readReveal, verifyDraw, winnersFromJson, type VerificationReport, type WinnerJson } from "@drawledger/core";
import { appConfig } from "@/lib/config";
import { api, errorText } from "@/lib/client/api";
import { browserPublicClient, connectWallet } from "@/lib/client/wallet";
import { Notice, TxLink } from "./ui";

export interface PublicChainData {
  entries: Hex[];
  winners: WinnerJson[] | null;
  entriesLocked: boolean;
}

// Recomputes the whole draw in the browser from MST state plus the published lists
export async function runVerification(registry: Address, onchainId: bigint, data: PublicChainData): Promise<VerificationReport> {
  const client = browserPublicClient();
  const draw = await readDraw(client, registry, onchainId);
  const reveal = await readReveal(client, registry, onchainId, appConfig.deployBlock);
  return verifyDraw({
    drawId: onchainId,
    draw,
    orderedEntries: data.entries,
    reveal: reveal ?? undefined,
    publishedWinners: data.winners ? winnersFromJson(data.winners) : undefined,
  });
}

export function VerifyPanel({ registry, onchainId }: { registry: Address; onchainId: string }) {
  const [report, setReport] = useState<VerificationReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challengeTx, setChallengeTx] = useState<string | null>(null);

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      const data = await api<PublicChainData>(`/api/public/chain/${registry}/${onchainId}`);
      setReport(await runVerification(registry, BigInt(onchainId), data));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function challenge() {
    if (!report?.challenge) return;
    setBusy(true);
    setError(null);
    try {
      const { wallet, address } = await connectWallet();
      const hash = await wallet.writeContract({
        account: address,
        chain: appConfig.chain,
        address: registry,
        abi: drawRegistryAbi,
        functionName: report.challenge.fn,
        args: report.challenge.args as never,
      });
      await browserPublicClient().waitForTransactionReceipt({ hash });
      setChallengeTx(hash);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <button className="btn-ghost" onClick={verify} disabled={busy}>{busy ? "Checking…" : "Verify this draw in my browser"}</button>
      {error && <Notice tone="bad">{error}</Notice>}
      {report && (
        <ul className="space-y-1 text-sm">
          {report.checks.map((c) => (
            <li key={c.name} className="flex gap-2">
              <span className={c.ok ? "text-accent" : "text-bad"}>{c.ok ? "PASS" : "FAIL"}</span>
              <span>{c.detail}</span>
            </li>
          ))}
        </ul>
      )}
      {report?.challenge && !challengeTx && (
        <Notice tone="bad">
          This result can be proven wrong on-chain ({report.challenge.fn}). Submitting the proof voids the draw and pays you the organiser&apos;s bond.{" "}
          <button className="underline" disabled={busy} onClick={challenge}>Submit proof from my wallet</button>
        </Notice>
      )}
      {challengeTx && <Notice tone="good">Challenge accepted on-chain: <TxLink hash={challengeTx} /></Notice>}
    </div>
  );
}
