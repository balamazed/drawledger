import hre from "hardhat";
import { parseEther, type Hex } from "viem";
import {
  buildEntriesTree,
  computeEntryHash,
  computeMetadataHash,
  computeResult,
  computeSeedCommitment,
  randomBytes32,
  readDraw,
  readReveal,
  verifyDraw,
} from "@drawledger/core";
import { explorerBase, loadJson, saveJson, type Deployment } from "./lib";

// Runs one real draw against the deployed registry and records every transaction hash
async function main() {
  const deployment = loadJson<Deployment>(`${hre.network.name}.json`);
  if (!deployment) throw new Error(`No deployments/${hre.network.name}.json; run the deploy script first`);
  const [operator] = await hre.viem.getWalletClients();
  const client = await hre.viem.getPublicClient();
  const registry = await hre.viem.getContractAt("DrawRegistry", deployment.registry);
  const explorer = explorerBase(deployment.chainId);
  const txs: { step: string; hash: Hex; block: string; gasUsed: string; link: string | null }[] = [];

  async function send(step: string, hash: Hex) {
    const r = await client.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`${step} reverted: ${hash}`);
    txs.push({ step, hash, block: r.blockNumber.toString(), gasUsed: r.gasUsed.toString(), link: explorer ? `${explorer}/tx/${hash}` : null });
    console.log(`${step}: ${hash} (block ${r.blockNumber}, gas ${r.gasUsed})`);
    return r;
  }

  const secret = randomBytes32();
  const terms = { title: "DrawLedger smoke test", winners: 3, entrants: 20, network: hre.network.name };
  const bond = BigInt(deployment.minBondWei) || parseEther("0.01");
  await send("createDraw", await registry.write.createDraw([computeSeedCommitment(operator.account.address, secret), computeMetadataHash(terms), 3, 600n], { value: bond }));
  const drawId = await registry.read.drawCount();

  const salts = Array.from({ length: 20 }, () => randomBytes32());
  const entries = buildEntriesTree(salts.map((s) => computeEntryHash(drawId, s)));
  const closed = await send("closeEntries", await registry.write.closeEntries([drawId, entries.root, entries.count]));

  const target = closed.blockNumber + 3n;
  while ((await client.getBlockNumber()) <= target) {
    if (hre.network.name === "hardhat" || hre.network.name === "localhost") await hre.network.provider.send("evm_mine");
    else await new Promise((r) => setTimeout(r, 2000));
  }
  await send("reveal", await registry.write.reveal([drawId, secret]));

  const draw = await readDraw(client, deployment.registry, drawId);
  const result = computeResult(draw.seed, entries.sorted, 3);
  await send("publishResult", await registry.write.publishResult([drawId, result.cutoff, result.root, result.count]));

  const reveal = await readReveal(client, deployment.registry, drawId, BigInt(deployment.deployBlock));
  const report = verifyDraw({ drawId, draw: await readDraw(client, deployment.registry, drawId), orderedEntries: entries.sorted, reveal: reveal ?? undefined, publishedWinners: result.winners });
  console.log(report.checks.map((c) => `${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.detail}`).join("\n"));
  if (!report.ok) throw new Error("Verification failed");

  saveJson(`${hre.network.name}-smoke.json`, {
    network: hre.network.name,
    chainId: deployment.chainId,
    registry: deployment.registry,
    drawId: drawId.toString(),
    ranAt: new Date().toISOString(),
    entries: entries.sorted,
    winners: result.winners.map((w) => ({ entryHash: w.entryHash, score: w.score.toString() })),
    verification: report.checks,
    transactions: txs,
  });
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
