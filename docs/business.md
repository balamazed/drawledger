# Business plan summary

## Executive summary

DrawLedger turns any lottery-style allocation into one that every entrant can check. It targets organisers who run free-entry draws repeatedly (housing societies, college clubs, hackathons, CSR programmes, creators) and later the platforms that host such draws. It is built on MST Blockchain, which supplies the public commitments, block-hash entropy and on-chain dispute resolution, at a cost per draw that is negligible.

## Market

Free-entry allocation by chance is common and fragmented rather than one large market:

| Segment | Why they draw by lot | Buying behaviour |
| --- | --- | --- |
| Housing societies and resident associations | Parking, amenity slots, flat or shop allotments | Committee decisions, price sensitive, word of mouth across societies |
| Colleges, clubs, fests, hackathons | Oversubscribed seats, swag, travel grants | Student leads change yearly; free tools spread quickly |
| CSR and scholarship programmes | Shortlists after eligibility screening | Need audit evidence for boards; will pay for certificates |
| Creators and brands | Giveaways | Credibility problem is public and acute; platform-driven |
| Admission and allotment portals (later) | Statutory lotteries | Long procurement; needs reserved categories and audits |

The common need across all of them is evidence, not randomness: everyone already has a random number generator.

## Competitive analysis

| Alternative | Strength | Weakness DrawLedger addresses |
| --- | --- | --- |
| Spreadsheet or script by the organiser | Free, familiar | No evidence at all |
| Public in-person draw | Visible to attendees | Doesn't scale, unverifiable afterwards, attendees only |
| RANDOM.ORG Third-Party Draw Service | Established, public records | Paid; entrants must trust the service; no way to prove a wrong result |
| Comment and giveaway pickers | Built into creator workflows | Opaque; routinely accused of being rigged |
| Chainlink VRF raffles on other chains | Strong randomness | Entrants need wallets and tokens; not available on MST; raffle contracts rarely give entrants inclusion receipts or fault proofs |
| MST FortunX (announced) | Native MST commit-reveal randomness | Not yet published; a randomness primitive, not an allocation product. DrawLedger can use it as its seed module |
| MST buildathon document-proof and voting apps | Anchor records on MST | Different problem; no selection logic or challenge mechanism |

**Differentiation:** entrant-held receipts that work without a wallet, a selection rule anyone can recompute, and on-chain fault proofs that make cheating costly, all at constant gas per draw.

## Revenue model

| Tier | Who | Pricing hypothesis |
| --- | --- | --- |
| Free | Draws up to 500 entrants | Free, with DrawLedger branding |
| Certified draw | Larger draws, CSR, brands | Per draw, with PDF certificate and custom receipts |
| Platform API | Giveaway, ticketing and event platforms | Monthly by volume |
| Institutional | Universities, housing boards | Annual licence, optional self-hosting |

Prices will be set after the beta measures what organisers value. Costs are low: hosting and database, RPC usage, and MST gas, which at about 409,000 gas per draw is small at MST's advertised fees.

## User acquisition

1. **Beta organisers as case studies.** Each completed draw becomes a public page anyone can verify; organisers share it with their members.
2. **Viral loop through entrants.** Every entrant sees "verified on MST by DrawLedger" on their receipt; the next organiser is often a past entrant.
3. **Community channels.** Resident association networks, college fest committees, hackathon organiser groups, creator communities.
4. **MST ecosystem.** Ecosystem listing, MasterStroke Academy as a teaching example of commit-reveal design, MST campus events.
5. **Integrations after launch.** API and embeddable widget for platforms that want a "provably fair" badge.

## Product roadmap

| Horizon | Scope |
| --- | --- |
| Grant period (8 weeks) | Testnet launch, hosted app, external review, closed beta |
| Months 3 to 4 | Reserved categories and quotas, waitlist export, drand seed input, SARAL sign-in if published |
| Months 5 to 6 | API keys, webhooks, embeddable widget |
| Months 7 to 9 | Mainnet after audit; paid tiers; white-label |
| Later | Weighted entries, multi-round draws, sealed-bid module reusing the commit-reveal core |

## Key risks

| Risk | Mitigation |
| --- | --- |
| Organisers do not value proof enough to switch | Free tier; zero setup for entrants; target segments with visible disputes |
| Regulatory confusion with lotteries | Free entry only, enforced in product and terms; legal review funded |
| Dependence on a young chain | Contract is standard EVM; the core library is chain-agnostic; MST remains the reference deployment |
