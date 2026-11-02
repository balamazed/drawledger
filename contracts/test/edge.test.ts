import assert from "node:assert/strict";
import type { Hex } from "viem";
import {
  EMPTY_ENTRY_PROOF,
  EMPTY_WINNER_PROOF,
  computeResult,
  entryProofAt,
  entryProofFor,
  scoreOf,
  winnerProofAt,
  winnersTreeFromOrdered,
  type Winner,
} from "@drawledger/core";
import { createDraw, deploy, expectRevert, mine, runToReveal, type Fixture } from "./helpers";

// Boundary branches of the challenge logic and parameter checks
describe("DrawRegistry edge cases", () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await deploy();
  });
  const asEntrant = () => ({ account: f.entrant.account });

  async function publish(drawId: bigint, winners: Winner[], cutoff: bigint) {
    const tree = winnersTreeFromOrdered(winners);
    await f.registry.write.publishResult([drawId, cutoff, tree.root, winners.length], { account: f.operator.account });
    return tree;
  }

  it("proves an excluded entry that sorts before the first winner", async () => {
    const { drawId, entries, seed } = await runToReveal(f, 3, 12);
    const four = computeResult(seed, entries.sorted, 4).winners;
    const list = four.slice(1);
    const tree = await publish(drawId, list, list[2].score);
    await f.registry.write.challengeExcludedEntry([drawId, entryProofFor(entries, four[0].entryHash), false, EMPTY_WINNER_PROOF, true, winnerProofAt(list, tree, 0)], asEntrant());
    assert.equal((await f.registry.read.getDraw([drawId])).status, 6);
  });

  it("proves an excluded entry that sorts after the last winner but under the cutoff", async () => {
    const { drawId, entries, seed } = await runToReveal(f, 3, 12);
    const four = computeResult(seed, entries.sorted, 4).winners;
    const list = four.slice(0, 3);
    const tree = await publish(drawId, list, four[3].score);
    await f.registry.write.challengeExcludedEntry([drawId, entryProofFor(entries, four[3].entryHash), true, winnerProofAt(list, tree, 2), false, EMPTY_WINNER_PROOF], asEntrant());
    assert.equal((await f.registry.read.getDraw([drawId])).status, 6);
  });

  it("rejects malformed exclusion brackets", async () => {
    const { drawId, entries, seed } = await runToReveal(f, 3, 12);
    const four = computeResult(seed, entries.sorted, 4).winners;
    const list = [four[0], four[2], four[3]];
    const tree = await publish(drawId, list, four[3].score);
    const victim = entryProofFor(entries, four[1].entryHash);
    await expectRevert(f.registry.write.challengeExcludedEntry([drawId, victim, false, EMPTY_WINNER_PROOF, false, EMPTY_WINNER_PROOF], asEntrant()), "InvalidProof");
    await expectRevert(f.registry.write.challengeExcludedEntry([drawId, victim, true, winnerProofAt(list, tree, 0), true, winnerProofAt(list, tree, 2)], asEntrant()), "NoFault|InvalidProof");
    await expectRevert(f.registry.write.challengeExcludedEntry([drawId, victim, false, EMPTY_WINNER_PROOF, true, winnerProofAt(list, tree, 1)], asEntrant()), "InvalidProof");
    await expectRevert(f.registry.write.challengeExcludedEntry([drawId, victim, true, winnerProofAt(list, tree, 0), false, EMPTY_WINNER_PROOF], asEntrant()), "InvalidProof");
  });

  it("proves unknown winners at both ends of the entry list", async () => {
    for (const ghost of [`0x${"0".repeat(63)}1`, `0x${"f".repeat(64)}`] as Hex[]) {
      const g = await deploy();
      f = g;
      const { drawId, entries, seed, result } = await runToReveal(g, 2, 8);
      const list = [...result.winners.slice(0, 1), { entryHash: ghost, score: scoreOf(seed, ghost) }].sort((a, b) => (a.score < b.score ? -1 : 1));
      const tree = await publish(drawId, list, list[1].score);
      const gi = list.findIndex((w) => w.entryHash === ghost);
      const low = ghost.endsWith("1");
      await g.registry.write.challengeUnknownWinner(
        [drawId, winnerProofAt(list, tree, gi), !low, low ? EMPTY_ENTRY_PROOF : entryProofAt(entries, entries.count - 1), low, low ? entryProofAt(entries, 0) : EMPTY_ENTRY_PROOF],
        { account: g.entrant.account },
      );
      assert.equal((await g.registry.read.getDraw([drawId])).status, 6);
    }
  });

  it("rejects publish with a zero root and score reads before reveal", async () => {
    const { drawId, secret } = await createDraw(f, 2);
    await expectRevert(f.registry.read.scoreOf([drawId, `0x${"1".repeat(64)}`]), "WrongStatus");
    await f.registry.write.closeEntries([drawId, `0x${"2".repeat(64)}`, 4], { account: f.operator.account });
    await mine(4);
    await f.registry.write.reveal([drawId, secret], { account: f.operator.account });
    await expectRevert(f.registry.write.publishResult([drawId, 1n, `0x${"0".repeat(64)}`, 2], { account: f.operator.account }), "BadParameter");
  });

  it("lets the treasury withdraw a forfeited bond", async () => {
    const { drawId } = await createDraw(f, 2);
    await f.registry.write.closeEntries([drawId, `0x${"2".repeat(64)}`, 4], { account: f.operator.account });
    await mine(260);
    await f.registry.write.markRevealMissed([drawId]);
    await f.registry.write.withdraw({ account: f.treasury.account });
    assert.equal(await f.registry.read.withdrawable([f.treasury.account.address]), 0n);
  });
});
