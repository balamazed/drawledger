import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { createPublicClient, createWalletClient, http, parseEventLogs, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import {
  DrawStatus,
  checkEntrant,
  computeEntryHash,
  computeMetadataHash,
  computeSeedCommitment,
  drawRegistryAbi,
  localHardhat,
  randomBytes32,
  readDraw,
  readReveal,
  verifyDraw,
  winnersFromJson,
} from "@drawledger/core";

// Runs against a live app (next start) and a local Hardhat node; see docs/testing-report.md
const APP = process.env.APP_URL ?? "http://127.0.0.1:3100";
const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const REGISTRY = (process.env.REGISTRY ?? "0x5FbDB2315678afecb367f032d93F642f64180aa3") as Hex;
// Well-known public Hardhat development keys, never used outside a local node
const OPERATOR_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const OTHER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

const chain = { ...localHardhat, rpcUrls: { default: { http: [RPC] } } };
const pub = createPublicClient({ chain, transport: http(RPC) });

class Session {
  cookie = "";
  async call<T = Record<string, unknown>>(p: string, init: { method?: string; json?: unknown } = {}) {
    const res = await fetch(`${APP}${p}`, {
      method: init.method ?? "GET",
      headers: { "content-type": "application/json", cookie: this.cookie, host: new URL(APP).host },
      body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
    });
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0];
    return { status: res.status, body: (await res.json()) as T };
  }
  async signIn(key: Hex) {
    const account = privateKeyToAccount(key);
    const { body } = await this.call<{ nonce: string }>("/api/auth/nonce");
    const message = createSiweMessage({ domain: new URL(APP).host, address: account.address, uri: APP, version: "1", chainId: 31337, nonce: body.nonce, issuedAt: new Date() });
    const signature = await account.signMessage({ message });
    const r = await this.call("/api/auth/verify", { method: "POST", json: { message, signature } });
    return { ...r, message, signature };
  }
}

async function mine(n: number) {
  for (let i = 0; i < n; i++) await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "evm_mine", params: [] }) });
}

test("operator and entrant journey over HTTP against a live chain", async () => {
  const health = await fetch(`${APP}/api/health`).then((r) => r.json());
  assert.equal(health.ok, true, JSON.stringify(health));

  const op = new Session();
  assert.equal((await op.call("/api/draws")).status, 401, "draw list requires sign-in");

  const login = await op.signIn(OPERATOR_KEY);
  assert.equal(login.status, 200);
  const replay = await new Session().call("/api/auth/verify", { method: "POST", json: { message: login.message, signature: login.signature } });
  assert.equal(replay.status, 401, "a sign-in nonce cannot be replayed");

  // Create the draw on-chain exactly as the browser does
  const account = privateKeyToAccount(OPERATOR_KEY);
  const wallet = createWalletClient({ account, chain, transport: http(RPC) });
  const secret = randomBytes32();
  const terms = { title: "Block C parking allotment", description: "Six covered slots", eligibility: "Residents", prize: "Covered slot", winnerCount: 6, challengePeriodSeconds: 600, operator: account.address.toLowerCase(), createdAt: new Date().toISOString() };
  const minBond = await pub.readContract({ address: REGISTRY, abi: drawRegistryAbi, functionName: "minBond" });
  const txHash = await wallet.writeContract({ address: REGISTRY, abi: drawRegistryAbi, functionName: "createDraw", args: [computeSeedCommitment(account.address, secret), computeMetadataHash(terms), 6, 600n], value: minBond });
  const receipt = await pub.waitForTransactionReceipt({ hash: txHash });
  const onchainId = parseEventLogs({ abi: drawRegistryAbi, logs: receipt.logs, eventName: "DrawCreated" })[0].args.drawId;

  const tampered = await op.call("/api/draws", { method: "POST", json: { onchainId: onchainId.toString(), txHash, terms: { ...terms, prize: "Two slots" } } });
  assert.equal(tampered.status, 400, "terms must hash to the on-chain metadata");

  const created = await op.call<{ id: string; slug: string }>("/api/draws", { method: "POST", json: { onchainId: onchainId.toString(), txHash, terms, publicSignup: true } });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const { id, slug } = created.body;

  const other = new Session();
  await other.signIn(OTHER_KEY);
  assert.equal((await other.call(`/api/draws/${id}`)).status, 404, "another operator cannot see this draw");
  assert.equal((await other.call(`/api/draws/${id}/lock`, { method: "POST", json: {} })).status, 404);

  const people = Array.from({ length: 30 }, (_, i) => ({ label: `Entrant ${String(i + 1).padStart(3, "0")}`, contact: `entrant${i + 1}@example.test` }));
  const added = await op.call<{ added: number; skipped: string[] }>(`/api/draws/${id}/entries`, { method: "POST", json: { entries: [...people, people[0]] } });
  assert.deepEqual([added.status, added.body.added, added.body.skipped.length], [201, 30, 1], "duplicate contact skipped");
  assert.equal((await op.call(`/api/draws/${id}/entries`, { method: "POST", json: { entries: [{ label: "" }] } })).status, 400, "input validated");

  const signup = await new Session().call<{ receiptToken: string }>(`/api/public/draws/${slug}/signup`, { method: "POST", json: { label: "Walk-in entrant", contact: "walkin@example.test" } });
  assert.equal(signup.status, 201);
  const again = await new Session().call(`/api/public/draws/${slug}/signup`, { method: "POST", json: { label: "Walk-in again", contact: "WALKIN@example.test" } });
  assert.equal(again.status, 409, "one entry per contact, case-insensitive");

  const before = await op.call(`/api/public/chain/${REGISTRY}/${onchainId}`);
  assert.deepEqual((before.body as { entries: string[] }).entries, [], "entry list is not public before it is locked");

  const csrf = await fetch(`${APP}/api/draws/${id}/lock`, { method: "POST", headers: { "content-type": "application/json", cookie: op.cookie, origin: "https://evil.example" }, body: "{}" });
  assert.equal(csrf.status, 403, "cross-site writes are rejected");

  // Close
  const lock = await op.call<{ commitment: { root: Hex; count: number } }>(`/api/draws/${id}/lock`, { method: "POST", json: {} });
  assert.equal(lock.body.commitment.count, 31);
  await pub.waitForTransactionReceipt({ hash: await wallet.writeContract({ address: REGISTRY, abi: drawRegistryAbi, functionName: "closeEntries", args: [onchainId, lock.body.commitment.root, lock.body.commitment.count] }) });
  await op.call(`/api/public/draws/${slug}/sync`, { method: "POST" });
  assert.equal((await op.call(`/api/draws/${id}/entries`, { method: "POST", json: { entries: [{ label: "Late" }] } })).status, 409, "no entries after close");
  assert.equal((await op.call(`/api/draws/${id}/result`, { method: "POST" })).status, 409, "no result before reveal");

  // Reveal and publish
  await mine(4);
  await pub.waitForTransactionReceipt({ hash: await wallet.writeContract({ address: REGISTRY, abi: drawRegistryAbi, functionName: "reveal", args: [onchainId, secret] }) });
  const result = await op.call<{ cutoff: string; root: Hex; count: number }>(`/api/draws/${id}/result`, { method: "POST" });
  assert.equal(result.body.count, 6);
  await pub.waitForTransactionReceipt({ hash: await wallet.writeContract({ address: REGISTRY, abi: drawRegistryAbi, functionName: "publishResult", args: [onchainId, BigInt(result.body.cutoff), result.body.root, result.body.count] }) });
  const view = await op.call<{ status: number; winners: { entryHash: Hex }[]; events: { name: string }[]; winnersMatch: boolean }>(`/api/public/draws/${slug}/sync`, { method: "POST" });
  assert.equal(view.body.status, DrawStatus.Published);
  assert.equal(view.body.winnersMatch, true);
  assert.equal(view.body.winners.length, 6);
  assert.deepEqual(view.body.events.map((e) => e.name), ["DrawCreated", "EntriesClosed", "SeedRevealed", "ResultPublished"]);
  assert.ok(!JSON.stringify(view.body).includes("@example.test"), "public view leaks no contacts");

  // Entrant self-check from the receipt alone
  const rcpt = await new Session().call<{ salt: Hex; entryHash: Hex; onchainId: string }>(`/api/receipts/${signup.body.receiptToken}`);
  assert.equal(computeEntryHash(BigInt(rcpt.body.onchainId), rcpt.body.salt), rcpt.body.entryHash);
  const data = (await new Session().call<{ entries: Hex[]; winners: { entryHash: Hex; score: string }[] }>(`/api/public/chain/${REGISTRY}/${onchainId}`)).body;
  const draw = await readDraw(pub, REGISTRY, onchainId);
  const self = checkEntrant({ entryHash: rcpt.body.entryHash, orderedEntries: data.entries, draw, publishedWinners: winnersFromJson(data.winners) });
  assert.equal(self.included, true);
  assert.equal(self.won, self.shouldHaveWon);
  assert.equal((await new Session().call("/api/receipts/not-a-token")).status, 404);

  // Independent verification from public data and the chain
  const report = verifyDraw({ drawId: onchainId, draw, orderedEntries: data.entries, reveal: (await readReveal(pub, REGISTRY, onchainId, 0n)) ?? undefined, publishedWinners: winnersFromJson(data.winners) });
  assert.ok(report.ok, JSON.stringify(report.checks));

  const cli = path.join(__dirname, "../../../packages/core/dist/cli.js");
  const out = execFileSync("node", [cli, "--rpc", RPC, "--registry", REGISTRY, "--draw", onchainId.toString(), "--from-block", "0", "--api", APP], { encoding: "utf8" });
  assert.match(out, /PASS {2}result/);

  const page = await fetch(`${APP}/d/${slug}`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
});
