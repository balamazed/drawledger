import { notFound } from "next/navigation";
import type { Address } from "viem";
import { STATUS_LABELS, type DrawStatus } from "@drawledger/core";
import { findDraw, publicDrawView } from "@/lib/repo";
import { Hash, StatusBadge, Timeline } from "@/components/ui";
import { VerifyPanel } from "@/components/VerifyPanel";
import { DrawActions } from "./DrawActions";

export const dynamic = "force-dynamic";

function formatDuration(seconds: number) {
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`;
  if (seconds < 2 * 86400) return `${Math.round(seconds / 3600)} hours`;
  return `${Math.round(seconds / 86400)} days`;
}

export default async function PublicDrawPage({ params }: { params: Promise<{ slug: string }> }) {
  const draw = await findDraw({ slug: (await params).slug });
  if (!draw) notFound();
  const v = await publicDrawView(draw);
  const t = v.terms;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-semibold">{v.title}</h1>
          <p className="mt-1 text-sm text-muted">
            Draw #{v.onchainId} on MST · {t.winnerCount} winner(s) from {v.entryCount} entr{v.entryCount === 1 ? "y" : "ies"}
          </p>
        </div>
        <StatusBadge status={v.status} />
      </div>

      <Timeline status={v.status} events={v.events} />

      <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
        <section className="card space-y-3">
          <h2 className="font-serif text-xl font-semibold">Terms</h2>
          {t.description && <p className="whitespace-pre-line text-sm">{t.description}</p>}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {t.prize && (<><dt className="text-muted">Allocation</dt><dd>{t.prize}</dd></>)}
            {t.eligibility && (<><dt className="text-muted">Who can enter</dt><dd>{t.eligibility}</dd></>)}
            <dt className="text-muted">Winners</dt><dd>{t.winnerCount}</dd>
            <dt className="text-muted">Challenge window</dt><dd>{formatDuration(t.challengePeriodSeconds)} after the result</dd>
            <dt className="text-muted">Organiser</dt><dd><Hash value={v.operator} short /></dd>
            <dt className="text-muted">Terms hash</dt><dd><Hash value={draw.metadata_hash} short /></dd>
          </dl>
          <p className="text-xs text-muted">The terms above were hashed and committed on MST when the draw was created, so they cannot be edited later.</p>
        </section>
        <DrawActions slug={v.slug} publicSignup={v.publicSignup} status={v.status} />
      </div>

      {v.winners && (
        <section className="card space-y-3">
          <h2 className="font-serif text-xl font-semibold">Winners</h2>
          <p className="text-xs text-muted">Ranked by lowest score. Entrants identify themselves through their receipt; names appear only if the organiser chose to show them.</p>
          <ol className="space-y-1 text-sm">
            {v.winners.map((w) => (
              <li key={w.entryHash} className="flex items-center gap-3">
                <span className="w-8 text-muted">#{w.rank}</span>
                {w.label && <span className="font-medium">{w.label}</span>}
                <Hash value={w.entryHash} short />
              </li>
            ))}
          </ol>
        </section>
      )}
      {v.winnersMatch === false && (
        <section className="card text-sm text-bad">The result on MST does not match the winners list held by DrawLedger. Use the verifier below.</section>
      )}

      <section className="card space-y-3">
        <h2 className="font-serif text-xl font-semibold">Verify independently</h2>
        <p className="text-sm text-muted">
          Status on MST: {STATUS_LABELS[v.status as DrawStatus]}. Your browser can re-read every commitment from the chain and recompute the winners without trusting this site. Entry list root:{" "}
          {v.entriesRoot ? <Hash value={v.entriesRoot} short /> : "not committed yet"}.
        </p>
        <VerifyPanel registry={v.registry as Address} onchainId={v.onchainId} />
      </section>
    </div>
  );
}
