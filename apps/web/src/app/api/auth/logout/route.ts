import { clearSession } from "@/lib/session";
import { handle, json } from "@/lib/http";

export const POST = handle(async () => {
  await clearSession();
  return json({ ok: true });
});
