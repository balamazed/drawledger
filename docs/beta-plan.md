# Closed beta plan

**Status:** infrastructure ready, no participants recruited yet. No beta results exist and none are reported anywhere in this repository.

## Goal

Show that real organisers can run a draw end to end on MST testnet without help, and that their entrants can confirm their own result, before asking for mainnet funding.

## Participants (target)

| Segment | Target organisers | Typical draw | How to recruit |
| --- | --- | --- | --- |
| Housing societies | 2 | Parking or amenity slot allotment, 20 to 80 entrants | Resident welfare association groups, society management app communities |
| College clubs and fests | 2 | Workshop or event seat selection, 100 to 400 entrants | Student club leads, MST campus events (CampusVerse) |
| Hackathon and community organisers | 1 to 2 | Participant or swag selection, 50 to 500 entrants | Hackathon organiser networks, MST ambassador programme |
| Creators running giveaways | 1 | Free giveaway, 200 to 2,000 entrants | Direct outreach to small creators |

Target: at least 5 organisers, at least 5 completed draws, at least 300 entrants in total. Participants are named in reports only with written consent.

## Rules for beta draws

- Free entry only. No purchase, payment or stake of any kind to enter.
- Real prizes or allocations are the organiser's own responsibility; DrawLedger only runs the selection.
- Testnet tokens for bonds and gas are provided by the team from the faucet.
- Each organiser gets a 20-minute onboarding call and a one-page guide; after that they run the draw alone.

## Scenarios each organiser runs

1. Sign in with BridgeKey or MetaMask.
2. Create a draw with terms and winner count.
3. Add entrants by CSV or public sign-up.
4. Send receipt links to entrants.
5. Close entries, reveal, publish.
6. Share the public page; entrants open their receipts.
7. Finalise and withdraw the bond after the window.

One additional scenario run by the team with a volunteer organiser: a deliberately wrong published result, overturned by an entrant through the receipt page.

## Metrics

| Metric | How measured | Target |
| --- | --- | --- |
| Onboarding success | Organisers who sign in and create a draw without live help / organisers onboarded | ≥ 80% |
| Task completion | Draws reaching Finalized / draws created | ≥ 80% |
| Transaction success | Successful registry transactions / attempted (from receipts) | ≥ 95% |
| Entrant self-checks | Receipt pages opened after result / entrants | ≥ 30% |
| Error frequency | API 5xx and failed transactions per draw (server logs, receipts) | < 1 per draw |
| Time to run a draw | Created to Published, organiser active time | < 20 minutes active |
| Performance | p95 page load and API latency (hosting metrics) | < 1.5 s page, < 500 ms API |
| Satisfaction | Organiser survey: "Would you use this for your next draw?" | ≥ 4 of 5 average |
| Trust | Entrant survey: "I believe this draw was fair" before and after seeing the receipt | Increase |

## Feedback collection

- Organiser: 10-question form after their draw, plus a 15-minute call.
- Entrants: optional 3-question form linked from the receipt page.
- Issues logged in GitHub with labels `beta`, `bug`, `ux`.

## Infrastructure checklist

- [x] Organiser flows: sign-in, create, entries, close, reveal, publish, finalise, withdraw
- [x] Entrant receipts and public sign-up
- [x] Public verification page and CLI
- [x] Health endpoint for monitoring
- [ ] Contracts deployed to MST testnet (see deployment.md)
- [ ] Hosted app with Supabase
- [ ] Privacy notice and beta terms page
- [ ] Feedback forms
- [ ] Analytics events for the metrics above (privacy-preserving, no third-party trackers)

## Timeline (grant weeks)

| Week | Activity |
| --- | --- |
| 1 to 2 | Recruit organisers in parallel with protocol work |
| 5 to 6 | Confirm dates for each organiser's draw; prepare guides |
| 7 | Onboarding calls; first three draws |
| 8 | Remaining draws; surveys; beta report |

## Report template

The beta report will contain: participants (anonymised unless consented), draws with links to their public pages and transactions, each metric against target, issues found and fixes made, and verbatim feedback with permission.
