# Mainnet readiness checklist

Status as of November 1, 2026. Mainnet deployment is out of scope for the buildGrant period; this checklist tracks what must be true first.

## Contracts

- [x] Unit, edge and end-to-end tests pass (30 contract tests, 99% line coverage)
- [x] Slither: no high or medium findings
- [x] Pull payments, reentrancy guard, no upgradeability, no admin functions over draws
- [x] EVM target compatible with MST (`paris`)
- [ ] Deployed and source-verified on MST testnet
- [ ] At least 5 real draws completed on testnet without incident
- [ ] External audit completed, all high and medium findings fixed
- [ ] drand or equivalent beacon added as a third seed input
- [ ] Treasury address is a multisig
- [ ] Minimum bond set for mainnet economics

## Application

- [x] Input validation on every endpoint
- [x] Ownership checks; operator-only data never in public endpoints
- [x] Single-use, domain- and chain-bound sign-in nonces
- [x] Cross-site write protection and security headers
- [x] Health endpoint
- [ ] Nonce-based Content Security Policy
- [ ] Shared rate limiter for multi-instance hosting
- [ ] Verified-contact public sign-up (email or SMS code)
- [ ] Production Postgres (Supabase) with backups and point-in-time recovery
- [ ] Error tracking and uptime alerts
- [ ] Load test of the public draw page and sync endpoint

## Operations and legal

- [ ] Privacy notice covering entrant data (DPDP Act, 2023)
- [ ] Terms of use restricting the service to free-entry draws
- [ ] Incident response contact and process
- [ ] Runbook for a failed reveal or a successful challenge (communication to entrants)
- [ ] Documentation for organisers and entrants

## Evidence

- [ ] Testnet registry address and explorer link
- [ ] Smoke-test transaction links
- [ ] Beta report
- [ ] Audit report
