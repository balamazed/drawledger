import { createNonce } from "@/lib/repo";
import { clientIp, handle, json } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const GET = handle(async (req: Request) => {
  rateLimit(`nonce:${clientIp(req)}`, 20, 60_000);
  return json({ nonce: await createNonce() });
});
