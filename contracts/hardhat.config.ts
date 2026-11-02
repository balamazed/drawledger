import "dotenv/config";
import "@nomicfoundation/hardhat-toolbox-viem";
import { HardhatUserConfig, subtask } from "hardhat/config";
import { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } from "hardhat/builtin-tasks/task-names";

const SOLC_VERSION = "0.8.24";

// Use the bundled solcjs build so compiling works without downloading compilers
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args: { solcVersion: string }, _hre, runSuper) => {
  if (args.solcVersion !== SOLC_VERSION) return runSuper();
  const solc = require("solc");
  return {
    compilerPath: require.resolve("solc/soljson.js"),
    isSolcJs: true,
    version: SOLC_VERSION,
    longVersion: solc.version().replace(".Emscripten.clang", ""),
  };
});

const accounts = process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [];
const gasPrice = process.env.MST_GAS_PRICE_WEI ? Number(process.env.MST_GAS_PRICE_WEI) : "auto";

const config: HardhatUserConfig = {
  solidity: {
    version: SOLC_VERSION,
    // paris avoids PUSH0 so bytecode runs whichever EVM fork MST has enabled
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "paris" },
  },
  networks: {
    hardhat: { chainId: 31337 },
    mstCoral: {
      url: process.env.MST_CORAL_RPC_URL || "https://coralrpc.mstblockchain.com",
      chainId: 54635,
      accounts,
      gasPrice,
    },
    mstTestnet: {
      url: process.env.MST_TESTNET_RPC_URL || "https://testnetrpc.mstblockchain.com",
      chainId: 91562037,
      accounts,
      gasPrice,
    },
  },
  etherscan: {
    apiKey: { mstCoral: "blockscout", mstTestnet: "blockscout" },
    customChains: [
      {
        network: "mstCoral",
        chainId: 54635,
        urls: { apiURL: "https://coral.mstscan.com/api", browserURL: "https://coral.mstscan.com" },
      },
      {
        network: "mstTestnet",
        chainId: 91562037,
        urls: { apiURL: "https://testnet.mstscan.com/api", browserURL: "https://testnet.mstscan.com" },
      },
    ],
  },
  sourcify: { enabled: false },
  mocha: { timeout: 120000 },
};

export default config;
