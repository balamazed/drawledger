"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import Papa from "papaparse";
import { useCallback, useEffect, useState } from "react";
import { formatEther, type Hex } from "viem";
import { DrawStatus, drawRegistryAbi, readDraw, type OnchainDraw } from "@drawledger/core";
import { SignInGate } from "@/components/SignInGate";
import { Hash, Notice, StatusBadge, Timeline, TxLink } from "@/components/ui";
import { appConfig } from "@/lib/config";
import { api, errorText } from "@/lib/client/api";
import { loadSecret, readSecretFile } from "@/lib/client/secrets";
import { browserPublicClient, connectWallet } from "@/lib/client/wallet";

interface Entry {
  id: string;
  label: string;
  contact: string | null;
  entryHash: string;
  receiptToken: string;
  source: string;
}

interface DrawData {
  draw: {
    id: string;
    slug: string;
    title: string;
    terms: { winnerCount: number; challengePeriodSeconds: number; prize: string };
    onchainId: string;
    status: number;
    publicSignup: boolean;
    showWinnerLabels: boolean;
    entriesLockedAt: string | null;
    entriesRoot: string | null;
    winners: { entryHash: string; score: string }[] | null;
    winnersMatch: boolean | null;
  };
  entries: Entry[];
  events: { name: string; txHash: string; blockNumber: string }[];
}

function receiptUrl(token: string) {
  return `${window.location.origin}/r/${token}`;
}

function Manage({ id, session }: { id: string; session: string }) {
  const [data, setData] = useState<DrawData | null>(null);
  const [chain, setChain] = useState<OnchainDraw | null>(null);
  const [block, setBlock] = useState<bigint>(0n);
  const [withdrawable, setWithdrawable] = useState<bigint>(0n);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [single, setSingle] = useState({ label: "", contact: "" });

  const load = useCallback(async () => {
    const d = await api<DrawData>(`/api/draws/${id}`);
    setData(d);
    const client = browserPublicClient();
    const [c, b, w] = await Promise.all([
      readDraw(client, appConfig.registry, BigInt(d.draw.onchainId)),
      client.getBlockNumber(),
      client.readContract({ address: appConfig.registry, abi: drawRegistryAbi, functionName: "withdrawable", args: [session as Hex] }),
    ]);
    setChain(c);
    setBlock(b);
    setWithdrawable(w);
  }, [id, session]);

  useEffect(() => {
    load().catch((e) => setError(errorText(e)));
  }, [load]);

  useEffect(() => {
    if (chain?.status !== DrawStatus.Closed) return;
    const t = setInterval(() => browserPublicClient().getBlockNumber().then(setBlock).catch(() => {}), 3000);
    return () => clearInterval(t);
  }, [chain?.status]);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setError(null);
    setInfo(null);
    try {
      await fn();
      if (data) await api(`/api/public/draws/${data.draw.slug}/sync`, { method: "POST" });
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  // Sends one registry transaction from the operator's wallet and waits for it
  async function send(functionName: "closeEntries" | "reveal" | "publishResult" | "finalize" | "withdraw", args: readonly unknown[]) {
    const { wallet, address } = await connectWallet();
    if (address.toLowerCase() !== session) throw new Error("Switch your wallet to the signed-in operator account");
    const hash = await wallet.writeContract({ account: address, chain: appConfig.chain, address: appConfig.registry, abi: drawRegistryAbi, functionName, args: args as never });
    const r = await browserPublicClient().waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`Transaction ${hash} reverted`);
    return hash;
  }

  async function addEntries(entries: { label: string; contact?: string }[]) {
    const r = await api<{ added: number; skipped: string[] }>(`/api/draws/${id}/entries`, { method: "POST", json: { entries } });
    setInfo(`Added ${r.added} entr${r.added === 1 ? "y" : "ies"}${r.skipped.length ? `, skipped ${r.skipped.length} duplicate contact(s)` : ""}.`);
  }

  function importCsv(file: File) {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
      complete: (res) => {
        const rows = res.data
          .map((r) => ({ label: (r.label ?? r.name ?? Object.values(r)[0] ?? "").trim(), contact: (r.contact ?? r.email ?? r.phone ?? "").trim() || undefined }))
          .filter((r) => r.label);
        if (rows.length === 0) return setError("No rows found. Use a header row with a 'name' column and optional 'email' or 'phone'.");
        run("Importing", () => addEntries(rows));
      },
    });
  }

  function exportReceipts() {
    if (!data) return;
    const csv = Papa.unparse(data.entries.map((e) => ({ name: e.label, contact: e.contact ?? "", receipt: receiptUrl(e.receiptToken) })));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${data.draw.slug}-receipts.csv`;
    a.click();
  }

  async function closeOnChain() {
    const { commitment } = await api<{ commitment: { root: Hex; count: number } }>(`/api/draws/${id}/lock`, { method: "POST", json: { unlock: false } });
    await send("closeEntries", [BigInt(data!.draw.onchainId), commitment.root, commitment.count]);
  }

  async function reveal(file?: File) {
    const stored = file ? await readSecretFile(file) : loadSecret(chain!.seedCommitment);
    if (!stored) throw new Error("Secret not found in this browser. Upload the backup file downloaded when you created the draw.");
    await send("reveal", [BigInt(data!.draw.onchainId), stored.secret]);
  }

  async function publish() {
    const r = await api<{ cutoff: string; root: Hex; count: number }>(`/api/draws/${id}/result`, { method: "POST" });
    await send("publishResult", [BigInt(data!.draw.onchainId), BigInt(r.cutoff), r.root, r.count]);
  }

  if (error && !data) return <Notice tone="bad">{error}</Notice>;
  if (!data || !chain) return <p className="text-sm text-muted">Loading draw…</p>;
  const { draw, entries, events } = data;
  const status = chain.status;
  const target = chain.targetBlock;
  const now = BigInt(Math.floor(Date.now() / 1000));
  const winnersByHash = new Map(entries.map((e) => [e.entryHash, e]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/operator" className="text-xs text-muted hover:underline">← All draws</Link>
          <h1 className="font-serif text-3xl font-semibold">{draw.title}</h1>
          <div className="mt-1 text-sm text-muted">On-chain draw #{draw.onchainId} · {chain.winnerCount} winner(s) · bond {formatEther(chain.bond)} {appConfig.chain.nativeCurrency.symbol}</div>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={status} />
          <Link href={`/d/${draw.slug}`} className="btn-ghost">Public page</Link>
        </div>
      </div>
      <Timeline status={status} events={events} />
      {error && <Notice tone="bad">{error}</Notice>}
      {info && <Notice tone="good">{info}</Notice>}

      {status === DrawStatus.Open && (
        <section className="card space-y-4">
          <h2 className="font-serif text-xl font-semibold">1. Collect entries</h2>
          {!draw.entriesLockedAt ? (
            <>
              <form
                className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
                onSubmit={(e) => {
                  e.preventDefault();
                  run("Adding", async () => {
                    await addEntries([{ label: single.label, contact: single.contact || undefined }]);
                    setSingle({ label: "", contact: "" });
                  });
                }}
              >
                <input className="input" placeholder="Entrant name" required value={single.label} onChange={(e) => setSingle({ ...single, label: e.target.value })} />
                <input className="input" placeholder="Email or phone (optional)" value={single.contact} onChange={(e) => setSingle({ ...single, contact: e.target.value })} />
                <button className="btn-ghost" disabled={!!busy}>Add</button>
              </form>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <label className="btn-ghost cursor-pointer">
                  Import CSV
                  <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} />
                </label>
                <span className="text-xs text-muted">Columns: name, and email or phone</span>
                <label className="ml-auto flex items-center gap-2">
                  <input type="checkbox" checked={draw.publicSignup} onChange={(e) => run("Saving", () => api(`/api/draws/${id}`, { method: "PATCH", json: { publicSignup: e.target.checked } }))} />
                  Public sign-up
                </label>
              </div>
            </>
          ) : (
            <Notice tone="warn">Entries are locked. Close them on MST below, or unlock to keep editing.</Notice>
          )}
          <div className="flex flex-wrap gap-3">
            <button className="btn-primary" disabled={!!busy || entries.length === 0} onClick={() => run("Closing entries", closeOnChain)}>
              {busy === "Closing entries" ? "Closing…" : `Lock ${entries.length} entries and close on MST`}
            </button>
            {draw.entriesLockedAt && <button className="btn-ghost" disabled={!!busy} onClick={() => run("Unlocking", async () => { await api(`/api/draws/${id}/lock`, { method: "POST", json: { unlock: true } }); })}>Unlock</button>}
          </div>
        </section>
      )}

      {status === DrawStatus.Closed && (
        <section className="card space-y-3">
          <h2 className="font-serif text-xl font-semibold">2. Reveal the seed</h2>
          <p className="text-sm text-muted">
            The seed mixes your secret with the hash of block {target.toString()}. Current block: {block.toString()}.
            {block <= target ? ` Wait for ${(target - block + 1n).toString()} more block(s).` : ` Reveal before block ${(target + 250n).toString()} or the draw fails and the bond is lost.`}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-primary" disabled={!!busy || block <= target} onClick={() => run("Revealing", () => reveal())}>{busy === "Revealing" ? "Revealing…" : "Reveal with saved secret"}</button>
            <label className="btn-ghost cursor-pointer">
              Reveal from backup file
              <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && run("Revealing", () => reveal(e.target.files![0]))} />
            </label>
          </div>
        </section>
      )}

      {status === DrawStatus.Revealed && (
        <section className="card space-y-3">
          <h2 className="font-serif text-xl font-semibold">3. Publish the result</h2>
          <p className="text-sm text-muted">Winners are the {Math.min(chain.winnerCount, chain.entryCount)} entries with the lowest hash(seed, entry). DrawLedger computes them; you commit the result on MST.</p>
          <button className="btn-primary" disabled={!!busy} onClick={() => run("Publishing", publish)}>{busy === "Publishing" ? "Publishing…" : "Compute and publish result"}</button>
        </section>
      )}

      {status >= DrawStatus.Published && draw.winners && (
        <section className="card space-y-3">
          <h2 className="font-serif text-xl font-semibold">Winners</h2>
          {draw.winnersMatch === false && <Notice tone="bad">The on-chain result does not match the result stored here.</Notice>}
          <ol className="space-y-1 text-sm">
            {draw.winners.map((w, i) => (
              <li key={w.entryHash} className="flex items-center gap-3">
                <span className="w-8 text-muted">#{i + 1}</span>
                <span className="font-medium">{winnersByHash.get(w.entryHash)?.label ?? "Unknown entry"}</span>
                <span className="text-muted">{winnersByHash.get(w.entryHash)?.contact}</span>
                <Hash value={w.entryHash} short />
              </li>
            ))}
          </ol>
          {status === DrawStatus.Published && (
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <span className="text-sm text-muted">Challenge window ends {new Date(Number(chain.challengeDeadline) * 1000).toLocaleString()}.</span>
              <button className="btn-ghost" disabled={!!busy || now <= chain.challengeDeadline} onClick={() => run("Finalising", async () => { await send("finalize", [BigInt(draw.onchainId)]); })}>Finalise and release bond</button>
            </div>
          )}
        </section>
      )}

      {withdrawable > 0n && (
        <Notice tone="good">
          {formatEther(withdrawable)} {appConfig.chain.nativeCurrency.symbol} is ready to withdraw.{" "}
          <button className="underline" disabled={!!busy} onClick={() => run("Withdrawing", async () => { await send("withdraw", []); })}>Withdraw</button>
        </Notice>
      )}
      {status === DrawStatus.Invalid && <Notice tone="bad">Someone proved this result wrong on-chain. The draw is void and the bond went to the challenger.</Notice>}
      {status === DrawStatus.Failed && <Notice tone="bad">The seed was not revealed in time. The draw failed and the bond went to the treasury.</Notice>}

      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-xl font-semibold">Entries ({entries.length})</h2>
          {entries.length > 0 && <button className="btn-ghost" onClick={exportReceipts}>Export receipt links</button>}
        </div>
        <p className="text-xs text-muted">Send each entrant their receipt link. It lets them confirm they are in the draw and check their own result. Names and contacts are never published on-chain.</p>
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted">
              <tr><th className="py-1">Name</th><th>Contact</th><th>Entry hash</th><th>Receipt</th><th /></tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-t border-line">
                  <td className="py-1.5">{e.label}{e.source === "signup" && <span className="ml-1 text-xs text-muted">(self)</span>}</td>
                  <td className="text-muted">{e.contact}</td>
                  <td><Hash value={e.entryHash} short /></td>
                  <td><button className="text-xs text-accent underline" onClick={() => navigator.clipboard.writeText(receiptUrl(e.receiptToken))}>copy link</button></td>
                  <td>{!draw.entriesLockedAt && status === DrawStatus.Open && <button className="text-xs text-bad" onClick={() => run("Removing", () => api(`/api/draws/${id}/entries?entryId=${e.id}`, { method: "DELETE" }))}>remove</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {events.length > 0 && (
        <p className="text-xs text-muted">Transactions: {events.map((e) => <span key={e.txHash + e.name} className="mr-3">{e.name} <TxLink hash={e.txHash} /></span>)}</p>
      )}
    </div>
  );
}

export default function ManageDrawPage() {
  const { id } = useParams<{ id: string }>();
  return <SignInGate>{(address) => <Manage id={id} session={address} />}</SignInGate>;
}
