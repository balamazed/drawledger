import { findReceipt } from "@/lib/repo";
import { HttpError, clientIp, handle, json } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

type Ctx = { params: Promise<{ token: string }> };

// The receipt holder learns their salt, which is what lets them prove the entry is theirs
export const GET = handle(async (req: Request, { params }: Ctx) => {
  rateLimit(`receipt:${clientIp(req)}`, 60, 60_000);
  const r = await findReceipt((await params).token);
  if (!r) throw new HttpError(404, "Receipt not found");
  return json({ drawSlug: r.slug, drawTitle: r.title, onchainId: r.onchain_id, label: r.label, salt: r.salt, entryHash: r.entry_hash, issuedAt: r.created_at });
});
