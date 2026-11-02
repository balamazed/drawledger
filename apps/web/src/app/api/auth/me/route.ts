import { sessionAddress } from "@/lib/session";
import { handle, json } from "@/lib/http";

export const GET = handle(async () => json({ address: await sessionAddress() }));
