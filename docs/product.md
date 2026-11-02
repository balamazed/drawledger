# DrawLedger: product definition

## Name and brand direction

**DrawLedger.** "Draw" names the job, "Ledger" names the proof. The name reads plainly to housing society secretaries and college club leads, not only to crypto users.

Brand direction:

- **Tone:** calm, procedural, exact. Like a notary, not a casino. No confetti, no "luck", no gambling imagery.
- **Visual system:** warm paper background, near-black ink, one deep green accent for "verified". Serif headings for gravitas, system sans for body, monospace for hashes.
- **Promise line:** "Draws that every entrant can check for themselves."

## Vision

Any allocation decided by chance, from a parking slot to a school seat, can be checked by every person it affects.

## Mission

Give organisers a free, simple tool that makes their draws provably fair, and give every entrant a receipt that proves it.

## Executive summary

Scarce things are often handed out by lottery: society parking slots and flats, event passes, hackathon seats, scholarship shortlists, school admission quotas, brand giveaways. Today these draws run on spreadsheets or opaque software, and losers have no way to check them. Complaints that a draw was rigged are routine.

DrawLedger commits every input of a draw on MST Blockchain before the result can be known: a hash of the organiser's secret seed, the terms, and the frozen entry list. The seed is then mixed with a future block hash. Winners are the entries with the lowest hash(seed, entry), which anyone can recompute. Each entrant holds a private receipt that proves they were in the draw and shows their own result. If the published result is wrong, one transaction proves it on-chain, voids the draw and pays the organiser's bond to the challenger.

## Problem statement

1. **Losers cannot check a draw.** Organisers run a script or a spreadsheet function and announce names. Nobody else can confirm the list, the randomness or the selection.
2. **Organisers cannot prove fairness.** Honest organisers face the same accusations as dishonest ones, because they have nothing to show.
3. **Existing "certified" options need trust in a third party.** Paid services such as RANDOM.ORG's third-party draws keep a public record, but entrants still have to trust the service's word.
4. **Blockchain raffles assume crypto users.** Chainlink VRF raffles require wallets, tokens and a supported chain. MST has no VRF service, and most entrants in these use cases do not hold crypto.

## Solution overview

| Need | How DrawLedger meets it |
| --- | --- |
| Inputs fixed before the result | Seed commitment and terms hash at creation; entries root at close; target block chosen by the contract |
| Unpredictable seed | hash(draw, organiser secret, target block hash): the organiser cannot know the block hash, the block producer cannot know the secret |
| Entrants without wallets | Receipt link per entrant; inclusion and result checked in the browser by reading MST directly |
| Privacy | Only salted entry hashes are public; names and contacts stay with the organiser |
| Disputes settled objectively | Five on-chain challenge types with Merkle proofs; a wrong result is voided and the bond is paid out |
| No trust in DrawLedger itself | Secret generated in the organiser's browser; open-source verifier library and CLI |

## User personas

| Persona | Context | Goal | Pain today |
| --- | --- | --- | --- |
| Society secretary | Allots 12 covered parking slots among 40 residents each year | Finish the allotment without a quarrel | Residents accuse the committee of favouritism |
| College club lead | 300 applicants for 60 hackathon seats | Select fairly and quickly | Applicants ask for proof the shortlist was random |
| Brand or creator running a giveaway | 2,000 entrants, 5 winners | Show the giveaway was real | Comment sections claim giveaways are fake |
| CSR scholarship manager | 800 eligible applicants, 50 awards after eligibility screening | Auditable selection for the board | Auditors want evidence of process |
| Entrant | Has a receipt link, no wallet | Know they were included and see their own result | No visibility at all |

## User journeys

**Organiser**

1. Signs in by signing a message with BridgeKey or MetaMask (no gas).
2. Fills in title, allocation, eligibility, number of winners and challenge window.
3. Browser creates the secret, downloads a backup, and sends `createDraw` with a refundable bond.
4. Adds entrants by CSV, one by one, or opens public sign-up (one entry per contact).
5. Sends each entrant their receipt link (exported as CSV).
6. Locks and closes entries on MST.
7. After three blocks, reveals the secret.
8. Clicks "Compute and publish result"; DrawLedger computes the winners and the organiser commits the result.
9. After the challenge window, finalises and withdraws the bond.

**Entrant**

1. Receives a receipt link (or signs up on the public page and gets one).
2. After entries close, the receipt page confirms inclusion with a Merkle proof checked against MST.
3. After the result, it shows "You won, rank N" or "You did not win" with the score versus the cutoff.
4. If their score was under the cutoff but they are not listed, the page offers a one-click on-chain challenge.

**Sceptical observer**

1. Opens the public draw page or `/verify`, enters a draw number.
2. Browser re-reads all commitments from MST and recomputes the result, or runs `drawledger-verify` against any RPC.

## Product requirements

### Functional

| ID | Requirement | Status |
| --- | --- | --- |
| F1 | Wallet sign-in with EIP-4361 messages, one-time nonces, 12 hour sessions | Built |
| F2 | Create a draw on MST with seed commitment, terms hash, winner count, challenge period, bond | Built |
| F3 | Secret generated client-side, stored locally and downloaded as a backup | Built |
| F4 | Server registers a draw only after verifying the creation transaction, operator and terms hash on-chain | Built |
| F5 | Add entrants manually, by CSV, or via public sign-up with per-contact dedupe | Built |
| F6 | Per-entrant receipt link with salt, entry hash and live result | Built |
| F7 | Lock entries, commit sorted Merkle root and count on-chain | Built |
| F8 | Reveal from local storage or backup file, with block countdown | Built |
| F9 | Compute winners from the on-chain seed and publish root and cutoff | Built |
| F10 | Public draw page with terms, timeline, transactions, winners | Built |
| F11 | In-browser verification and challenge submission | Built |
| F12 | Command-line verifier against any RPC | Built |
| F13 | Finalise and withdraw bond; fail draw if reveal is missed | Built |
| F14 | Optional public display of winner names | Built |
| F15 | Reserved-category quotas (school admission style) | Planned |
| F16 | drand beacon as a third seed input | Planned |

### Non-functional

| Area | Requirement |
| --- | --- |
| Privacy | No names, emails or phone numbers on-chain or in public APIs; only salted hashes |
| Trust | DrawLedger servers never hold the seed secret; every check reproducible without the app |
| Cost | Constant on-chain cost per draw regardless of entrant count (about 0.41 million gas for a full draw) |
| Scale | 5,000 entrants tested end-to-end; contract supports up to 1,048,576 entries |
| Security | Strict CSP and security headers, input validation on every endpoint, rate limits on public endpoints, pull-payment bonds |
| Accessibility | Works without a wallet for entrants; mobile layout |
| Portability | Postgres via `DATABASE_URL` (Supabase compatible) or embedded PGlite for local use |

## MVP scope (eight weeks)

Everything marked "Built" above, deployed to MST testnet, run with five or more real organisers in a closed beta, with a security assessment and beta report.

## Future roadmap

| Phase | Scope |
| --- | --- |
| After grant, months 3 to 4 | Reserved categories and quotas, waitlist ordering export, drand seed input, SARAL sign-in once MST publishes it |
| Months 5 to 6 | Embeddable widget and API keys for giveaway tools and event platforms; webhooks |
| Months 7 to 9 | Mainnet launch after external audit; paid certified draws; white-label for institutions |
| Later | Weighted entries, multi-round draws, sealed-bid tender module reusing the commit-reveal core |

## Revenue model

| Tier | Price idea | For |
| --- | --- | --- |
| Free | Up to 500 entrants per draw, DrawLedger branding | Societies, clubs, small giveaways |
| Certified draw | Per draw fee for larger draws, PDF certificate, custom domain receipts | Brands, CSR programmes |
| Platform API | Monthly plan by volume | Giveaway tools, ticketing and admissions platforms |
| Institutional | Annual licence, self-hosted option, support | Universities, housing boards |

On-chain costs are paid by the organiser's wallet in the MVP. A sponsored-gas option is a later feature that would let paid tiers cover gas for organisers.

## Go-to-market

1. **Closed beta (grant weeks 7 to 8):** five or more organisers from housing societies, college clubs and hackathons in India, recruited directly. Each runs at least one real draw.
2. **Proof-led content:** every finished beta draw becomes a public, verifiable example page.
3. **MST ecosystem:** listing in MST's ecosystem pages and MasterStroke Academy as a reference dApp for commit-reveal design.
4. **Communities with repeat draws:** housing society federations, college fest committees, hackathon organisers, creator giveaway communities.
5. **Partnerships after launch:** giveaway and event-ticketing platforms that want a "provably fair" badge through the API.
