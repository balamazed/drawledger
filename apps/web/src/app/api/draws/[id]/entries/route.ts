import { addEntries, removeEntry, requireOwnedDraw } from "@/lib/repo";
import { HttpError, handle, json, parseBody, requireOperator } from "@/lib/http";
import { addEntriesSchema } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const operator = await requireOperator();
  const draw = await requireOwnedDraw((await params).id, operator);
  const { entries } = await parseBody(req, addEntriesSchema);
  const { created, skipped } = await addEntries(draw, entries, "operator");
  return json({ added: created.length, skipped }, 201);
});

export const DELETE = handle(async (req: Request, { params }: Ctx) => {
  const operator = await requireOperator();
  const draw = await requireOwnedDraw((await params).id, operator);
  const entryId = new URL(req.url).searchParams.get("entryId");
  if (!entryId || !/^[0-9a-f-]{36}$/.test(entryId)) throw new HttpError(400, "entryId required");
  await removeEntry(draw, entryId);
  return json({ ok: true });
});
