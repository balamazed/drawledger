"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DrawStatus } from "@drawledger/core";
import { Notice } from "@/components/ui";
import { api, errorText } from "@/lib/client/api";

export function DrawActions({ slug, publicSignup, status }: { slug: string; publicSignup: boolean; status: number }) {
  const router = useRouter();
  const [form, setForm] = useState({ label: "", contact: "" });
  const [receipt, setReceipt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setBusy(true);
    try {
      await api(`/api/public/draws/${slug}/sync`, { method: "POST" });
      router.refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function signup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ receiptToken: string }>(`/api/public/draws/${slug}/signup`, { method: "POST", json: form });
      setReceipt(r.receiptToken);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="card space-y-4">
      {publicSignup && status === DrawStatus.Open && !receipt && (
        <form onSubmit={signup} className="space-y-2">
          <h2 className="font-serif text-lg font-semibold">Enter this draw</h2>
          <input className="input" required maxLength={120} placeholder="Your Name" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          <input className="input" required maxLength={200} placeholder="Email or phone" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
          <button className="btn-primary w-full" disabled={busy}>Enter for free</button>
          <p className="text-xs text-muted">Your contact stays with the organiser and is never published.</p>
        </form>
      )}
      {receipt && (
        <Notice tone="good">
          You are in. Save your receipt link, it is the only way to prove your entry:{" "}
          <Link className="underline" href={`/r/${receipt}`}>open your receipt</Link>
        </Notice>
      )}
      {error && <Notice tone="bad">{error}</Notice>}
      <div className="space-y-2 text-sm">
        <h2 className="font-serif text-lg font-semibold">Have a receipt?</h2>
        <p className="text-muted">Open your receipt link to check that you are in the draw and whether you won.</p>
      </div>
      <button className="btn-ghost w-full" onClick={refresh} disabled={busy}>Refresh from MST</button>
    </aside>
  );
}
