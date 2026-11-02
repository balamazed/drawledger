import { lockEntries, requireOwnedDraw } from "@/lib/repo";
import { handle, json, parseBody, requireOperator } from "@/lib/http";
import { lockSchema } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const operator = await requireOperator();
  const draw = await requireOwnedDraw((await params).id, operator);
  const { unlock } = await parseBody(req, lockSchema);
  return json({ locked: !unlock, commitment: await lockEntries(draw, unlock) });
});
