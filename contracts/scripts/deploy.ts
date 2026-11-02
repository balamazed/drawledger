import hre from "hardhat";
import { parseEther } from "viem";
import { explorerBase, mstClients, saveJson, type Deployment } from "./lib";

async function main() {
  const { publicClient: client, wallets } = await mstClients(hre);
  const [deployer] = wallets;
  if (!deployer) throw new Error("Set DEPLOYER_PRIVATE_KEY in contracts/.env");
  const chainId = await client.getChainId();
  const minBond = parseEther(process.env.MIN_BOND_MSTC || "0.01");
  const treasury = (process.env.TREASURY_ADDRESS || deployer.account.address) as `0x${string}`;

  const balance = await client.getBalance({ address: deployer.account.address });
  console.log(`Deployer ${deployer.account.address} on chain ${chainId}, balance ${balance} wei`);
  if (balance === 0n) throw new Error("Deployer has no balance; fund it from the faucet first");

  const { contract, deploymentTransaction } = await hre.viem.sendDeploymentTransaction("DrawRegistry", [minBond, treasury], {
    client: { public: client, wallet: deployer },
  });
  const receipt = await client.waitForTransactionReceipt({ hash: deploymentTransaction.hash });
  const explorer = explorerBase(chainId);

  const record: Deployment = {
    network: hre.network.name,
    chainId,
    registry: contract.address,
    deployBlock: receipt.blockNumber.toString(),
    deployTx: deploymentTransaction.hash,
    deployer: deployer.account.address,
    treasury,
    minBondWei: minBond.toString(),
    deployedAt: new Date().toISOString(),
    explorer: explorer ? `${explorer}/address/${contract.address}` : null,
  };
  saveJson(`${hre.network.name}.json`, record);
  console.log(JSON.stringify(record, null, 2));
  console.log(`\nSet in apps/web/.env.local:\nNEXT_PUBLIC_CHAIN_ID=${chainId}\nNEXT_PUBLIC_REGISTRY_ADDRESS=${contract.address}\nNEXT_PUBLIC_REGISTRY_DEPLOY_BLOCK=${receipt.blockNumber}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
