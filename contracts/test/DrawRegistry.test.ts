import assert from "node:assert/strict";
import hre from "hardhat";
import { zeroAddress, type Hex } from "viem";
import {
  EMPTY_ENTRY_PROOF,
  EMPTY_WINNER_PROOF,
  Fault,
  computeEntryHash,
  computeSeedCommitment,
  entriesTreeFromOrdered,
  entryProofAt,
  entryProofFor,
  planChallenge,
  randomBytes32,
  scoreOf,
  winnerProofAt,
  winnersTreeFromOrdered,
  type Winner,
} from "@drawledger/core";
import { MIN_BOND, PERIOD, createDraw, deploy, deriveSeed, expectRevert, makeEntries, mine, runToReveal, time, type Fixture } from "./helpers";

const Status = { Open: 1, Closed: 2, Revealed: 3, Published: 4, Finalized: 5, Invalid: 6, Failed: 7 };

async function publish(f: Fixture, drawId: bigint, winners: Winner[], cutoff: bigint) {
  const tree = winnersTreeFromOrdered(winners);
  await f.registry.write.publishResult([drawId, cutoff, tree.root, winners.length], { account: f.operator.account });
  return tree;
}

describe("DrawRegistry", () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await deploy();
  });

  describe("deployment and creation", () => {
    it("rejects a zero treasury", async () => {
      await expectRevert(hre.viem.deployContract("DrawRegistry", [MIN_BOND, zeroAddress]), "BadParameter");
    });

    it("stores a new draw with its bond and commitment", async () => {
      const { drawId, secret } = await createDraw(f, 5);
      const d = await f.registry.read.getDraw([drawId]);
      assert.equal(d.status, Status.Open);
      assert.equal(d.winnerCount, 5);
      assert.equal(d.bond, MIN_BOND);
      assert.equal(d.operator.toLowerCase(), f.operator.account.address.toLowerCase());
      assert.equal(d.seedCommitment, computeSeedCommitment(f.operator.account.address, secret));
    });

    it("validates bond, commitment, winner count and challenge period", async () => {
      const c = computeSeedCommitment(f.operator.account.address, randomBytes32());
      const m = randomBytes32();
      const acct = { account: f.operator.account };
      await expectRevert(f.registry.write.createDraw([c, m, 1, PERIOD], { ...acct, value: MIN_BOND - 1n }), "BondTooLow");
      await expectRevert(f.registry.write.createDraw([`0x${"0".repeat(64)}` as Hex, m, 1, PERIOD], { ...acct, value: MIN_BOND }), "BadParameter");
      await expectRevert(f.registry.write.createDraw([c, m, 0, PERIOD], { ...acct, value: MIN_BOND }), "BadParameter");
      await expectRevert(f.registry.write.createDraw([c, m, 1, 60n], { ...acct, value: MIN_BOND }), "BadParameter");
      await expectRevert(f.registry.write.createDraw([c, m, 1, 31n * 86400n], { ...acct, value: MIN_BOND }), "BadParameter");
    });
  });

  describe("lifecycle", () => {
    it("runs an honest draw end to end and returns the bond", async () => {
      const { drawId, result, entries } = await runToReveal(f, 3, 12);
      await publish(f, drawId, result.winners, result.cutoff);
      let d = await f.registry.read.getDraw([drawId]);
      assert.equal(d.status, Status.Published);
      assert.equal(d.entryCount, 12);
      assert.equal(planChallenge({ drawId, draw: d, orderedEntries: entries.sorted, publishedWinners: result.winners }), null);

      await expectRevert(f.registry.write.finalize([drawId]), "TooEarly");
      await time.increase(Number(PERIOD) + 1);
      await f.registry.write.finalize([drawId], { account: f.stranger.account });
      d = await f.registry.read.getDraw([drawId]);
      assert.equal(d.status, Status.Finalized);

      assert.equal(await f.registry.read.withdrawable([f.operator.account.address]), MIN_BOND);
      const before = await f.publicClient.getBalance({ address: f.operator.account.address });
      const hash = await f.registry.write.withdraw({ account: f.operator.account });
      const rcpt = await f.publicClient.waitForTransactionReceipt({ hash });
      const after = await f.publicClient.getBalance({ address: f.operator.account.address });
      assert.equal(after - before + rcpt.gasUsed * rcpt.effectiveGasPrice, MIN_BOND);
      await expectRevert(f.registry.write.withdraw({ account: f.operator.account }), "NothingToWithdraw");
    });

    it("derives the seed from the secret and the target block hash", async () => {
      const { drawId, secret } = await runToReveal(f);
      const d = await f.registry.read.getDraw([drawId]);
      const block = await f.publicClient.getBlock({ blockNumber: d.targetBlock });
      assert.equal(d.seed, deriveSeed(drawId, secret, block.hash));
      const someHash = computeEntryHash(drawId, randomBytes32());
      assert.equal(await f.registry.read.scoreOf([drawId, someHash]), scoreOf(d.seed, someHash));
    });

    it("lets everyone win when entries are fewer than winners", async () => {
      const { drawId, result } = await runToReveal(f, 10, 4);
      assert.equal(result.count, 4);
      await publish(f, drawId, result.winners, result.cutoff);
      assert.equal((await f.registry.read.getDraw([drawId])).publishedWinners, 4);
    });

    it("only the operator can close, reveal and publish", async () => {
      const { drawId, secret } = await createDraw(f);
      const root = randomBytes32();
      const s = { account: f.stranger.account };
      await expectRevert(f.registry.write.closeEntries([drawId, root, 5], s), "NotOperator");
      await f.registry.write.closeEntries([drawId, root, 5], { account: f.operator.account });
      await mine(4);
      await expectRevert(f.registry.write.reveal([drawId, secret], s), "NotOperator");
      await f.registry.write.reveal([drawId, secret], { account: f.operator.account });
      await expectRevert(f.registry.write.publishResult([drawId, 1n, root, 3], s), "NotOperator");
    });

    it("enforces status order and close parameters", async () => {
      const { drawId, secret } = await createDraw(f);
      const op = { account: f.operator.account };
      await expectRevert(f.registry.write.reveal([drawId, secret], op), "WrongStatus");
      await expectRevert(f.registry.write.closeEntries([drawId, `0x${"0".repeat(64)}` as Hex, 5], op), "BadParameter");
      await expectRevert(f.registry.write.closeEntries([drawId, randomBytes32(), 0], op), "BadParameter");
      await f.registry.write.closeEntries([drawId, randomBytes32(), 5], op);
      await expectRevert(f.registry.write.closeEntries([drawId, randomBytes32(), 5], op), "WrongStatus");
    });

    it("rejects reveal before the target block and with a wrong secret", async () => {
      const { drawId, secret } = await createDraw(f);
      const op = { account: f.operator.account };
      await f.registry.write.closeEntries([drawId, randomBytes32(), 5], op);
      await expectRevert(f.registry.write.reveal([drawId, secret], op), "TooEarly");
      await mine(4);
      await expectRevert(f.registry.write.reveal([drawId, randomBytes32()], op), "CommitmentMismatch");
    });

    it("fails a draw whose seed is not revealed in time and sends the bond to the treasury", async () => {
      const { drawId, secret } = await createDraw(f);
      const op = { account: f.operator.account };
      await f.registry.write.closeEntries([drawId, randomBytes32(), 5], op);
      await expectRevert(f.registry.write.markRevealMissed([drawId]), "TooEarly");
      await mine(260);
      await expectRevert(f.registry.write.reveal([drawId, secret], op), "TooLate");
      await f.registry.write.markRevealMissed([drawId], { account: f.stranger.account });
      assert.equal((await f.registry.read.getDraw([drawId])).status, Status.Failed);
      assert.equal(await f.registry.read.withdrawable([f.treasury.account.address]), MIN_BOND);
    });

    it("requires the published winner count to equal min(k, entries)", async () => {
      const { drawId, result } = await runToReveal(f, 3, 12);
      await expectRevert(f.registry.write.publishResult([drawId, result.cutoff, result.root, 2], { account: f.operator.account }), "BadParameter");
    });
  });

  describe("challenges", () => {
    async function expectInvalid(drawId: bigint, fault: Fault) {
      const d = await f.registry.read.getDraw([drawId]);
      assert.equal(d.status, Status.Invalid);
      assert.equal(await f.registry.read.withdrawable([f.entrant.account.address]), MIN_BOND);
      const events = await f.registry.getEvents.ResultChallenged();
      assert.equal(events.at(-1)!.args.fault, fault);
    }
    const asEntrant = () => ({ account: f.entrant.account });

    it("proves an eligible entry was left out", async () => {
      const { drawId, entries, result } = await runToReveal(f, 3, 12);
      const cheated = [result.winners[0], result.winners[2]];
      const extra = entries.sorted.find((h) => !result.winners.some((w) => w.entryHash === h))!;
      const fakeList = [...cheated, { entryHash: extra, score: scoreOf((await f.registry.read.getDraw([drawId])).seed, extra) }].sort((a, b) => (a.score < b.score ? -1 : 1));
      await publish(f, drawId, fakeList, fakeList[2].score);
      const d = await f.registry.read.getDraw([drawId]);
      const plan = planChallenge({ drawId, draw: d, orderedEntries: entries.sorted, publishedWinners: fakeList });
      assert.equal(plan!.fault, Fault.ExcludedEntry);
      await f.registry.write.challengeExcludedEntry(plan!.args as never, asEntrant());
      await expectInvalid(drawId, Fault.ExcludedEntry);
    });

    it("proves a winner that never entered", async () => {
      const { drawId, entries, result, seed } = await runToReveal(f, 3, 12);
      let ghost: Hex;
      let ghostScore: bigint;
      do {
        ghost = computeEntryHash(drawId, randomBytes32());
        ghostScore = scoreOf(seed, ghost);
      } while (ghostScore >= result.winners[0].score);
      const list = [{ entryHash: ghost, score: ghostScore }, result.winners[0], result.winners[1]];
      await publish(f, drawId, list, result.winners[1].score);
      const d = await f.registry.read.getDraw([drawId]);
      const plan = planChallenge({ drawId, draw: d, orderedEntries: entries.sorted, publishedWinners: list });
      assert.equal(plan!.fault, Fault.UnknownWinner);
      await f.registry.write.challengeUnknownWinner(plan!.args as never, asEntrant());
      await expectInvalid(drawId, Fault.UnknownWinner);
    });

    it("proves a wrong score", async () => {
      const { drawId, result } = await runToReveal(f, 3, 12);
      const list = result.winners.map((w, i) => (i === 1 ? { ...w, score: w.score - 1n } : w));
      const tree = await publish(f, drawId, list, result.cutoff);
      await f.registry.write.challengeWrongScore([drawId, winnerProofAt(list, tree, 1)], asEntrant());
      await expectInvalid(drawId, Fault.WrongScore);
    });

    it("proves a winner above the published cutoff", async () => {
      const { drawId, result } = await runToReveal(f, 3, 12);
      const tree = await publish(f, drawId, result.winners, result.winners[1].score);
      await f.registry.write.challengeWrongScore([drawId, winnerProofAt(result.winners, tree, 2)], asEntrant());
      await expectInvalid(drawId, Fault.WrongScore);
    });

    it("proves unsorted or duplicated winners", async () => {
      const { drawId, result } = await runToReveal(f, 3, 12);
      const list = [result.winners[0], result.winners[0], result.winners[1]];
      const tree = await publish(f, drawId, list, result.cutoff);
      await f.registry.write.challengeUnsortedWinners([drawId, winnerProofAt(list, tree, 0), winnerProofAt(list, tree, 1)], asEntrant());
      await expectInvalid(drawId, Fault.UnsortedWinners);
    });

    it("proves an unsorted entries tree", async () => {
      const { drawId, secret } = await createDraw(f, 2);
      const { hashes } = makeEntries(drawId, 6);
      const unsorted = entriesTreeFromOrdered([...hashes].sort((a, b) => (BigInt(a) > BigInt(b) ? -1 : 1)));
      await f.registry.write.closeEntries([drawId, unsorted.root, unsorted.count], { account: f.operator.account });
      await mine(4);
      await f.registry.write.reveal([drawId, secret], { account: f.operator.account });
      const seed = (await f.registry.read.getDraw([drawId])).seed;
      const winners = unsorted.sorted.map((h) => ({ entryHash: h, score: scoreOf(seed, h) })).sort((a, b) => (a.score < b.score ? -1 : 1)).slice(0, 2);
      await publish(f, drawId, winners, winners[1].score);
      await f.registry.write.challengeUnsortedEntries([drawId, entryProofAt(unsorted, 0), entryProofAt(unsorted, 1)], asEntrant());
      await expectInvalid(drawId, Fault.UnsortedEntries);
    });

    it("rejects challenges against an honest result", async () => {
      const { drawId, entries, result } = await runToReveal(f, 3, 12);
      const tree = await publish(f, drawId, result.winners, result.cutoff);
      const d = await f.registry.read.getDraw([drawId]);
      const loser = entries.sorted.find((h) => scoreOf(d.seed, h) > result.cutoff)!;
      await expectRevert(
        f.registry.write.challengeExcludedEntry([drawId, entryProofFor(entries, loser), true, winnerProofAt(result.winners, tree, 2), false, EMPTY_WINNER_PROOF], asEntrant()),
        "NoFault",
      );
      await expectRevert(f.registry.write.challengeWrongScore([drawId, winnerProofAt(result.winners, tree, 0)], asEntrant()), "NoFault");
      await expectRevert(f.registry.write.challengeUnsortedWinners([drawId, winnerProofAt(result.winners, tree, 0), winnerProofAt(result.winners, tree, 1)], asEntrant()), "NoFault");
      const w = result.winners[0];
      const idx = entries.sorted.indexOf(w.entryHash);
      await expectRevert(
        f.registry.write.challengeUnknownWinner([drawId, winnerProofAt(result.winners, tree, 0), idx > 0, idx > 0 ? entryProofAt(entries, idx - 1) : EMPTY_ENTRY_PROOF, true, entryProofAt(entries, idx)], asEntrant()),
        "NoFault",
      );
      assert.equal((await f.registry.read.getDraw([drawId])).status, Status.Published);
    });

    it("rejects forged proofs and challenges after the deadline", async () => {
      const { drawId, result } = await runToReveal(f, 3, 12);
      const list = result.winners.map((w, i) => (i === 1 ? { ...w, score: w.score - 1n } : w));
      const tree = await publish(f, drawId, list, result.cutoff);
      const forged = { ...winnerProofAt(list, tree, 1), proof: [randomBytes32(), randomBytes32()] };
      await expectRevert(f.registry.write.challengeWrongScore([drawId, forged], asEntrant()), "InvalidProof");
      await time.increase(Number(PERIOD) + 1);
      await expectRevert(f.registry.write.challengeWrongScore([drawId, winnerProofAt(list, tree, 1)], asEntrant()), "TooLate");
    });

    it("exposes inclusion checks for entries and winners", async () => {
      const { drawId, entries, result } = await runToReveal(f, 3, 12);
      const tree = await publish(f, drawId, result.winners, result.cutoff);
      assert.equal(await f.registry.read.isEntry([drawId, entryProofAt(entries, 5)]), true);
      assert.equal(await f.registry.read.isWinner([drawId, winnerProofAt(result.winners, tree, 0)]), true);
      assert.equal(await f.registry.read.isEntry([drawId, { ...entryProofAt(entries, 5), index: 6n }]), false);
    });
  });
});
