import { findDraw, publicDrawView, syncDraw } from "@/lib/repo";
import { HttpError, clientIp, handle, json } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { sessionAddress } from "@/lib/session";

type Ctx = { params: Promise<{ slug: string }> };

// Anyone can ask the app to re-read a draw's state from MST
export const POST = handle(async (req: Request, { params }: Ctx) => {
  rateLimit(`sync:${clientIp(req)}`, 30, 60_000);
  const draw = await findDraw({ slug: (await params).slug });
  if (!draw) throw new HttpError(404, "Draw not found");
  // Cache chain reads for 10 seconds per draw so public traffic cannot hammer the RPC
  const isOwner = (await sessionAddress()) === draw.operator;
  const fresh = !isOwner && draw.synced_at && Date.now() - new Date(draw.synced_at).getTime() < 10_000 ? draw : (await syncDraw(draw)).draw;
  return json(await publicDrawView(fresh));
});
