import { appConfig, isConfigured } from "@/lib/config";
import { handle, json } from "@/lib/http";

export const GET = handle(async () =>
  json({ chainId: appConfig.chainId, registry: appConfig.registry, deployBlock: appConfig.deployBlock.toString(), configured: isConfigured() }),
);
