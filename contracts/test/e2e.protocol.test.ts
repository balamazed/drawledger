import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import type { Hex } from "viem";
import {
  Fault,
  buildEntriesTree,
  checkEntrant,
  computeEntryHash,
  planChallenge,
  randomBytes32,
  readDraw,
  readDrawEvents,
  readReveal,
  verifyDraw,
  winnersFromJson,
  winnersToJson,
} from "@drawledger/core";
import { PERIOD, createDraw, deploy, mine, time, type Fixture } from "./helpers";

// Simulates organiser, entrants and an independent verifier who only sees public data
describe("End-to-end protocol", () => {
  const gas: Record<string, Record<string, string>> = {};

  async function gasOf(f: Fixture, label: string, size: string, hash: Hex) {
    const r = await f.publicClient.waitForTransactionReceipt({ hash });
    gas[size] ??= {};
    gas[size][label] = r.gasUsed.toString();
    return r;
  }

  for (const [entrants, winners] of [
    [25, 5],
    [1000, 50],
    [5000, 100],
  ] as const) {
    it(`runs a ${entrants}-entrant draw for ${winners} winners and verifies it from public data only`, async () => {
      const f = await deploy();
      const size = `${entrants}x${winners}`;
      const startBlock = await f.publicClient.getBlockNumber();
      const { drawId, secret } = await createDraw(f, winners);

      // Organiser side: entrants receive salts, only hashes go public
      const salts = Array.from({ length: entrants }, () => randomBytes32());
      const hashes = salts.map((s) => computeEntryHash(drawId, s));
      const entries = buildEntriesTree(hashes);
      await gasOf(f, "closeEntries", size, await f.registry.write.closeEntries([drawId, entries.root, entries.count], { account: f.operator.account }));
      await mine(4);
      await gasOf(f, "reveal", size, await f.registry.write.reveal([drawId, secret], { account: f.operator.account }));

      const onchain = await readDraw(f.publicClient, f.registry.address, drawId);
      const { computeResult } = await import("@drawledger/core");
      const result = computeResult(onchain.seed, entries.sorted, winners);
      await gasOf(
        f,
        "publishResult",
        size,
        await f.registry.write.publishResult([drawId, result.cutoff, result.root, result.count], { account: f.operator.account }),
      );

      // Public data as the app would serve it, round-tripped through JSON
      const publicEntries = JSON.parse(JSON.stringify(entries.sorted)) as Hex[];
      const publicWinners = winnersFromJson(JSON.parse(JSON.stringify(winnersToJson(result.winners))));

      // Independent verifier
      const draw = await readDraw(f.publicClient, f.registry.address, drawId);
      const reveal = await readReveal(f.publicClient, f.registry.address, drawId, startBlock);
      assert.ok(reveal, "reveal event found");
      const report = verifyDraw({ drawId, draw, orderedEntries: publicEntries, reveal: reveal!, publishedWinners: publicWinners });
      assert.ok(report.ok, JSON.stringify(report.checks));

      // Every entrant can check themselves with their salt
      const wonCount = salts.filter((s) => checkEntrant({ entryHash: computeEntryHash(drawId, s), orderedEntries: publicEntries, draw, publishedWinners: publicWinners }).won).length;
      assert.equal(wonCount, winners);

      const events = await readDrawEvents(f.publicClient, f.registry.address, drawId, startBlock);
      assert.deepEqual(events.map((e) => e.name), ["DrawCreated", "EntriesClosed", "SeedRevealed", "ResultPublished"]);

      await time.increase(Number(PERIOD) + 1);
      await gasOf(f, "finalize", size, await f.registry.write.finalize([drawId]));
      assert.equal((await readDraw(f.publicClient, f.registry.address, drawId)).status, 5);
    });
  }

  it("an entrant overturns a rigged 1000-entrant draw on-chain", async () => {
    const f = await deploy();
    const { drawId, secret } = await createDraw(f, 50);
    const salts = Array.from({ length: 1000 }, () => randomBytes32());
    const entries = buildEntriesTree(salts.map((s) => computeEntryHash(drawId, s)));
    await f.registry.write.closeEntries([drawId, entries.root, entries.count], { account: f.operator.account });
    await mine(4);
    await f.registry.write.reveal([drawId, secret], { account: f.operator.account });
    const draw = await readDraw(f.publicClient, f.registry.address, drawId);
    const { computeResult } = await import("@drawledger/core");
    const honest = computeResult(draw.seed, entries.sorted, 50);

    // Operator swaps the 10th winner for the 51st-best entry, keeping a self-consistent tree
    const all = computeResult(draw.seed, entries.sorted, 51);
    const rigged = [...honest.winners.slice(0, 9), ...honest.winners.slice(10), all.winners[50]];
    const { winnersTreeFromOrdered } = await import("@drawledger/core");
    const tree = winnersTreeFromOrdered(rigged);
    await f.registry.write.publishResult([drawId, rigged[rigged.length - 1].score, tree.root, 50], { account: f.operator.account });

    const victim = honest.winners[9].entryHash;
    const published = await readDraw(f.publicClient, f.registry.address, drawId);
    const self = checkEntrant({ entryHash: victim, orderedEntries: entries.sorted, draw: published, publishedWinners: rigged });
    assert.deepEqual([self.won, self.shouldHaveWon], [false, true]);

    const plan = planChallenge({ drawId, draw: published, orderedEntries: entries.sorted, publishedWinners: rigged });
    assert.equal(plan!.fault, Fault.ExcludedEntry);
    const hash = await f.registry.write.challengeExcludedEntry(plan!.args as never, { account: f.entrant.account });
    await gasOf(f, "challengeExcludedEntry", "1000x50", hash);
    assert.equal((await readDraw(f.publicClient, f.registry.address, drawId)).status, 6);
  });

  after(() => {
    const dir = path.join(__dirname, "../reports");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "e2e-gas.json"), JSON.stringify(gas, null, 2));
    console.log("Gas used per transaction:", JSON.stringify(gas, null, 2));
  });
});
