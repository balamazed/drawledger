import assert from "node:assert/strict";
import hre from "hardhat";
import { mine, time } from "@nomicfoundation/hardhat-network-helpers";
import { parseEther, type Hex } from "viem";
import {
  buildEntriesTree,
  computeEntryHash,
  computeMetadataHash,
  computeResult,
  computeSeedCommitment,
  deriveSeed,
  randomBytes32,
} from "@drawledger/core";

export const MIN_BOND = parseEther("0.01");
export const PERIOD = 600n;

export async function expectRevert(promise: Promise<unknown>, errorName: string) {
  await assert.rejects(promise, (e: Error) => {
    assert.match(e.message, new RegExp(errorName), `expected ${errorName}, got: ${e.message.slice(0, 300)}`);
    return true;
  });
}

export async function deploy() {
  const [operator, entrant, stranger, treasury] = await hre.viem.getWalletClients();
  const registry = await hre.viem.deployContract("DrawRegistry", [MIN_BOND, treasury.account.address]);
  const publicClient = await hre.viem.getPublicClient();
  return { registry, publicClient, operator, entrant, stranger, treasury };
}

export type Fixture = Awaited<ReturnType<typeof deploy>>;

// Creates a draw and returns its id plus the secret the operator must keep
export async function createDraw(f: Fixture, winnerCount = 3, bond = MIN_BOND) {
  const secret = randomBytes32();
  const commitment = computeSeedCommitment(f.operator.account.address, secret);
  const metadataHash = computeMetadataHash({ title: "Test draw", winners: winnerCount });
  await f.registry.write.createDraw([commitment, metadataHash, winnerCount, PERIOD], {
    value: bond,
    account: f.operator.account,
  });
  const drawId = await f.registry.read.drawCount();
  return { drawId, secret };
}

export function makeEntries(drawId: bigint, n: number) {
  const salts = Array.from({ length: n }, () => randomBytes32());
  return { salts, hashes: salts.map((s) => computeEntryHash(drawId, s)) };
}

// Runs a draw up to the revealed state and returns everything needed to publish
export async function runToReveal(f: Fixture, winnerCount = 3, entryCount = 12) {
  const { drawId, secret } = await createDraw(f, winnerCount);
  const { hashes } = makeEntries(drawId, entryCount);
  const entries = buildEntriesTree(hashes);
  await f.registry.write.closeEntries([drawId, entries.root, entries.count], { account: f.operator.account });
  await mine(4);
  await f.registry.write.reveal([drawId, secret], { account: f.operator.account });
  const draw = await f.registry.read.getDraw([drawId]);
  const result = computeResult(draw.seed, entries.sorted, winnerCount);
  return { drawId, secret, entries, result, seed: draw.seed as Hex };
}

export { mine, time, deriveSeed };
