import type { Hex } from "viem";
import { listDraws, registerDraw } from "@/lib/repo";
import { handle, json, parseBody, requireOperator } from "@/lib/http";
import { registerDrawSchema } from "@/lib/schemas";

export const GET = handle(async () => {
  const operator = await requireOperator();
  const draws = await listDraws(operator);
  return json({
    draws: draws.map((d) => ({ id: d.id, slug: d.slug, title: d.title, onchainId: d.onchain_id, status: d.status, entryCount: d.entry_count, createdAt: d.created_at })),
  });
});

// Registers a draw the operator already created on-chain; terms must hash to its metadataHash
export const POST = handle(async (req: Request) => {
  const operator = await requireOperator();
  const body = await parseBody(req, registerDrawSchema);
  const draw = await registerDraw({ operator, onchainId: BigInt(body.onchainId), txHash: body.txHash as Hex, terms: body.terms, publicSignup: body.publicSignup, showWinnerLabels: body.showWinnerLabels });
  return json({ id: draw.id, slug: draw.slug }, 201);
});
