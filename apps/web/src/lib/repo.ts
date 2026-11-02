import "server-only";
import { decodeEventLog, type Address, type Hex } from "viem";
import {
  DrawStatus,
  buildEntriesTree,
  computeEntryHash,
  computeMetadataHash,
  computeResult,
  drawRegistryAbi,
  randomBytes32,
  readDraw,
  readDrawEvents,
  winnersFromJson,
  winnersToJson,
  type OnchainDraw,
  type WinnerJson,
} from "@drawledger/core";
import { appConfig } from "./config";
import { db } from "./db";
import { HttpError } from "./http";
import { publicClient } from "./chain-server";
import { randomToken, slugify } from "./ids";
import type { Terms } from "./schemas";

export interface DrawRow {
  id: string;
  slug: string;
  chain_id: number;
  registry: string;
  onchain_id: string;
  operator: string;
  title: string;
  terms: Terms;
  metadata_hash: string;
  winner_count: number;
  public_signup: boolean;
  show_winner_labels: boolean;
  status: number;
  created_tx: string;
  created_block: string;
  entries_locked_at: string | null;
  entries_root: string | null;
  winners: WinnerJson[] | null;
  winners_root: string | null;
  winners_match: boolean | null;
  synced_at: string | null;
  created_at: string;
}

export interface EntryRow {
  id: string;
  draw_id: string;
  label: string;
  contact: string | null;
  salt: string;
  entry_hash: string;
  receipt_token: string;
  source: string;
  created_at: string;
}

// ---------------------------------------------------------------- auth nonces

export async function createNonce() {
  const nonce = randomToken(12).replace(/[^a-zA-Z0-9]/g, "").padEnd(12, "0");
  await (await db()).query("insert into auth_nonces (nonce) values ($1)", [nonce]);
  return nonce;
}

// A nonce works once and only for 10 minutes
export async function consumeNonce(nonce: string) {
  const rows = await (await db()).query(
    "update auth_nonces set used_at = now() where nonce = $1 and used_at is null and created_at > now() - interval '10 minutes' returning nonce",
    [nonce],
  );
  return rows.length === 1;
}

// ---------------------------------------------------------------- draws

export async function registerDraw(input: {
  operator: Address;
  onchainId: bigint;
  txHash: Hex;
  terms: Terms;
  publicSignup: boolean;
  showWinnerLabels: boolean;
}) {
  const client = publicClient();
  const receipt = await client.getTransactionReceipt({ hash: input.txHash }).catch(() => null);
  if (!receipt || receipt.status !== "success") throw new HttpError(400, "Creation transaction not found or failed");
  if (receipt.to?.toLowerCase() !== appConfig.registry.toLowerCase()) throw new HttpError(400, "Transaction was not sent to the registry");

  const created = receipt.logs
    .filter((l) => l.address.toLowerCase() === appConfig.registry.toLowerCase())
    .map((l) => {
      try {
        return decodeEventLog({ abi: drawRegistryAbi, data: l.data, topics: l.topics });
      } catch {
        return null;
      }
    })
    .find((e) => e?.eventName === "DrawCreated");
  if (!created || created.eventName !== "DrawCreated" || created.args.drawId !== input.onchainId) {
    throw new HttpError(400, "Transaction did not create this draw");
  }

  const chain = await readDraw(client, appConfig.registry, input.onchainId);
  if (chain.operator.toLowerCase() !== input.operator.toLowerCase()) throw new HttpError(403, "Draw belongs to another operator");
  if (input.terms.operator.toLowerCase() !== input.operator.toLowerCase()) throw new HttpError(400, "Terms name another operator");
  if (computeMetadataHash(input.terms) !== chain.metadataHash) throw new HttpError(400, "Terms do not match the on-chain metadata hash");
  if (chain.winnerCount !== input.terms.winnerCount) throw new HttpError(400, "Winner count does not match the chain");

  const id = crypto.randomUUID();
  const slug = slugify(input.terms.title, input.onchainId);
  await (await db()).query(
    `insert into draws (id, slug, chain_id, registry, onchain_id, operator, title, terms, metadata_hash, winner_count,
       public_signup, show_winner_labels, status, created_tx, created_block)
     values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15)
     on conflict (chain_id, registry, onchain_id) do nothing`,
    [
      id,
      slug,
      appConfig.chainId,
      appConfig.registry.toLowerCase(),
      input.onchainId.toString(),
      input.operator.toLowerCase(),
      input.terms.title,
      JSON.stringify(input.terms),
      chain.metadataHash,
      chain.winnerCount,
      input.publicSignup,
      input.showWinnerLabels,
      chain.status,
      input.txHash,
      receipt.blockNumber.toString(),
    ],
  );
  const row = await findDraw({ onchainId: input.onchainId });
  if (!row) throw new HttpError(500, "Draw was not stored");
  await syncDraw(row);
  return row;
}

export async function findDraw(by: { id?: string; slug?: string; onchainId?: bigint; registry?: string }): Promise<DrawRow | null> {
  const d = await db();
  let rows: DrawRow[] = [];
  if (by.id) rows = await d.query<DrawRow>("select * from draws where id = $1", [by.id]);
  else if (by.slug) rows = await d.query<DrawRow>("select * from draws where slug = $1", [by.slug]);
  else if (by.onchainId !== undefined)
    rows = await d.query<DrawRow>("select * from draws where chain_id = $1 and registry = $2 and onchain_id = $3", [
      appConfig.chainId,
      (by.registry ?? appConfig.registry).toLowerCase(),
      by.onchainId.toString(),
    ]);
  return rows[0] ? normalize(rows[0]) : null;
}

// int8 columns come back as numbers from PGlite and strings from postgres.js
function normalize<T extends DrawRow>(row: T): T {
  return {
    ...row,
    onchain_id: String(row.onchain_id),
    created_block: String(row.created_block),
    terms: parseJson(row.terms),
    winners: parseJson(row.winners),
  };
}

// postgres.js can return jsonb written as text parameters as strings; PGlite returns objects
function parseJson<T>(value: T | string): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : value;
}

export async function listDraws(operator: Address) {
  return (await db()).query<DrawRow & { entry_count: number }>(
    `select d.*, (select count(*)::int from entries e where e.draw_id = d.id) as entry_count
     from draws d where operator = $1 order by created_at desc`,
    [operator.toLowerCase()],
  ).then((rows) => rows.map(normalize));
}

export async function requireOwnedDraw(id: string, operator: Address) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(404, "Draw not found");
  const draw = await findDraw({ id });
  if (!draw || draw.operator !== operator.toLowerCase()) throw new HttpError(404, "Draw not found");
  return draw;
}

export async function updateSettings(draw: DrawRow, s: { publicSignup?: boolean; showWinnerLabels?: boolean }) {
  await (await db()).query(
    "update draws set public_signup = coalesce($2, public_signup), show_winner_labels = coalesce($3, show_winner_labels) where id = $1",
    [draw.id, s.publicSignup ?? null, s.showWinnerLabels ?? null],
  );
}

// ---------------------------------------------------------------- entries

export async function listEntries(drawId: string) {
  return (await db()).query<EntryRow>("select * from entries where draw_id = $1 order by created_at, id", [drawId]);
}

export async function addEntries(draw: DrawRow, items: { label: string; contact?: string }[], source: "operator" | "signup") {
  if (draw.entries_locked_at) throw new HttpError(409, "Entries are locked for this draw");
  const chain = await readDraw(publicClient(), appConfig.registry, BigInt(draw.onchain_id));
  if (chain.status !== DrawStatus.Open) throw new HttpError(409, "Draw is no longer open on-chain");

  const d = await db();
  const created: EntryRow[] = [];
  const skipped: string[] = [];
  for (const item of items) {
    const salt = randomBytes32();
    const entryHash = computeEntryHash(BigInt(draw.onchain_id), salt).toLowerCase();
    const rows = await d.query<EntryRow>(
      `insert into entries (id, draw_id, label, contact, salt, entry_hash, receipt_token, source)
       values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict do nothing returning *`,
      [crypto.randomUUID(), draw.id, item.label, item.contact ?? null, salt, entryHash, randomToken(18), source],
    );
    if (rows[0]) created.push(rows[0]);
    else skipped.push(item.contact ?? item.label);
  }
  return { created, skipped };
}

export async function removeEntry(draw: DrawRow, entryId: string) {
  if (draw.entries_locked_at) throw new HttpError(409, "Entries are locked for this draw");
  await (await db()).query("delete from entries where draw_id = $1 and id = $2", [draw.id, entryId]);
}

export async function orderedEntryHashes(drawId: string): Promise<Hex[]> {
  const rows = await (await db()).query<{ entry_hash: string }>("select entry_hash from entries where draw_id = $1", [drawId]);
  return rows.length ? buildEntriesTree(rows.map((r) => r.entry_hash as Hex)).sorted : [];
}

// Freezes the list and returns the root the operator must commit on-chain
export async function lockEntries(draw: DrawRow, unlock: boolean) {
  const d = await db();
  if (unlock) {
    const chain = await readDraw(publicClient(), appConfig.registry, BigInt(draw.onchain_id));
    if (chain.status !== DrawStatus.Open) throw new HttpError(409, "Entries are already closed on-chain");
    await d.query("update draws set entries_locked_at = null, entries_root = null where id = $1", [draw.id]);
    return null;
  }
  const hashes = await orderedEntryHashes(draw.id);
  if (hashes.length === 0) throw new HttpError(409, "Add at least one entry first");
  const tree = buildEntriesTree(hashes);
  await d.query("update draws set entries_locked_at = coalesce(entries_locked_at, now()), entries_root = $2 where id = $1", [draw.id, tree.root]);
  return { root: tree.root, count: tree.count };
}

// ---------------------------------------------------------------- results

export async function prepareResult(draw: DrawRow) {
  const chain = await readDraw(publicClient(), appConfig.registry, BigInt(draw.onchain_id));
  if (chain.status !== DrawStatus.Revealed) throw new HttpError(409, "The seed must be revealed on-chain first");
  const hashes = await orderedEntryHashes(draw.id);
  const tree = buildEntriesTree(hashes);
  if (tree.root !== chain.entriesRoot || tree.count !== chain.entryCount) {
    throw new HttpError(409, "Stored entries do not match the on-chain entries root");
  }
  const result = computeResult(chain.seed, tree.sorted, chain.winnerCount);
  await (await db()).query("update draws set winners = $2::jsonb, winners_root = $3 where id = $1", [
    draw.id,
    JSON.stringify(winnersToJson(result.winners)),
    result.root,
  ]);
  return { cutoff: result.cutoff, root: result.root, count: result.count };
}

// ---------------------------------------------------------------- chain sync

export async function syncDraw(draw: DrawRow): Promise<{ draw: DrawRow; chain: OnchainDraw }> {
  const client = publicClient();
  const chain = await readDraw(client, appConfig.registry, BigInt(draw.onchain_id));
  const events = await readDrawEvents(client, appConfig.registry, BigInt(draw.onchain_id), BigInt(draw.created_block));
  const d = await db();
  for (const e of events) {
    await d.query("insert into draw_events (draw_id, name, tx_hash, block_number) values ($1,$2,$3,$4) on conflict do nothing", [
      draw.id,
      e.name,
      e.txHash,
      e.blockNumber.toString(),
    ]);
  }
  const winnersMatch = chain.status >= DrawStatus.Published && chain.status !== DrawStatus.Failed ? draw.winners_root === chain.winnersRoot : null;
  const lockedRoot = chain.status >= DrawStatus.Closed && !draw.entries_root ? chain.entriesRoot : draw.entries_root;
  await d.query(
    "update draws set status = $2, winners_match = $3, entries_root = $4, entries_locked_at = case when $2 >= 2 then coalesce(entries_locked_at, now()) else entries_locked_at end, synced_at = now() where id = $1",
    [draw.id, chain.status, winnersMatch, lockedRoot],
  );
  return { draw: (await findDraw({ id: draw.id }))!, chain };
}

export async function listEvents(drawId: string) {
  return (await db()).query<{ name: string; tx_hash: string; block_number: string }>(
    "select name, tx_hash, block_number::text as block_number from draw_events where draw_id = $1 order by block_number, name",
    [drawId],
  );
}

// ---------------------------------------------------------------- public views

export function publishedWinners(draw: DrawRow) {
  return draw.winners && draw.winners_match ? winnersFromJson(draw.winners) : null;
}

export async function publicDrawView(draw: DrawRow) {
  const [events, entryCount] = await Promise.all([
    listEvents(draw.id),
    (await db()).query<{ n: number }>("select count(*)::int as n from entries where draw_id = $1", [draw.id]),
  ]);
  const winners = publishedWinners(draw);
  let labels = new Map<string, string>();
  if (winners && draw.show_winner_labels) {
    const rows = await (await db()).query<{ entry_hash: string; label: string }>(
      "select entry_hash, label from entries where draw_id = $1 and entry_hash = any($2)",
      [draw.id, winners.map((w) => w.entryHash)],
    );
    labels = new Map(rows.map((r) => [r.entry_hash, r.label]));
  }
  return {
    slug: draw.slug,
    title: draw.title,
    terms: draw.terms,
    chainId: draw.chain_id,
    registry: draw.registry,
    onchainId: draw.onchain_id,
    operator: draw.operator,
    status: draw.status,
    publicSignup: draw.public_signup && !draw.entries_locked_at && draw.status === DrawStatus.Open,
    entryCount: entryCount[0]?.n ?? 0,
    entriesRoot: draw.entries_root,
    winnersMatch: draw.winners_match,
    winners: winners?.map((w, i) => ({ rank: i + 1, entryHash: w.entryHash, score: w.score.toString(), label: labels.get(w.entryHash) ?? null })) ?? null,
    events: events.map((e) => ({ name: e.name, txHash: e.tx_hash, blockNumber: e.block_number })),
    syncedAt: draw.synced_at,
  };
}

export async function findReceipt(token: string) {
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(token)) return null;
  const rows = await (await db()).query<EntryRow & { slug: string; onchain_id: string; title: string }>(
    `select e.*, d.slug, d.onchain_id::text as onchain_id, d.title from entries e join draws d on d.id = e.draw_id where e.receipt_token = $1`,
    [token],
  );
  return rows[0] ?? null;
}
