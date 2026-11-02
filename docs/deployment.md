# Deployment report and runbook

## Current status

| Item | Status |
| --- | --- |
| Contracts compiled, tested, Slither-checked | Done |
| Deploy, smoke-test and network-check scripts | Done, exercised end to end on a local Hardhat node |
| Deployment to MST Coral Testnet (chain 54635) | **Not yet done** |
| Real MST transaction hashes and explorer links | **None yet** |
| Hosted web app | **Not yet deployed** |

**Why not yet:** the build environment's network egress refused connections to `coralrpc.mstblockchain.com`, `testnetrpc.mstblockchain.com` and `mariorpc.mstblockchain.com`, so no transaction could be sent to MST from it. No testnet result in this repository is simulated or claimed. The steps below take about 15 minutes on any machine with internet access and produce the evidence files automatically.

## Which testnet

MST runs two testnets. The default here is **Coral (54635)**, which has a public faucet. To use the older MST Testnet (91562037), replace `mstCoral` with `mstTestnet` in the commands. Confirm with MST which one buildGrant reviewers expect.

| | Coral Testnet | MST Testnet |
| --- | --- | --- |
| Chain ID | 54635 | 91562037 |
| RPC | https://coralrpc.mstblockchain.com | https://testnetrpc.mstblockchain.com |
| Explorer | https://coral.mstscan.com | https://testnet.mstscan.com |
| Faucet | https://coral-faucet.mstblockchain.com | not public |
| Hardhat network name | `mstCoral` | `mstTestnet` |

## Step 1: deployer wallet

1. Create a **new** wallet used only for testnet deployment (BridgeKey or MetaMask). Never reuse a wallet that holds real funds.
2. Fund it from the Coral faucet.
3. Copy `contracts/.env.example` to `contracts/.env` and set `DEPLOYER_PRIVATE_KEY`. The file is git-ignored.

## Step 2: check the network

```bash
cd contracts
npx hardhat run scripts/check-network.ts --network mstCoral
```

This prints the live chain ID, latest block, base fee and gas price, and fails if the RPC's chain ID differs from 54635. If `baseFeePerGas` shows "none (legacy gas)", set `MST_GAS_PRICE_WEI` in `.env` to the printed gas price.

## Step 3: deploy

```bash
npm run deploy:coral
```

Writes `contracts/deployments/mstCoral.json` with the registry address, deployment block, transaction hash, deployer, treasury and explorer link, and prints the three `NEXT_PUBLIC_` values for the web app.

Optional: verify the source on the Blockscout explorer.

```bash
npx hardhat verify --network mstCoral <registry address> 10000000000000000 <treasury address>
```

## Step 4: smoke test on-chain

```bash
npm run smoke:coral
```

Runs one real 20-entrant, 3-winner draw (create, close, wait for the target block, reveal, publish), verifies it with the same library the public uses, and writes every transaction hash, block, gas figure and explorer link to `contracts/deployments/mstCoral-smoke.json`. This file is the on-chain evidence for the grant application.

## Step 5: run the web app

Local:

```bash
cd apps/web
cp .env.example .env.local   # fill NEXT_PUBLIC_REGISTRY_ADDRESS and NEXT_PUBLIC_REGISTRY_DEPLOY_BLOCK, set SESSION_SECRET
npm run dev
```

Hosted (Vercel or any Node 20 host):

1. Create a Supabase project and copy its Postgres connection string to `DATABASE_URL`. The schema is created on first request.
2. Set `NEXT_PUBLIC_CHAIN_ID=54635`, `NEXT_PUBLIC_RPC_URL=https://coralrpc.mstblockchain.com`, the registry address and deploy block, and a 64-character random `SESSION_SECRET` (`openssl rand -hex 32`).
3. Root directory `apps/web`, build command `npm run build`, install command `npm ci` at the repository root.
4. Check `https://<your-app>/api/health` returns `"ok": true`.

## Step 6: record evidence

After the first real draw through the UI, add to the grant application and README:

- Registry address and explorer link (`deployments/mstCoral.json`)
- Smoke-test transaction links (`deployments/mstCoral-smoke.json`)
- Public draw page URL and the matching transactions shown on it
- Output of `npx drawledger-verify --rpc https://coralrpc.mstblockchain.com --registry <address> --draw <id> --from-block <deploy block> --api <app url>`

## Known chain-specific risks to check on first deployment

| Risk | How to detect | Fallback |
| --- | --- | --- |
| RPC rejects EIP-1559 fields | Deploy fails with a fee error | Set `MST_GAS_PRICE_WEI` |
| `eth_getLogs` range limits | Public page shows no events; `/api/public/draws/:slug/sync` errors | Events are read from the draw's creation block, which keeps ranges short; add chunked reads if needed |
| Block time differs from 3 s | Reveal countdown in the UI | No change needed; the window is counted in blocks |
| Blockscout verification API differs | `hardhat verify` fails | Verify through the explorer's web form with the flattened source |
