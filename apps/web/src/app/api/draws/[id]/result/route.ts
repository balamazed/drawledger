import { prepareResult, requireOwnedDraw } from "@/lib/repo";
import { handle, json, requireOperator } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// Computes winners from the on-chain seed; the operator then publishes the returned root
export const POST = handle(async (_req: Request, { params }: Ctx) => {
  const operator = await requireOperator();
  const draw = await requireOwnedDraw((await params).id, operator);
  const r = await prepareResult(draw);
  return json({ cutoff: r.cutoff.toString(), root: r.root, count: r.count });
});
