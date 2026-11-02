import { addEntries, findDraw } from "@/lib/repo";
import { HttpError, clientIp, handle, json, parseBody } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { entryInputSchema } from "@/lib/schemas";

type Ctx = { params: Promise<{ slug: string }> };

// Self-registration when the operator enabled it; returns the entrant's private receipt token
export const POST = handle(async (req: Request, { params }: Ctx) => {
  rateLimit(`signup:${clientIp(req)}`, 5, 60_000);
  const draw = await findDraw({ slug: (await params).slug });
  if (!draw) throw new HttpError(404, "Draw not found");
  if (!draw.public_signup) throw new HttpError(403, "This draw does not accept public sign-ups");
  const input = await parseBody(req, entryInputSchema);
  if (!input.contact) throw new HttpError(400, "An email or phone is required so each person enters once");
  const { created } = await addEntries(draw, [input], "signup");
  if (!created[0]) throw new HttpError(409, "This contact is already entered");
  return json({ receiptToken: created[0].receipt_token }, 201);
});
