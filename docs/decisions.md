# Technical decision log

| # | Decision | Alternatives considered | Reason |
| --- | --- | --- | --- |
| 1 | Winners = k lowest hash(seed, entry) | Fisher-Yates shuffle with the seed | Each entrant can check their own result from one hash; enables per-entry on-chain fault proofs |
| 2 | Sorted positional Merkle trees with zero padding | OpenZeppelin sorted-pair trees | Sorted pair hashing loses positions, so absence cannot be proven; positional trees over sorted leaves make non-membership provable with two neighbours |
| 3 | Distinct leaf and node prefixes, proof length fixed by count | Plain keccak of concatenations | Blocks second-preimage confusion between leaves and nodes |
| 4 | Fraud proofs instead of computing winners on-chain | On-chain selection | On-chain selection costs grow with entrants; fraud proofs keep every draw at constant gas |
| 5 | Seed = hash(drawId, secret, target block hash) | Block hash only; secret only; Chainlink VRF | Block hash alone is producer-influenced; secret alone is organiser-chosen; VRF is not available on MST |
| 6 | Target block 3 blocks after close, reveal window 250 blocks | Longer delays | Keeps the draw quick while staying inside the 256-block blockhash limit |
| 7 | Bond forfeited to treasury on missed reveal, to challenger on fault | No bond | Makes withholding and cheating costly and visible |
| 8 | Pull payments for bonds | Direct transfers | A reverting recipient can never block a state change |
| 9 | No upgradeability, no admin over draws | Proxy pattern | Rules of a running draw must not change; trust minimised |
| 10 | Secret generated and kept in the organiser's browser | Server-held secret | The service operator cannot bias or leak the seed |
| 11 | Entry hash = hash(drawId, salt), contacts off-chain | Hash of email | Emails are guessable; random salts make entries unlinkable and DPDP-friendlier |
| 12 | Terms committed as a hash, served by the app | IPFS | Terms are small and verifiable by hash; IPFS adds a dependency without improving the guarantee |
| 13 | One shared TypeScript core for server, browser and CLI | Separate implementations | Guarantees identical hashing and tree logic for every verifier |
| 14 | viem with an injected EIP-1193 wallet | wagmi, RainbowKit | Five contract calls do not justify the extra dependency; works with BridgeKey and MetaMask |
| 15 | Sign-In with Ethereum and an httpOnly JWT cookie | Email login, wallet-only stateless requests | Operators already hold wallets; no passwords stored |
| 16 | Postgres with PGlite fallback | SQLite, Supabase client SDK | Same SQL in tests and production; Supabase works through its connection string |
| 17 | EVM target paris, bundled solcjs | Latest fork, downloaded solc | Runs on whichever fork MST has; builds offline and in CI |
| 18 | MST Coral Testnet as default | MST Testnet 91562037 | Coral has a public faucet and a 2026 registry entry; both are configured |
| 19 | Free-entry draws only | General-purpose raffle | Avoids lottery and real-money gaming regulation, keeps the product focused on allocations |
