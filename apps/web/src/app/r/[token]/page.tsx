"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { Hex } from "viem";
import {
  DrawStatus,
  checkEntrant,
  computeEntryHash,
  entriesTreeFromOrdered,
  entryLeaf,
  entryProofFor,
  readDraw,
  verifyProof,
  winnersFromJson,
  type EntrantCheck,
  type OnchainDraw,
} from "@drawledger/core";
import { Hash, Notice, StatusBadge } from "@/components/ui";
import { VerifyPanel, type PublicChainData } from "@/components/VerifyPanel";
import { appConfig } from "@/lib/config";
import { api, errorText } from "@/lib/client/api";
import { browserPublicClient } from "@/lib/client/wallet";

interface Receipt {
  drawSlug: string;
  drawTitle: string;
  onchainId: string;
  label: string;
  salt: Hex;
  entryHash: Hex;
  issuedAt: string;
}

export default function ReceiptPage() {
  const { token } = useParams<{ token: string }>();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [chain, setChain] = useState<OnchainDraw | null>(null);
  const [check, setCheck] = useState<EntrantCheck | null>(null);
  const [proofOk, setProofOk] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const r = await api<Receipt>(`/api/receipts/${token}`);
      // The receipt is self-consistent only if the hash really derives from this salt
      if (computeEntryHash(BigInt(r.onchainId), r.salt).toLowerCase() !== r.entryHash.toLowerCase()) throw new Error("Receipt is inconsistent: hash does not match its salt");
      setReceipt(r);
      const draw = await readDraw(browserPublicClient(), appConfig.registry, BigInt(r.onchainId));
      setChain(draw);
      if (draw.status < DrawStatus.Closed) return;
      const data = await api<PublicChainData>(`/api/public/chain/${appConfig.registry}/${r.onchainId}`);
      const tree = entriesTreeFromOrdered(data.entries);
      const inTree = data.entries.some((h) => h.toLowerCase() === r.entryHash.toLowerCase());
      if (inTree) {
        const p = entryProofFor(tree, r.entryHash);
        setProofOk(verifyProof(draw.entriesRoot, draw.entryCount, entryLeaf(r.entryHash), Number(p.index), p.proof));
      } else setProofOk(false);
      setCheck(checkEntrant({ entryHash: r.entryHash, orderedEntries: data.entries, draw, publishedWinners: data.winners ? winnersFromJson(data.winners) : undefined }));
    })().catch((e) => setError(errorText(e)));
  }, [token]);

  if (error) return <Notice tone="bad">{error}</Notice>;
  if (!receipt) return <p className="text-sm text-muted">Loading receipt…</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted">Entry receipt</p>
        <h1 className="font-serif text-3xl font-semibold">{receipt.drawTitle}</h1>
        <p className="text-sm text-muted">Issued to {receipt.label} on {new Date(receipt.issuedAt).toLocaleString()}</p>
      </div>
      <Notice tone="warn">Bookmark this page and do not share the link. Anyone with it can see your entry.</Notice>
      <section className="card space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="font-medium">Draw status</span>
          {chain && <StatusBadge status={chain.status} />}
        </div>
        <div>Your entry hash: <Hash value={receipt.entryHash} short /></div>
        <div>Your private salt: <Hash value={receipt.salt} short /></div>
      </section>

      {chain && chain.status === DrawStatus.Open && <Notice>Entries are still open. Once the organiser closes them, this page proves you are included.</Notice>}
      {proofOk === true && <Notice tone="good">Confirmed: your entry is inside the list committed on MST (Merkle proof checked in your browser).</Notice>}
      {proofOk === false && <Notice tone="bad">Your entry is NOT in the committed list. Contact the organiser; the list cannot change any more.</Notice>}

      {check?.won !== undefined && (
        check.won ? (
          <Notice tone="good">You won, rank {check.rank}. The organiser will contact you through the details you gave them.</Notice>
        ) : check.shouldHaveWon ? (
          <Notice tone="bad">Your score is within the winning cutoff but you are not listed as a winner. Verify below; the proof can void this draw on-chain.</Notice>
        ) : (
          <Notice>You did not win this draw. Your score was above the cutoff, which you can confirm below.</Notice>
        )
      )}

      {chain && chain.status >= DrawStatus.Published && (
        <section className="card space-y-3">
          <h2 className="font-serif text-lg font-semibold">Check the whole draw</h2>
          <VerifyPanel registry={appConfig.registry} onchainId={receipt.onchainId} />
        </section>
      )}
      <Link href={`/d/${receipt.drawSlug}`} className="text-sm text-accent underline">Open the public draw page</Link>
    </div>
  );
}
