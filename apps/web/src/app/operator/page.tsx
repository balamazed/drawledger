"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { SignInGate } from "@/components/SignInGate";
import { StatusBadge, Notice } from "@/components/ui";
import { api, errorText } from "@/lib/client/api";

interface DrawItem {
  id: string;
  slug: string;
  title: string;
  onchainId: string;
  status: number;
  entryCount: number;
  createdAt: string;
}

function DrawList() {
  const [draws, setDraws] = useState<DrawItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ draws: DrawItem[] }>("/api/draws").then((r) => setDraws(r.draws)).catch((e) => setError(errorText(e)));
  }, []);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl font-semibold">Your draws</h1>
        <Link href="/operator/new" className="btn-primary">New draw</Link>
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      {draws?.length === 0 && <Notice>No draws yet. Create one to get started.</Notice>}
      <div className="grid gap-3">
        {draws?.map((d) => (
          <Link key={d.id} href={`/operator/draws/${d.id}`} className="card flex items-center justify-between hover:border-accent">
            <div>
              <div className="font-medium">{d.title}</div>
              <div className="text-xs text-muted">Draw #{d.onchainId} · {d.entryCount} entries · {new Date(d.createdAt).toLocaleDateString()}</div>
            </div>
            <StatusBadge status={d.status} />
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function OperatorPage() {
  return <SignInGate>{() => <DrawList />}</SignInGate>;
}
