export const metadata = { title: "How DrawLedger works" };

const faults = [
  ["Excluded entry", "An entry scores at or below the cutoff but is missing from the winners. Proved with the entry's Merkle proof and the two neighbouring winners."],
  ["Unknown winner", "A winner is not in the committed entry list. Proved with the two neighbouring entries in the sorted list."],
  ["Wrong score", "A winner's listed score is not hash(seed, entry), or is above the cutoff."],
  ["Unsorted lists", "Two adjacent winners or entries are out of order or duplicated, which the protocol forbids."],
];

export default function HowItWorks() {
  return (
    <article className="mx-auto max-w-3xl space-y-6 text-[15px] leading-relaxed">
      <h1 className="font-serif text-3xl font-semibold">How DrawLedger works</h1>
      <p>Every DrawLedger draw is a sequence of public commitments on MST Blockchain, made in an order that stops anyone from steering the result.</p>
      <ol className="list-decimal space-y-3 pl-6">
        <li><strong>Create.</strong> The organiser&apos;s browser generates a random secret and publishes only its hash, together with a hash of the draw&apos;s terms and a refundable bond. DrawLedger&apos;s servers never see the secret.</li>
        <li><strong>Collect entries.</strong> Each entrant gets a random salt. Their public identifier is hash(draw, salt), so the list reveals nothing about who entered.</li>
        <li><strong>Close.</strong> The sorted list of identifiers is committed as one Merkle root with its count. The contract fixes a target block three blocks ahead.</li>
        <li><strong>Reveal.</strong> After the target block, the organiser reveals the secret. The seed is hash(draw, secret, target block hash). The organiser could not know the block hash when committing; the block producer could not know the secret.</li>
        <li><strong>Publish.</strong> Every entry gets a score, hash(seed, entry). The winners are the entries with the lowest scores. The organiser commits the sorted winners as a second Merkle root with the cutoff score.</li>
        <li><strong>Challenge window.</strong> Anyone can recompute the result. If it is wrong, a single transaction proves it, voids the draw and pays the organiser&apos;s bond to the challenger.</li>
        <li><strong>Final.</strong> After the window, the draw is final and the bond returns to the organiser.</li>
      </ol>
      <h2 className="font-serif text-2xl font-semibold">What can be proven on-chain</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {faults.map(([t, d]) => (
          <div key={t} className="card">
            <h3 className="font-semibold">{t}</h3>
            <p className="mt-1 text-sm text-muted">{d}</p>
          </div>
        ))}
      </div>
      <h2 className="font-serif text-2xl font-semibold">Known limits</h2>
      <ul className="list-disc space-y-2 pl-6">
        <li>The organiser decides who is eligible. DrawLedger proves the draw over the committed list, and every entrant can prove they are on it, but it cannot stop an organiser from adding entries they control. Public sign-up with one entry per contact and published entry counts make this visible.</li>
        <li>If the organiser refuses to reveal after seeing the target block hash, the draw fails publicly and the bond is forfeited. They cannot quietly re-run it.</li>
        <li>A block producer could withhold the target block, but without the organiser&apos;s secret they cannot aim at any outcome.</li>
      </ul>
    </article>
  );
}
