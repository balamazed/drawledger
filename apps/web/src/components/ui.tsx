"use client";
import { useState } from "react";
import { DrawStatus, STATUS_LABELS } from "@drawledger/core";
import { txLink } from "@/lib/config";

export function Hash({ value, short = false }: { value: string; short?: boolean }) {
  const [copied, setCopied] = useState(false);
  const shown = short ? `${value.slice(0, 10)}…${value.slice(-6)}` : value;
  return (
    <button
      type="button"
      title="Copy"
      onClick={() => navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); })}
      className="mono rounded bg-paper px-1.5 py-0.5 text-left hover:text-accent"
    >
      {copied ? "copied" : shown}
    </button>
  );
}

export function TxLink({ hash, label }: { hash: string; label?: string }) {
  const href = txLink(hash);
  if (!href) return <Hash value={hash} short />;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="mono text-accent underline-offset-2 hover:underline">
      {label ?? `${hash.slice(0, 10)}…${hash.slice(-6)}`}
    </a>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "bad" | "good"; children: React.ReactNode }) {
  const cls = {
    info: "border-line bg-card",
    warn: "border-warn/40 bg-warn-soft text-warn",
    bad: "border-bad/40 bg-bad-soft text-bad",
    good: "border-accent/40 bg-accent-soft text-accent",
  }[tone];
  return <div className={`rounded-md border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}

export function StatusBadge({ status }: { status: number }) {
  const tone =
    status === DrawStatus.Finalized ? "bg-accent-soft text-accent" : status >= DrawStatus.Invalid ? "bg-bad-soft text-bad" : "bg-paper text-ink";
  return <span className={`rounded-full border border-line px-2.5 py-0.5 text-xs font-medium ${tone}`}>{STATUS_LABELS[status as DrawStatus] ?? "Unknown"}</span>;
}

const STEPS = [
  { s: DrawStatus.Open, label: "Created", event: "DrawCreated" },
  { s: DrawStatus.Closed, label: "Entries closed", event: "EntriesClosed" },
  { s: DrawStatus.Revealed, label: "Seed revealed", event: "SeedRevealed" },
  { s: DrawStatus.Published, label: "Result published", event: "ResultPublished" },
  { s: DrawStatus.Finalized, label: "Final", event: "DrawFinalized" },
];

export function Timeline({ status, events }: { status: number; events: { name: string; txHash: string }[] }) {
  const failed = status === DrawStatus.Invalid || status === DrawStatus.Failed;
  return (
    <ol className="grid gap-2 sm:grid-cols-5">
      {STEPS.map((step) => {
        const ev = events.find((e) => e.name === step.event);
        const done = !!ev || (!failed && status >= step.s && step.s !== DrawStatus.Finalized) || status === step.s;
        return (
          <li key={step.label} className={`rounded-md border px-3 py-2 text-sm ${done ? "border-accent/50 bg-accent-soft" : "border-line bg-card"}`}>
            <div className="font-medium">{step.label}</div>
            <div className="mt-1 text-xs text-muted">{ev ? <TxLink hash={ev.txHash} label="view transaction" /> : done ? "done" : "pending"}</div>
          </li>
        );
      })}
      {failed && (
        <li className="rounded-md border border-bad/50 bg-bad-soft px-3 py-2 text-sm text-bad sm:col-span-5">
          {STATUS_LABELS[status as DrawStatus]}
          {events.filter((e) => e.name === "ResultChallenged" || e.name === "RevealMissed").map((e) => (
            <span key={e.txHash}> · <TxLink hash={e.txHash} label="view transaction" /></span>
          ))}
        </li>
      )}
    </ol>
  );
}
