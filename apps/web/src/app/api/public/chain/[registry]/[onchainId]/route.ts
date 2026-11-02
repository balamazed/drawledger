import { findDraw, orderedEntryHashes, publishedWinners } from "@/lib/repo";
import { HttpError, handle, json } from "@/lib/http";
import { winnersToJson } from "@drawledger/core";

type Ctx = { params: Promise<{ registry: string; onchainId: string }> };

// Machine-readable data behind both on-chain roots, used by the CLI and the browser verifier
export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const { registry, onchainId } = await params;
  if (!/^0x[0-9a-fA-F]{40}$/.test(registry) || !/^\d+$/.test(onchainId)) throw new HttpError(400, "Bad registry or draw id");
  const draw = await findDraw({ onchainId: BigInt(onchainId), registry });
  if (!draw) throw new HttpError(404, "Draw not found");
  const entries = draw.entries_locked_at ? await orderedEntryHashes(draw.id) : [];
  const winners = publishedWinners(draw);
  return json({ entries, winners: winners ? winnersToJson(winners) : null, entriesLocked: !!draw.entries_locked_at });
});
