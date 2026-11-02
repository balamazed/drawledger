#!/usr/bin/env node
import { readFileSync } from "fs";
import { createPublicClient, encodeFunctionData, http, type Address, type Hex } from "viem";
import { drawRegistryAbi } from "./abi";
import { readDraw, readReveal } from "./chain";
import { checkEntrant, STATUS_LABELS, verifyDraw, type DrawStatus } from "./protocol";
import { bigintReplacer, winnersFromJson } from "./serialize";

const USAGE = `drawledger-verify: independently verify a DrawLedger draw

Required:
  --rpc <url>          MST RPC endpoint (e.g. https://coralrpc.mstblockchain.com)
  --registry <addr>    DrawRegistry contract address
  --draw <id>          on-chain draw id
  --from-block <n>     block to search events from (registry deployment block)
One of:
  --api <url>          DrawLedger app base URL; entries and winners are fetched from its public API
  --entries <file>     JSON array of entry hashes in tree order (plus optional --winners <file>)
Optional:
  --entry <hash>       also check one entrant's own result
  --json               print the raw report as JSON`;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function loadJson(source: string): Promise<unknown> {
  if (/^https?:\/\//.test(source)) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`${source} returned ${res.status}`);
    return res.json();
  }
  return JSON.parse(readFileSync(source, "utf8"));
}

async function main() {
  const rpc = arg("rpc");
  const registry = arg("registry") as Address | undefined;
  const drawIdRaw = arg("draw");
  const fromBlock = BigInt(arg("from-block") ?? "0");
  if (!rpc || !registry || !drawIdRaw || process.argv.includes("--help")) {
    console.log(USAGE);
    process.exit(rpc ? 0 : 1);
  }
  const drawId = BigInt(drawIdRaw);
  const client = createPublicClient({ transport: http(rpc) });

  const api = arg("api");
  let entries: Hex[] = [];
  let winnersRaw: unknown;
  if (api) {
    const pub = (await loadJson(`${api.replace(/\/$/, "")}/api/public/chain/${registry}/${drawId}`)) as {
      entries: Hex[];
      winners?: unknown;
    };
    entries = pub.entries;
    winnersRaw = pub.winners;
  } else if (arg("entries")) {
    entries = (await loadJson(arg("entries")!)) as Hex[];
    if (arg("winners")) winnersRaw = await loadJson(arg("winners")!);
  }

  const draw = await readDraw(client, registry, drawId);
  const reveal = await readReveal(client, registry, drawId, fromBlock);
  const publishedWinners = Array.isArray(winnersRaw) ? winnersFromJson(winnersRaw as never) : undefined;
  const report = verifyDraw({ drawId, draw, orderedEntries: entries, reveal: reveal ?? undefined, publishedWinners });

  const entry = arg("entry") as Hex | undefined;
  const self = entry ? checkEntrant({ entryHash: entry, orderedEntries: entries, draw, publishedWinners }) : undefined;

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ draw, report, self }, bigintReplacer, 2));
    return;
  }

  console.log(`Draw ${drawId} on ${registry}: ${STATUS_LABELS[draw.status as DrawStatus]}`);
  for (const c of report.checks) console.log(`  ${c.ok ? "PASS" : "FAIL"}  ${c.name.padEnd(13)} ${c.detail}`);
  if (self) {
    if (!self.included) console.log("  Your entry is NOT in the committed entry list.");
    else console.log(`  Your entry is #${self.entryIndex! + 1} in the list${self.won !== undefined ? `; won: ${self.won ? `yes, rank ${self.rank}` : "no"}` : ""}${self.shouldHaveWon && !self.won ? " (should have won: challenge available)" : ""}`);
  }
  if (report.challenge) {
    const data = encodeFunctionData({ abi: drawRegistryAbi, functionName: report.challenge.fn, args: report.challenge.args as never });
    console.log(`\nProvable fault: ${report.challenge.fn}. Send this calldata to ${registry} from any wallet:\n${data}`);
  }
  process.exit(report.ok ? 0 : 2);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
