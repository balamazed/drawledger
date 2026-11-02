import { db } from "@/lib/db";
import { publicClient } from "@/lib/chain-server";
import { appConfig, isConfigured } from "@/lib/config";
import { handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";

// Liveness of the database and the MST RPC endpoint
export const GET = handle(async () => {
  const started = Date.now();
  let dbOk = false;
  let dbError: string | undefined;
  let rpc: { ok: boolean; chainId?: number; block?: string; error?: string } = { ok: false };
  try {
    await (await db()).query("select 1");
    dbOk = true;
  } catch (e) {
    // Connection strings are stripped so no password can leak into the response
    dbError = (e instanceof Error ? e.message : String(e)).replace(/postgres(ql)?:\/\/\S+/g, "<connection string>").slice(0, 160);
  }
  try {
    const client = publicClient();
    const [chainId, block] = await Promise.all([client.getChainId(), client.getBlockNumber()]);
    rpc = { ok: chainId === appConfig.chainId, chainId, block: block.toString() };
  } catch (e) {
    rpc = { ok: false, error: e instanceof Error ? e.message.slice(0, 120) : "unreachable" };
  }
  const ok = dbOk && rpc.ok && isConfigured();
  return json({ ok, db: dbOk, dbError, rpc, configured: isConfigured(), ms: Date.now() - started }, ok ? 200 : 503);
});
