import type { Address, Hex, PublicClient } from "viem";
import { drawRegistryAbi } from "./abi";
import type { OnchainDraw } from "./protocol";

export async function readDraw(client: PublicClient, registry: Address, drawId: bigint): Promise<OnchainDraw> {
  const d = await client.readContract({ address: registry, abi: drawRegistryAbi, functionName: "getDraw", args: [drawId] });
  return {
    operator: d.operator,
    status: Number(d.status),
    winnerCount: Number(d.winnerCount),
    entryCount: Number(d.entryCount),
    publishedWinners: Number(d.publishedWinners),
    targetBlock: BigInt(d.targetBlock),
    challengePeriod: BigInt(d.challengePeriod),
    challengeDeadline: BigInt(d.challengeDeadline),
    bond: BigInt(d.bond),
    seedCommitment: d.seedCommitment,
    metadataHash: d.metadataHash,
    entriesRoot: d.entriesRoot,
    seed: d.seed,
    winnersRoot: d.winnersRoot,
    cutoff: d.cutoff,
  };
}

export interface DrawEvent {
  name: string;
  blockNumber: bigint;
  txHash: Hex;
  args: Record<string, unknown>;
}

// Every registry event for one draw, oldest first; fromBlock should be the registry's deployment block
export async function readDrawEvents(
  client: PublicClient,
  registry: Address,
  drawId: bigint,
  fromBlock: bigint,
): Promise<DrawEvent[]> {
  const logs = await client.getContractEvents({ address: registry, abi: drawRegistryAbi, fromBlock, toBlock: "latest" });
  return logs
    .filter((l) => (l.args as { drawId?: bigint }).drawId === drawId)
    .map((l) => ({ name: l.eventName, blockNumber: l.blockNumber, txHash: l.transactionHash, args: l.args as Record<string, unknown> }));
}

export async function readReveal(
  client: PublicClient,
  registry: Address,
  drawId: bigint,
  fromBlock: bigint,
): Promise<{ secret: Hex; targetBlockHash: Hex; txHash: Hex } | null> {
  const logs = await client.getContractEvents({
    address: registry,
    abi: drawRegistryAbi,
    eventName: "SeedRevealed",
    args: { drawId },
    fromBlock,
    toBlock: "latest",
  });
  const log = logs[0];
  if (!log) return null;
  return { secret: log.args.secret as Hex, targetBlockHash: log.args.targetBlockHash as Hex, txHash: log.transactionHash };
}
