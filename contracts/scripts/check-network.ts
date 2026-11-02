import hre from "hardhat";
import { mstClients } from "./lib";

// Prints live network facts so chain parameters are verified, never assumed
async function main() {
  const { publicClient: client } = await mstClients(hre);
  const [chainId, block, gasPrice] = await Promise.all([client.getChainId(), client.getBlock(), client.getGasPrice()]);
  const configured = hre.network.config.chainId;
  console.log(JSON.stringify({
    network: hre.network.name,
    rpc: "url" in hre.network.config ? hre.network.config.url : "in-process",
    chainId,
    chainIdMatchesConfig: configured === undefined || configured === chainId,
    latestBlock: block.number.toString(),
    blockTimestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
    baseFeePerGas: block.baseFeePerGas?.toString() ?? "none (legacy gas)",
    gasPriceWei: gasPrice.toString(),
  }, null, 2));
  if (configured !== undefined && configured !== chainId) throw new Error(`RPC reports chain ${chainId}, config expects ${configured}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
