import Link from "next/link";

const steps = [
  ["Commit", "The organiser commits a hidden seed and locks a bond on MST before entries close."],
  ["Freeze", "The entry list is frozen as a single Merkle root. Every entrant holds a receipt proving they are in it."],
  ["Draw", "The seed is revealed and mixed with a future block hash. Nobody could know it in advance."],
  ["Check", "Winners are the entries with the lowest hash(seed, entry). Anyone can recompute it, and a wrong result can be overturned on-chain."],
];

const uses = ["Housing society parking and flat allotments", "College club and hackathon seat selection", "Event passes and waitlists", "Scholarship and grant shortlists", "Brand and creator giveaways"];

export default function Home() {
  return (
    <div className="space-y-12">
      <section className="space-y-5 pt-6">
        <h1 className="max-w-3xl font-serif text-4xl font-semibold leading-tight sm:text-5xl">
          Draws that every entrant can check for themselves.
        </h1>
        <p className="max-w-2xl text-lg text-muted">
          DrawLedger fixes the entry list and the random seed on MST Blockchain before anyone can see the result. Entrants get a receipt, check their own outcome, and can prove a rigged result on-chain.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/operator" className="btn-primary">Run a draw</Link>
          <Link href="/verify" className="btn-ghost">Verify a draw</Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-4">
        {steps.map(([title, body], i) => (
          <div key={title} className="card">
            <div className="mono text-muted">step {i + 1}</div>
            <h2 className="mt-1 font-serif text-xl font-semibold">{title}</h2>
            <p className="mt-2 text-sm text-muted">{body}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 sm:grid-cols-2">
        <div className="card">
          <h2 className="font-serif text-xl font-semibold">Built for allocations, not gambling</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
            {uses.map((u) => <li key={u}>{u}</li>)}
          </ul>
          <p className="mt-3 text-sm text-muted">Entry is always free. DrawLedger does not run paid lotteries or games of chance for money.</p>
        </div>
        <div className="card">
          <h2 className="font-serif text-xl font-semibold">Nobody has to be trusted alone</h2>
          <p className="mt-3 text-sm text-muted">
            The organiser cannot pick the seed after seeing the entries, the validator who produces the target block cannot know the organiser&apos;s secret, and DrawLedger&apos;s servers never see the secret at all. Names and contacts stay off-chain; only salted hashes are public.
          </p>
        </div>
      </section>
    </div>
  );
}
