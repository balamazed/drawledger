import { test } from "node:test";
import assert from "node:assert/strict";
import type { Hex } from "viem";
import {
  PositionalTree,
  buildEntriesTree,
  checkEntrant,
  computeEntryHash,
  computeResult,
  computeSeedCommitment,
  deriveSeed,
  depthFor,
  entryLeaf,
  entryProofFor,
  planChallenge,
  randomBytes32,
  scoreOf,
  verifyDraw,
  verifyProof,
  winnerLeaf,
  DrawStatus,
  Fault,
  canonicalJson,
  type OnchainDraw,
} from "../index";

const drawId = 7n;

function makeEntries(n: number): Hex[] {
  return Array.from({ length: n }, () => computeEntryHash(drawId, randomBytes32()));
}

test("depthFor matches powers of two", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 8, 9].map(depthFor), [0, 1, 2, 2, 3, 3, 4]);
});

test("every leaf proof verifies, for odd and even sizes", () => {
  for (const n of [1, 2, 3, 5, 8, 13]) {
    const leaves = makeEntries(n).map(entryLeaf);
    const tree = new PositionalTree(leaves);
    leaves.forEach((leaf, i) => assert.ok(verifyProof(tree.root, n, leaf, i, tree.proof(i)), `n=${n} i=${i}`));
    assert.equal(verifyProof(tree.root, n, leaves[0], n, tree.proof(0)), false, "index past count rejected");
  }
});

test("entries are sorted ascending and duplicates rejected", () => {
  const hashes = makeEntries(20);
  const tree = buildEntriesTree(hashes);
  for (let i = 1; i < tree.sorted.length; i++) assert.ok(BigInt(tree.sorted[i - 1]) < BigInt(tree.sorted[i]));
  assert.throws(() => buildEntriesTree([hashes[0], hashes[0]]), /duplicate/);
});

test("result picks the k lowest scores in ascending order", () => {
  const hashes = makeEntries(50);
  const seed = randomBytes32();
  const result = computeResult(seed, hashes, 5);
  const all = hashes.map((h) => scoreOf(seed, h)).sort((a, b) => (a < b ? -1 : 1));
  assert.deepEqual(result.winners.map((w) => w.score), all.slice(0, 5));
  assert.equal(result.cutoff, all[4]);
  assert.equal(computeResult(seed, hashes.slice(0, 3), 5).count, 3, "k larger than n means everyone wins");
});

test("canonical JSON is key-order independent", () => {
  assert.equal(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] }), canonicalJson({ a: [2, { c: 2, d: 1 }], b: 1 }));
});

function publishedDraw(seed: Hex, entriesRoot: Hex, entryCount: number, k: number, result: ReturnType<typeof computeResult>, operator: Hex, secret: Hex): OnchainDraw {
  return {
    operator: operator as `0x${string}`,
    status: DrawStatus.Published,
    winnerCount: k,
    entryCount,
    publishedWinners: result.count,
    targetBlock: 100n,
    challengePeriod: 600n,
    challengeDeadline: 0n,
    bond: 0n,
    seedCommitment: computeSeedCommitment(operator as `0x${string}`, secret),
    metadataHash: "0x00" as Hex,
    entriesRoot,
    seed,
    winnersRoot: result.root,
    cutoff: result.cutoff,
  };
}

test("an honest draw verifies and yields no challenge", () => {
  const operator = "0x1111111111111111111111111111111111111111" as Hex;
  const secret = randomBytes32();
  const blockHash = randomBytes32();
  const seed = deriveSeed(drawId, secret, blockHash);
  const entries = buildEntriesTree(makeEntries(30));
  const result = computeResult(seed, entries.sorted, 4);
  const draw = publishedDraw(seed, entries.root, entries.count, 4, result, operator, secret);
  const report = verifyDraw({ drawId, draw, orderedEntries: entries.sorted, reveal: { secret, targetBlockHash: blockHash }, publishedWinners: result.winners });
  assert.ok(report.ok, JSON.stringify(report.checks));
  assert.equal(report.challenge, null);
});

test("an excluded winner is detected with a valid bracket", () => {
  const seed = randomBytes32();
  const entries = buildEntriesTree(makeEntries(30));
  const honest = computeResult(seed, entries.sorted, 4);
  const cheated = [...honest.winners.slice(0, 1), ...honest.winners.slice(2)];
  const plan = planChallenge({ drawId, draw: { seed, cutoff: honest.cutoff }, orderedEntries: entries.sorted, publishedWinners: cheated });
  assert.ok(plan);
  assert.equal(plan!.fault, Fault.ExcludedEntry);
});

test("a fake winner, a wrong score and unsorted winners are each detected", () => {
  const seed = randomBytes32();
  const entries = buildEntriesTree(makeEntries(30));
  const honest = computeResult(seed, entries.sorted, 4);

  const fakeHash = computeEntryHash(drawId, randomBytes32());
  const fake = [...honest.winners.slice(0, 3), { entryHash: fakeHash, score: scoreOf(seed, fakeHash) }].sort((a, b) => (a.score < b.score ? -1 : 1));
  const cutoffForFake = fake[fake.length - 1].score > honest.cutoff ? fake[fake.length - 1].score : honest.cutoff;
  const p1 = planChallenge({ drawId, draw: { seed, cutoff: cutoffForFake }, orderedEntries: entries.sorted, publishedWinners: fake });
  assert.ok(p1 && [Fault.UnknownWinner, Fault.ExcludedEntry].includes(p1.fault));

  const wrong = honest.winners.map((w, i) => (i === 0 ? { ...w, score: w.score + 1n } : w));
  assert.equal(planChallenge({ drawId, draw: { seed, cutoff: honest.cutoff }, orderedEntries: entries.sorted, publishedWinners: wrong })!.fault, Fault.WrongScore);

  const unsorted = [honest.winners[1], honest.winners[0], ...honest.winners.slice(2)];
  assert.equal(planChallenge({ drawId, draw: { seed, cutoff: honest.cutoff }, orderedEntries: entries.sorted, publishedWinners: unsorted })!.fault, Fault.UnsortedWinners);
});

test("entrant self-check reports inclusion and outcome", () => {
  const seed = randomBytes32();
  const entries = buildEntriesTree(makeEntries(10));
  const result = computeResult(seed, entries.sorted, 3);
  const winner = result.winners[0].entryHash;
  const check = checkEntrant({ entryHash: winner, orderedEntries: entries.sorted, draw: { seed, cutoff: result.cutoff, status: DrawStatus.Published }, publishedWinners: result.winners });
  assert.deepEqual([check.included, check.won, check.rank], [true, true, 1]);
  const outsider = computeEntryHash(drawId, randomBytes32());
  assert.equal(checkEntrant({ entryHash: outsider, orderedEntries: entries.sorted, draw: { seed, cutoff: result.cutoff, status: DrawStatus.Published } }).included, false);
  const proof = entryProofFor(entries, winner);
  assert.ok(verifyProof(entries.root, entries.count, entryLeaf(winner), Number(proof.index), proof.proof));
  assert.ok(winnerLeaf(1n, winner) !== entryLeaf(winner));
});
