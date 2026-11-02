# Testing report

All results below come from runs in the development environment on November 1, 2026, against an in-process Hardhat network or a local Hardhat node (chain 31337). **None of these runs used MST testnet**; see [deployment.md](deployment.md) for the testnet steps and the evidence still to be collected.

## Summary

| Suite | Command | Tests | Result |
| --- | --- | --- | --- |
| Core library (hashing, trees, selection, challenge planning) | `npm run test:core` | 9 | 9 passed |
| Contract unit tests | `npm run test:contracts` | 20 | 20 passed |
| Contract edge cases | included in `test:contracts` | 6 | 6 passed |
| Protocol end-to-end (25, 1,000 and 5,000 entrants; rigged-draw challenge) | `npm run test:e2e` | 4 | 4 passed |
| HTTP end-to-end against a running app and local node | `node --import tsx --test apps/web/tests/api-flow.test.ts` | 1 journey, 26 assertions | passed |
| Browser end-to-end (real Chrome, injected wallet) | `python3 apps/web/tests/ui_e2e.py` | 1 journey, 9 screens | passed, no page errors |
| CLI verifier against a local deployment | `scripts/smoke.ts` then `drawledger-verify` | 4 checks | all PASS |
| Type checking | `tsc --noEmit` (core and web) | n/a | clean |
| Production build | `next build` | 25 routes | built |
| Static analysis | Slither 0.11.6 | 102 detectors | 0 high, 0 medium |

## Contract coverage

`SOLIDITY_COVERAGE=true npx hardhat coverage` over the unit and edge suites:

| File | Statements | Branches | Functions | Lines |
| --- | --- | --- | --- | --- |
| DrawRegistry.sol | 100% | 86.6% | 100% | 99.2% |
| SortedMerkle.sol | 90% | 50% | 100% | 100% |
| **All** | **99.1%** | **84.8%** | **100%** | **99.3%** |

Uncovered branches are mostly the `uint96` overflow guard on the bond and the `TransferFailed` path in `withdraw`.

## What each layer proves

**Core library.** Proofs verify for every leaf in trees of 1 to 13 leaves; indexes past the count are rejected; entries sort and reject duplicates; selection returns exactly the k lowest scores; canonical JSON is key-order independent; an honest draw yields no challenge; excluded entries, fake winners, wrong scores and unsorted lists are each detected.

**Contracts.** Full lifecycle with exact bond accounting; seed derivation matches the off-chain formula with the real target block hash; all status and permission guards; all five challenge types succeed against faulty results and all fail against honest ones; forged proofs and late challenges are rejected; treasury receives forfeited bonds.

**Protocol end-to-end.** For 25, 1,000 and 5,000 entrants, an independent verifier that sees only chain state and JSON-round-tripped public lists reproduces the result, every entrant's self-check is consistent, and the event log is complete. In a 1,000-entrant draw where the organiser swaps one winner for the 51st-best entry, the cheated entrant's self-check flags it and their challenge voids the draw on-chain.

**HTTP journey.** Unauthenticated access blocked; SIWE sign-in works and replayed nonces fail; tampered terms rejected at registration; another operator gets 404; duplicate contacts skipped; invalid input returns 400; public sign-up works and is case-insensitively unique; entry list hidden before lock; cross-site POST rejected; no entries after close; no result before reveal; status, winners and four events correct after publish; public view leaks no contacts; receipt is self-consistent; full verification passes; CLI passes against the app's public API; security headers present.

**Browser journey.** Sign-in, draw creation with secret download, CSV import of 24 entrants plus one manual entry, closing on-chain, reveal after the target block, publish, public page verification, winner and non-winner receipts, verify page, mobile layout. Screenshots in `docs/screenshots/`, recording in `docs/demo/drawledger-demo.mp4`.

## Gas and performance

| Transaction | Gas |
| --- | --- |
| createDraw | 159,135 |
| closeEntries | 57,441 |
| reveal | 56,664 |
| publishResult | 80,777 |
| finalize | 54,540 |
| challengeExcludedEntry (1,000 entries) | 94,109 |

On-chain cost is flat in the number of entrants. Off-chain, building trees and verifying a 5,000-entrant draw took about 1.2 seconds in Node, including the chain round trips on the local network.

## Not yet tested

- Anything on MST testnet: real block times, fee behaviour (legacy versus EIP-1559), event log range limits of MST's RPC, BridgeKey's injected provider. The deploy and smoke scripts collect this evidence.
- Load testing the API beyond single-user flows.
- Postgres via `postgres.js` (Supabase); all automated runs used the embedded PGlite engine. The SQL is standard and the driver adapter is small, but it needs one run against Supabase.
- Screen-reader and keyboard-only accessibility audit.

## Reproducing

```bash
npm ci
npm test                                   # core, contracts, protocol e2e
cd contracts && npx hardhat node &          # terminal 1
npx hardhat run scripts/deploy.ts --network localhost
cd ../apps/web && cp .env.example .env.local  # set chain 31337, RPC http://127.0.0.1:8545, registry from deploy output
npx next build && npx next start -p 3100 &
node --import tsx --test tests/api-flow.test.ts
python3 tests/ui_e2e.py                    # needs Playwright and Chrome
```
