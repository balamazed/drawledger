import type { Address, Hex } from "viem";
import { compareHex, computeSeedCommitment, deriveSeed, scoreOf } from "./hashing";
import { PositionalTree, entryLeaf, winnerLeaf } from "./merkle";

export const ZERO_HASH: Hex = "0x0000000000000000000000000000000000000000000000000000000000000000";

export enum DrawStatus {
  None = 0,
  Open = 1,
  Closed = 2,
  Revealed = 3,
  Published = 4,
  Finalized = 5,
  Invalid = 6,
  Failed = 7,
}

export const STATUS_LABELS: Record<DrawStatus, string> = {
  [DrawStatus.None]: "Not found",
  [DrawStatus.Open]: "Open for entries",
  [DrawStatus.Closed]: "Entries closed",
  [DrawStatus.Revealed]: "Seed revealed",
  [DrawStatus.Published]: "Result published",
  [DrawStatus.Finalized]: "Final",
  [DrawStatus.Invalid]: "Invalid (challenged)",
  [DrawStatus.Failed]: "Failed (seed not revealed)",
};

export enum Fault {
  None = 0,
  ExcludedEntry = 1,
  UnknownWinner = 2,
  WrongScore = 3,
  UnsortedWinners = 4,
  UnsortedEntries = 5,
}

export interface OnchainDraw {
  operator: Address;
  status: number;
  winnerCount: number;
  entryCount: number;
  publishedWinners: number;
  targetBlock: bigint;
  challengePeriod: bigint;
  challengeDeadline: bigint;
  bond: bigint;
  seedCommitment: Hex;
  metadataHash: Hex;
  entriesRoot: Hex;
  seed: Hex;
  winnersRoot: Hex;
  cutoff: bigint;
}

export interface Winner {
  entryHash: Hex;
  score: bigint;
}

export interface EntryProofArg {
  index: bigint;
  entryHash: Hex;
  proof: Hex[];
}

export interface WinnerProofArg {
  index: bigint;
  score: bigint;
  entryHash: Hex;
  proof: Hex[];
}

export const EMPTY_ENTRY_PROOF: EntryProofArg = { index: 0n, entryHash: ZERO_HASH, proof: [] };
export const EMPTY_WINNER_PROOF: WinnerProofArg = { index: 0n, score: 0n, entryHash: ZERO_HASH, proof: [] };

// ---------------------------------------------------------------- building

export interface EntriesTree {
  sorted: Hex[];
  tree: PositionalTree;
  root: Hex;
  count: number;
}

export function sortEntryHashes(entryHashes: Hex[]): Hex[] {
  const sorted = entryHashes.map((h) => h.toLowerCase() as Hex).sort(compareHex);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1]) throw new Error(`duplicate entry hash ${sorted[i]}`);
  }
  return sorted;
}

// Tree over entries in the order given; use sortEntryHashes first when building a new draw
export function entriesTreeFromOrdered(ordered: Hex[]): EntriesTree {
  const tree = new PositionalTree(ordered.map(entryLeaf));
  return { sorted: ordered, tree, root: tree.root, count: ordered.length };
}

export function buildEntriesTree(entryHashes: Hex[]): EntriesTree {
  return entriesTreeFromOrdered(sortEntryHashes(entryHashes));
}

export interface DrawResult {
  winners: Winner[];
  cutoff: bigint;
  tree: PositionalTree;
  root: Hex;
  count: number;
}

export function winnersTreeFromOrdered(winners: Winner[]): PositionalTree {
  return new PositionalTree(winners.map((w) => winnerLeaf(w.score, w.entryHash)));
}

// Winners are the min(k, n) entries with the lowest score, listed in ascending score order
export function computeResult(seed: Hex, entryHashes: Hex[], winnerCount: number): DrawResult {
  if (entryHashes.length === 0) throw new Error("no entries");
  const scored = entryHashes.map((entryHash) => ({ entryHash: entryHash.toLowerCase() as Hex, score: scoreOf(seed, entryHash) }));
  scored.sort((a, b) => (a.score < b.score ? -1 : a.score > b.score ? 1 : 0));
  const winners = scored.slice(0, Math.min(winnerCount, scored.length));
  const tree = winnersTreeFromOrdered(winners);
  return { winners, cutoff: winners[winners.length - 1].score, tree, root: tree.root, count: winners.length };
}

export function entryProofAt(entries: EntriesTree, index: number): EntryProofArg {
  return { index: BigInt(index), entryHash: entries.sorted[index], proof: entries.tree.proof(index) };
}

export function entryProofFor(entries: EntriesTree, entryHash: Hex): EntryProofArg {
  const index = entries.sorted.indexOf(entryHash.toLowerCase() as Hex);
  if (index < 0) throw new Error("entry not in tree");
  return entryProofAt(entries, index);
}

export function winnerProofAt(winners: Winner[], tree: PositionalTree, index: number): WinnerProofArg {
  const w = winners[index];
  return { index: BigInt(index), score: w.score, entryHash: w.entryHash, proof: tree.proof(index) };
}

// ---------------------------------------------------------------- entrant self-check

export interface EntrantCheck {
  included: boolean;
  entryIndex?: number;
  score?: bigint;
  won?: boolean;
  rank?: number;
  shouldHaveWon?: boolean;
}

export function checkEntrant(params: {
  entryHash: Hex;
  orderedEntries: Hex[];
  draw: Pick<OnchainDraw, "seed" | "cutoff" | "status">;
  publishedWinners?: Winner[];
}): EntrantCheck {
  const h = params.entryHash.toLowerCase() as Hex;
  const entryIndex = params.orderedEntries.findIndex((x) => x.toLowerCase() === h);
  if (entryIndex < 0) return { included: false };
  if (params.draw.seed === ZERO_HASH) return { included: true, entryIndex };
  const score = scoreOf(params.draw.seed, h);
  if (!params.publishedWinners || params.draw.status < DrawStatus.Published) return { included: true, entryIndex, score };
  const rankIndex = params.publishedWinners.findIndex((w) => w.entryHash.toLowerCase() === h);
  const shouldHaveWon = score <= params.draw.cutoff;
  return {
    included: true,
    entryIndex,
    score,
    won: rankIndex >= 0,
    rank: rankIndex >= 0 ? rankIndex + 1 : undefined,
    shouldHaveWon,
  };
}

// ---------------------------------------------------------------- full verification

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

export interface VerificationReport {
  ok: boolean;
  checks: Check[];
  challenge: ChallengePlan | null;
}

export type ChallengePlan =
  | { fault: Fault.UnsortedEntries; fn: "challengeUnsortedEntries"; args: [bigint, EntryProofArg, EntryProofArg] }
  | { fault: Fault.UnsortedWinners; fn: "challengeUnsortedWinners"; args: [bigint, WinnerProofArg, WinnerProofArg] }
  | { fault: Fault.WrongScore; fn: "challengeWrongScore"; args: [bigint, WinnerProofArg] }
  | {
      fault: Fault.UnknownWinner;
      fn: "challengeUnknownWinner";
      args: [bigint, WinnerProofArg, boolean, EntryProofArg, boolean, EntryProofArg];
    }
  | {
      fault: Fault.ExcludedEntry;
      fn: "challengeExcludedEntry";
      args: [bigint, EntryProofArg, boolean, WinnerProofArg, boolean, WinnerProofArg];
    };

export interface VerifyInput {
  drawId: bigint;
  draw: OnchainDraw;
  orderedEntries: Hex[];
  reveal?: { secret: Hex; targetBlockHash: Hex };
  publishedWinners?: Winner[];
}

export function verifyDraw(input: VerifyInput): VerificationReport {
  const { draw, drawId } = input;
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

  if (draw.status < DrawStatus.Closed || draw.status === DrawStatus.None) {
    add("status", false, `Draw is ${STATUS_LABELS[draw.status as DrawStatus] ?? draw.status}; nothing to verify yet`);
    return { ok: false, checks, challenge: null };
  }

  const entries = input.orderedEntries.length > 0 ? entriesTreeFromOrdered(input.orderedEntries) : null;
  const entriesMatch = !!entries && entries.root === draw.entriesRoot && entries.count === draw.entryCount;
  add(
    "entries",
    entriesMatch,
    entriesMatch
      ? `Published list of ${draw.entryCount} entries matches the on-chain entries root`
      : "Published entry list does not match the on-chain entries root and count",
  );

  if (input.reveal) {
    const commitOk = computeSeedCommitment(draw.operator, input.reveal.secret) === draw.seedCommitment;
    add("commitment", commitOk, commitOk ? "Revealed secret matches the commitment made at creation" : "Secret does not match commitment");
    const seed = deriveSeed(drawId, input.reveal.secret, input.reveal.targetBlockHash);
    const seedOk = seed === draw.seed;
    add("seed", seedOk, seedOk ? `Seed = hash(draw, secret, block ${draw.targetBlock} hash)` : "Seed does not match its inputs");
  }

  if (draw.status < DrawStatus.Published || draw.status === DrawStatus.Failed) {
    return { ok: checks.every((c) => c.ok), checks, challenge: null };
  }

  if (!entries || !entriesMatch) return { ok: false, checks, challenge: null };

  const expected = computeResult(draw.seed, entries.sorted, draw.winnerCount);
  const resultOk = expected.root === draw.winnersRoot && expected.cutoff === draw.cutoff && expected.count === draw.publishedWinners;
  add(
    "result",
    resultOk,
    resultOk
      ? `Independent recomputation gives the same ${expected.count} winners and cutoff`
      : "Published result differs from an independent recomputation",
  );

  let challenge: ChallengePlan | null = null;
  if (!resultOk && input.publishedWinners) {
    const published = winnersTreeFromOrdered(input.publishedWinners);
    const listOk = published.root === draw.winnersRoot && input.publishedWinners.length === draw.publishedWinners;
    add("winners-list", listOk, listOk ? "Published winners list matches the on-chain winners root" : "Published winners list does not match on-chain root");
    if (listOk) challenge = planChallenge({ drawId, draw, orderedEntries: input.orderedEntries, publishedWinners: input.publishedWinners });
  }

  return { ok: checks.every((c) => c.ok), checks, challenge };
}

// Finds one provable fault in a published result, given the exact lists behind both on-chain roots
export function planChallenge(params: {
  drawId: bigint;
  draw: Pick<OnchainDraw, "seed" | "cutoff">;
  orderedEntries: Hex[];
  publishedWinners: Winner[];
}): ChallengePlan | null {
  const { drawId, draw } = params;
  const entries = entriesTreeFromOrdered(params.orderedEntries.map((h) => h.toLowerCase() as Hex));
  const winners = params.publishedWinners.map((w) => ({ entryHash: w.entryHash.toLowerCase() as Hex, score: w.score }));
  const wTree = winnersTreeFromOrdered(winners);

  for (let i = 0; i + 1 < entries.count; i++) {
    if (compareHex(entries.sorted[i], entries.sorted[i + 1]) >= 0) {
      return { fault: Fault.UnsortedEntries, fn: "challengeUnsortedEntries", args: [drawId, entryProofAt(entries, i), entryProofAt(entries, i + 1)] };
    }
  }
  for (let i = 0; i + 1 < winners.length; i++) {
    if (winners[i].score >= winners[i + 1].score) {
      return { fault: Fault.UnsortedWinners, fn: "challengeUnsortedWinners", args: [drawId, winnerProofAt(winners, wTree, i), winnerProofAt(winners, wTree, i + 1)] };
    }
  }
  for (let i = 0; i < winners.length; i++) {
    const w = winners[i];
    if (w.score !== scoreOf(draw.seed, w.entryHash) || w.score > draw.cutoff) {
      return { fault: Fault.WrongScore, fn: "challengeWrongScore", args: [drawId, winnerProofAt(winners, wTree, i)] };
    }
  }

  const entrySet = new Set(entries.sorted);
  for (let i = 0; i < winners.length; i++) {
    const w = winners[i];
    if (entrySet.has(w.entryHash)) continue;
    const upperIdx = entries.sorted.findIndex((h) => compareHex(h, w.entryHash) > 0);
    const hasUpper = upperIdx >= 0;
    const lowerIdx = hasUpper ? upperIdx - 1 : entries.count - 1;
    const hasLower = lowerIdx >= 0;
    return {
      fault: Fault.UnknownWinner,
      fn: "challengeUnknownWinner",
      args: [
        drawId,
        winnerProofAt(winners, wTree, i),
        hasLower,
        hasLower ? entryProofAt(entries, lowerIdx) : EMPTY_ENTRY_PROOF,
        hasUpper,
        hasUpper ? entryProofAt(entries, upperIdx) : EMPTY_ENTRY_PROOF,
      ],
    };
  }

  const winnerSet = new Set(winners.map((w) => w.entryHash));
  for (let i = 0; i < entries.count; i++) {
    const h = entries.sorted[i];
    if (winnerSet.has(h)) continue;
    const s = scoreOf(draw.seed, h);
    if (s > draw.cutoff) continue;
    const upperIdx = winners.findIndex((w) => w.score > s);
    const hasUpper = upperIdx >= 0;
    const lowerIdx = hasUpper ? upperIdx - 1 : winners.length - 1;
    const hasLower = lowerIdx >= 0;
    return {
      fault: Fault.ExcludedEntry,
      fn: "challengeExcludedEntry",
      args: [
        drawId,
        entryProofAt(entries, i),
        hasLower,
        hasLower ? winnerProofAt(winners, wTree, lowerIdx) : EMPTY_WINNER_PROOF,
        hasUpper,
        hasUpper ? winnerProofAt(winners, wTree, upperIdx) : EMPTY_WINNER_PROOF,
      ],
    };
  }
  return null;
}
