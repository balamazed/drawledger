# Security assessment

**Scope:** `DrawRegistry.sol`, `SortedMerkle.sol`, `@drawledger/core`, the Next.js API and pages.
**Method:** internal design review against the threat model in [architecture.md](architecture.md#10-threat-model), adversarial unit tests, Slither 0.11 static analysis, end-to-end tests over HTTP and in a real browser.
**Date:** November 2026.

> This is an internal assessment by the development team. **No external audit has been conducted.** An independent audit is budgeted in the grant plan and is a precondition for mainnet.

## Summary

| Severity | Found | Fixed | Accepted or open |
| --- | --- | --- | --- |
| High | 0 | 0 | 0 |
| Medium | 4 | 2 | 2 |
| Low | 6 | 1 | 5 |
| Informational | 4 | 0 | 4 |

## Findings

| ID | Severity | Component | Finding | Status |
| --- | --- | --- | --- | --- |
| M-1 | Medium | Protocol | An organiser can add entries they control before closing (sybil stuffing). Cryptography proves the draw over the committed list, not who belongs on it. | **Accepted, documented.** Public entry counts, one entry per contact on public sign-up, terms committed on-chain, and the limit is stated on the How it works page. Roadmap: verified-contact sign-up. |
| M-2 | Medium | Protocol | An organiser colluding with the validator that produces the target block could bias the seed by withholding blocks. | **Open, roadmap.** Neither party can do it alone. Adding a drand beacon round as a third seed input removes it. |
| M-3 | Medium | API | Public sync endpoint read all logs from the draw's creation block on every call, letting many clients drive RPC load. | **Fixed.** Results cached 10 seconds per draw for non-owners, plus a per-IP rate limit. |
| M-4 | Medium | API | Cookie-authenticated writes relied only on `SameSite=Lax` against cross-site requests. | **Fixed.** All non-GET requests with a foreign `Origin` are rejected with 403 (tested). |
| L-1 | Low | Contract | A pending challenge transaction can be copied and front-run, so a bot rather than the entrant may collect the bond. The draw is invalidated either way. | **Accepted.** A commit-reveal challenge flow is possible later if bonds grow. |
| L-2 | Low | Contract | Challenge window and finalisation use `block.timestamp` (Slither `timestamp`). Validators can skew it by seconds against windows of 10 minutes to 30 days. | **Accepted.** |
| L-3 | Low | API | Rate limiting is in-memory per instance. | **Open.** Move to Redis or the hosting platform's limiter before running several instances. |
| L-4 | Low | Web | CSP allows `'unsafe-inline'` scripts because Next.js injects inline bootstrapping scripts. | **Open.** Move to nonce-based CSP via middleware. Other headers (frame-ancestors none, nosniff, no-referrer) are set. |
| L-5 | Low | Auth | Sign-in verifies EOA signatures only; smart-contract wallets (ERC-1271) cannot sign in. | **Accepted for MVP.** |
| L-6 | Low | Web | The seed secret is kept in `localStorage` until reveal; a successful XSS could read it. Knowing the secret early does not let anyone change the result, since the block hash is still unknown and only the operator can reveal. | **Mitigated** by CSP and React escaping; secret also downloaded as a file so it can be removed from the browser. |
| L-7 | Low | API | Receipt tokens travel in URL paths. | **Mitigated.** 144-bit random tokens, `Referrer-Policy: no-referrer`, rate-limited lookups, receipts reveal only the holder's own salt. |
| I-1 | Info | Contract | `challengeExcludedEntry` has cyclomatic complexity 12 (Slither). | Kept for readability; fully covered by tests. |
| I-2 | Info | Contract | Low-level `call` in `withdraw` (Slither). | Intended pull-payment pattern, non-reentrant, state cleared before the call. |
| I-3 | Info | Contract | EVM target `paris` gives slightly larger bytecode than Shanghai. | Chosen deliberately for compatibility with MST's fork. |
| I-4 | Info | Ops | Contracts are not upgradeable. | Intentional: draws must not change rules mid-flight; a new registry is deployed for new versions. |

## Controls verified by tests

| Control | Test |
| --- | --- |
| Only the operator can close, reveal, publish | `DrawRegistry.test.ts` "only the operator can close, reveal and publish" |
| Wrong secret, early or late reveal rejected | "rejects reveal before the target block and with a wrong secret", "fails a draw whose seed is not revealed in time" |
| Every challenge type succeeds against a faulty result | Five tests in "challenges" plus four in `edge.test.ts` |
| No challenge succeeds against an honest result | "rejects challenges against an honest result" |
| Forged proofs and late challenges rejected | "rejects forged proofs and challenges after the deadline", "rejects malformed exclusion brackets" |
| Bonds paid exactly once to the right party | "runs an honest draw end to end and returns the bond", challenge tests, treasury test |
| A rigged 1,000-entrant draw is overturned by an entrant | `e2e.protocol.test.ts` |
| SIWE nonce replay rejected; ownership enforced; tampered terms rejected; CSRF blocked; no contacts in public data | `apps/web/tests/api-flow.test.ts` |

## Static analysis

Slither 0.11 with 102 detectors over the compiled Hardhat artifacts: 0 high, 0 medium, 0 low beyond the `timestamp` note above, and 2 informational. Full output: `contracts/reports/slither.txt`.

Reproduce:

```bash
pip install slither-analyzer
cd contracts && npx hardhat compile && slither . --hardhat-ignore-compile --filter-paths node_modules
```

## Before mainnet

1. Independent audit of the two contracts and the core library's hashing and tree code.
2. drand (or equivalent beacon) as an additional seed input.
3. Nonce-based CSP and a shared rate limiter.
4. Verified-contact sign-up (email or SMS one-time code) for public draws.
5. Treasury set to a multisig, not a single key.
