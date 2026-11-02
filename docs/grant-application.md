# buildGrant application draft

**Program:** MST buildGrant (up to $10,000), via the Google Form linked from https://www.mstblockchain.com/grant.
**Status of this draft:** ready to paste once the testnet evidence in [deployment.md](deployment.md) exists. Fill the bracketed placeholders with real values from `contracts/deployments/`. Do not submit before that, and do not submit without the team's approval.

Word counts were checked with a script and are shown after each answer.

---

## 1. Project Title

DrawLedger: Provably Fair Allocation Draws on MST

## 2. One-line project pitch (max 15 words)

Lotteries for seats, slots and giveaways that every entrant can verify on MST.

*(13 words)*

## 3. Short project description (max 200 words)

DrawLedger is a web app and smart contract protocol for running lottery-style allocations that anyone can verify. Organisers use it for housing society parking slots, event and hackathon seats, scholarship shortlists and free giveaways.

The organiser commits a hidden seed and the draw's terms on MST, collects entrants, and freezes the entry list as a Merkle root. The seed is then revealed and mixed with a future block hash, so nobody could know it in advance. Winners are the entries with the lowest hash of seed and entry, which any browser can recompute.

Every entrant gets a private receipt link that proves they were in the draw and shows their own result, without needing a wallet. If a published result is wrong, one transaction proves it on-chain, voids the draw and pays the organiser's bond to the challenger.

The MVP is built and tested: Solidity contracts with five on-chain challenge types, a shared TypeScript verification library, a Next.js app for organisers and entrants, and a command-line verifier. The grant funds testnet launch, an external security review and a closed beta with real organisers.

*(183 words)*

## 4. Problem statement (max 200 words)

Many scarce things are allocated by chance: parking slots in housing societies, seats in workshops and hackathons, scholarship shortlists, school admission quotas, and brand giveaways. These draws usually run on a spreadsheet or private software, and the result is simply announced.

People who lose cannot check anything: not the list of entrants, not the randomness, not how winners were picked. Accusations of favouritism are routine, and honest organisers have no way to prove they acted fairly.

The options that exist each need trust somewhere. In-person draws only convince those present. Paid third-party draw services keep a record, but entrants must take the service's word. Blockchain raffles built on oracle randomness assume every entrant has a crypto wallet and that the chain supports the oracle, which MST does not.

There is also a gap on MST itself. Its commit-reveal fairness protocols target gaming, a market that India's 2025 real-money gaming ban largely closed, and no public randomness service is available to developers on MST today.

The result is that everyday allocations affecting thousands of people remain unverifiable, even though the cryptography to fix this is simple and cheap.

*(187 words)*

## 5. Solution overview (max 200 words)

DrawLedger makes every input of a draw public and fixed before the result can exist.

1. At creation, the organiser's browser generates a secret and publishes only its hash, plus a hash of the terms and a refundable bond. DrawLedger's servers never see the secret.
2. Entrants receive salted, pseudonymous entry hashes. Names and contacts stay off-chain.
3. Closing entries commits the sorted list as a Merkle root and fixes a target block three blocks ahead.
4. After that block, the organiser reveals the secret. The seed combines the secret with the target block hash, so neither the organiser nor the block producer can steer it alone.
5. Each entry's score is the hash of seed and entry; the lowest scores win. The result is committed as a second sorted Merkle root.
6. During a challenge window, anyone can prove an excluded entry, an unknown winner, a wrong score or an unsorted list on-chain. A successful proof voids the draw and pays the bond to the challenger.

Entrants check themselves from a receipt link in any browser. Observers can verify a whole draw in the browser or with an open-source command-line tool against any MST RPC.

*(196 words)*

## 6. How will your project use MST Blockchain?

MST is the system of record for every draw. The `DrawRegistry` contract on MST stores each draw's seed commitment, terms hash, entry root and count, target block, revealed seed, winners root and cutoff, and holds the operator's bond. MST's block hashes provide the unpredictable half of each seed, and MST's events are the audit trail shown on every public draw page with explorer links.

All five fault proofs are verified by the contract on MST, so disputes are settled by the chain rather than by DrawLedger. The browser verifier and the CLI read state directly from MST RPC endpoints, which is what lets entrants avoid trusting our servers.

MST suits this well. Gas use is constant per draw (about 409,000 gas whether there are 25 or 5,000 entrants), so MST's low fees make a draw cost a fraction of a cent. Three-second blocks settle a draw in minutes. Operators sign in and transact with BridgeKey, MST's wallet. The project applies the commit-reveal approach MST promotes through FortunX to free-entry allocations, and can adopt FortunX as its seed module once it is published.

Current evidence: registry [address and explorer link] on MST Coral Testnet, deployed at block [n]; smoke-test draw transactions [links from deployments/mstCoral-smoke.json].

## 7. Stage of development

**Select "MVP" until the contracts are deployed on MST testnet and the smoke test has run.** After that, select **"Testnet-ready"**.

Accurate description of today's state: the full product is built and tested on a local EVM network (30 contract tests, 99% line coverage, HTTP and browser end-to-end tests, Slither clean of high and medium findings). It has not yet been deployed to MST testnet and has no users yet.

---

## Use of funds

| # | Item | Amount (USD) | Milestone it pays for |
| --- | --- | --- | --- |
| 1 | Protocol hardening and MST testnet launch: deployment, chain-specific fixes, drand seed input, chunked log reads | 3,000 | M1 |
| 2 | Product and hosted app: organiser onboarding flow, accessibility pass, nonce-based CSP, shared rate limiting, privacy notice | 2,200 | M2 |
| 3 | Independent security review of `DrawRegistry`, `SortedMerkle` and the core hashing library by an external reviewer (quote to be obtained) | 2,500 | M3 |
| 4 | Closed beta operations: organiser recruitment, onboarding calls, support, surveys, beta report | 1,000 | M4 |
| 5 | Infrastructure for 12 months: hosting, Supabase, domain, uptime monitoring | 600 | M2 to M4 |
| 6 | Legal review of free-entry terms and privacy notice for India | 700 | M4 |
| | **Total** | **10,000** | |

## Milestones

| Milestone | Week | Deliverables | Evidence for MST |
| --- | --- | --- | --- |
| M1 Testnet live | 2 | Registry deployed and source-verified on MST testnet; smoke-test draw; network parameters confirmed | Explorer links, `deployments/*.json`, CI passing |
| M2 Hosted product | 4 | App hosted with Supabase, health monitoring, all organiser and entrant flows on testnet | Public URL, a public demo draw verifiable by anyone |
| M3 Security | 6 | External review report, all high and medium findings fixed, updated internal assessment | Review report, fix commits, re-run Slither and tests |
| M4 Beta and mainnet readiness | 8 | ≥ 5 organisers, ≥ 5 completed draws, beta report, mainnet readiness checklist | Beta report with draw links, completed checklist |

Suggested payment split: 30% at M1, 20% at M2, 25% at M3, 25% at M4.

## Questions to confirm with MST before submitting

1. Which testnet reviewers expect: MST Testnet (91562037) or Coral (54635).
2. Eligibility, evaluation criteria, payment currency and schedule, reporting and IP terms (not published on the grant page).
3. Whether FortunX will be published as a contract or SDK, and whether MST prefers DrawLedger to build on it.
