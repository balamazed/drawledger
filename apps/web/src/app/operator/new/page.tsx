"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { parseEventLogs } from "viem";
import { computeMetadataHash, computeSeedCommitment, drawRegistryAbi, randomBytes32 } from "@drawledger/core";
import { SignInGate } from "@/components/SignInGate";
import { Notice } from "@/components/ui";
import { appConfig, isConfigured } from "@/lib/config";
import { api, errorText } from "@/lib/client/api";
import { downloadSecret, saveSecret } from "@/lib/client/secrets";
import { browserPublicClient, connectWallet } from "@/lib/client/wallet";

const PERIODS = [
  { label: "10 minutes (testing)", seconds: 600 },
  { label: "1 hour", seconds: 3600 },
  { label: "24 hours", seconds: 86400 },
  { label: "3 days", seconds: 3 * 86400 },
  { label: "7 days", seconds: 7 * 86400 },
];

function NewDrawForm({ session }: { session: string }) {
  const router = useRouter();
  const [form, setForm] = useState({ title: "", description: "", eligibility: "", prize: "", winnerCount: 1, period: 86400, publicSignup: false, showWinnerLabels: false });
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      setStep("Connecting wallet");
      const { wallet, address } = await connectWallet();
      if (address.toLowerCase() !== session) throw new Error("Your wallet account differs from the signed-in account. Switch account or sign in again.");

      const terms = {
        title: form.title.trim(),
        description: form.description.trim(),
        eligibility: form.eligibility.trim(),
        prize: form.prize.trim(),
        winnerCount: Number(form.winnerCount),
        challengePeriodSeconds: form.period,
        operator: address.toLowerCase(),
        createdAt: new Date().toISOString(),
      };
      const secret = randomBytes32();
      const commitment = computeSeedCommitment(address, secret);
      const stored = { secret, commitment, title: terms.title, chainId: appConfig.chainId, registry: appConfig.registry, operator: address.toLowerCase(), savedAt: new Date().toISOString() };
      saveSecret(stored);
      downloadSecret(stored);

      setStep("Confirm the draw creation in your wallet");
      const client = browserPublicClient();
      const minBond = await client.readContract({ address: appConfig.registry, abi: drawRegistryAbi, functionName: "minBond" });
      const hash = await wallet.writeContract({
        account: address,
        chain: appConfig.chain,
        address: appConfig.registry,
        abi: drawRegistryAbi,
        functionName: "createDraw",
        args: [commitment, computeMetadataHash(terms), terms.winnerCount, BigInt(terms.challengePeriodSeconds)],
        value: minBond,
      });

      setStep("Waiting for MST to confirm");
      const receipt = await client.waitForTransactionReceipt({ hash });
      const [created] = parseEventLogs({ abi: drawRegistryAbi, logs: receipt.logs, eventName: "DrawCreated" });
      if (!created) throw new Error("Transaction confirmed but no draw was created");

      setStep("Saving draw");
      const res = await api<{ id: string }>("/api/draws", {
        method: "POST",
        json: { onchainId: created.args.drawId.toString(), txHash: hash, terms, publicSignup: form.publicSignup, showWinnerLabels: form.showWinnerLabels },
      });
      router.push(`/operator/draws/${res.id}`);
    } catch (err) {
      setError(errorText(err));
      setStep(null);
    }
  }

  return (
    <form onSubmit={submit} className="card max-w-2xl space-y-5">
      <h1 className="font-serif text-3xl font-semibold">New draw</h1>
      {!isConfigured() && <Notice tone="bad">The app has no registry address configured. Set NEXT_PUBLIC_REGISTRY_ADDRESS.</Notice>}
      <div>
        <label className="label" htmlFor="title">Title</label>
        <input id="title" className="input" required minLength={3} maxLength={120} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Block C parking allotment 2026" />
      </div>
      <div>
        <label className="label" htmlFor="description">What is being allotted</label>
        <textarea id="description" className="input" rows={3} maxLength={2000} value={form.description} onChange={(e) => set("description", e.target.value)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="eligibility">Who can enter</label>
          <input id="eligibility" className="input" maxLength={1000} value={form.eligibility} onChange={(e) => set("eligibility", e.target.value)} placeholder="Residents with a registered vehicle" />
        </div>
        <div>
          <label className="label" htmlFor="prize">Prize or allocation</label>
          <input id="prize" className="input" maxLength={200} value={form.prize} onChange={(e) => set("prize", e.target.value)} placeholder="One covered parking slot" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="winners">Number of winners</label>
          <input id="winners" type="number" min={1} max={10000} required className="input" value={form.winnerCount} onChange={(e) => set("winnerCount", Number(e.target.value))} />
        </div>
        <div>
          <label className="label" htmlFor="period">Challenge window after the result</label>
          <select id="period" className="input" value={form.period} onChange={(e) => set("period", Number(e.target.value))}>
            {PERIODS.map((p) => <option key={p.seconds} value={p.seconds}>{p.label}</option>)}
          </select>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.publicSignup} onChange={(e) => set("publicSignup", e.target.checked)} />
        Let people enter themselves from the public draw page (one entry per email or phone)
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.showWinnerLabels} onChange={(e) => set("showWinnerLabels", e.target.checked)} />
        Show winners&apos; names publicly (otherwise winners see their result only through their receipt)
      </label>
      <Notice>
        Your browser creates a secret seed and downloads a backup file. Keep it: you need it to run the draw, and DrawLedger never sees it. Creating the draw locks a small refundable bond on MST.
      </Notice>
      {error && <Notice tone="bad">{error}</Notice>}
      <button className="btn-primary" disabled={!!step || !isConfigured()}>{step ?? "Create draw on MST"}</button>
      <p className="text-xs text-muted">Network: {appConfig.chain.name} (chain {appConfig.chainId}). Bond returns after the challenge window if nobody proves the result wrong.</p>
    </form>
  );
}

export default function NewDrawPage() {
  return <SignInGate>{(address) => <NewDrawForm session={address} />}</SignInGate>;
}

