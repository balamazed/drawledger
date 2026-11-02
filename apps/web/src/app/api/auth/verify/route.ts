import { verifyMessage, type Hex } from "viem";
import { parseSiweMessage, validateSiweMessage } from "viem/siwe";
import { appConfig } from "@/lib/config";
import { consumeNonce } from "@/lib/repo";
import { createSession } from "@/lib/session";
import { HttpError, clientIp, handle, json, parseBody } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { verifySchema } from "@/lib/schemas";

// Sign-In with Ethereum (EIP-4361): the wallet signs a message bound to this domain, chain and a one-time nonce
export const POST = handle(async (req: Request) => {
  rateLimit(`verify:${clientIp(req)}`, 10, 60_000);
  const { message, signature } = await parseBody(req, verifySchema);
  const parsed = parseSiweMessage(message);
  const host = req.headers.get("host") ?? "";
  if (!parsed.address || !parsed.nonce) throw new HttpError(400, "Malformed sign-in message");
  if (!validateSiweMessage({ message: parsed, domain: host })) throw new HttpError(401, "Sign-in message expired or for another domain");
  if (parsed.chainId !== appConfig.chainId) throw new HttpError(401, "Sign-in message is for another chain");
  const valid = await verifyMessage({ address: parsed.address, message, signature: signature as Hex });
  if (!valid) throw new HttpError(401, "Signature does not match the address");
  if (!(await consumeNonce(parsed.nonce))) throw new HttpError(401, "Sign-in nonce already used or expired");
  await createSession(parsed.address);
  return json({ address: parsed.address.toLowerCase() });
});
