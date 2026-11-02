import { listEntries, listEvents, requireOwnedDraw, updateSettings } from "@/lib/repo";
import { handle, json, parseBody, requireOperator } from "@/lib/http";
import { settingsSchema } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

// Operator view: includes entrant labels, contacts and receipt tokens, which are never public
export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const operator = await requireOperator();
  const draw = await requireOwnedDraw((await params).id, operator);
  const [entries, events] = await Promise.all([listEntries(draw.id), listEvents(draw.id)]);
  return json({
    draw: {
      id: draw.id,
      slug: draw.slug,
      title: draw.title,
      terms: draw.terms,
      onchainId: draw.onchain_id,
      status: draw.status,
      publicSignup: draw.public_signup,
      showWinnerLabels: draw.show_winner_labels,
      entriesLockedAt: draw.entries_locked_at,
      entriesRoot: draw.entries_root,
      winners: draw.winners,
      winnersRoot: draw.winners_root,
      winnersMatch: draw.winners_match,
      metadataHash: draw.metadata_hash,
    },
    entries: entries.map((e) => ({ id: e.id, label: e.label, contact: e.contact, entryHash: e.entry_hash, receiptToken: e.receipt_token, source: e.source })),
    events: events.map((e) => ({ name: e.name, txHash: e.tx_hash, blockNumber: e.block_number })),
  });
});

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const operator = await requireOperator();
  const draw = await requireOwnedDraw((await params).id, operator);
  await updateSettings(draw, await parseBody(req, settingsSchema));
  return json({ ok: true });
});
