# DrawLedger HTTP API

Base URL: the app origin. All bodies are JSON. Errors return `{ "error": string }` (and `issues` for validation errors) with a 4xx or 5xx status. Big integers are decimal strings.

## Authentication

### `GET /api/auth/nonce`
Returns `{ nonce }`. Rate limit 20 per minute per IP. A nonce is valid once, for 10 minutes.

### `POST /api/auth/verify`
Body `{ message, signature }` where `message` is an EIP-4361 message for this host and chain. Sets the `dl_session` cookie. Returns `{ address }`. 401 if the domain, chain, expiry, signature or nonce is wrong. Rate limit 10 per minute per IP.

### `POST /api/auth/logout`, `GET /api/auth/me`
Clears the session; returns `{ address | null }`.

## Operator endpoints (session required, owner only)

### `GET /api/draws`
`{ draws: [{ id, slug, title, onchainId, status, entryCount, createdAt }] }`

### `POST /api/draws`
Register a draw already created on-chain.

```json
{
  "onchainId": "12",
  "txHash": "0x…",
  "terms": {
    "title": "Block C parking allotment 2026",
    "description": "Six covered slots",
    "eligibility": "Residents with a registered vehicle",
    "prize": "One covered slot",
    "winnerCount": 6,
    "challengePeriodSeconds": 86400,
    "operator": "0x…",
    "createdAt": "2026-11-01T10:00:00.000Z"
  },
  "publicSignup": false,
  "showWinnerLabels": false
}
```

Checks: transaction succeeded and targeted the registry, emitted `DrawCreated` for `onchainId`, on-chain operator equals the session, `keccak256(canonicalJson(terms))` equals the on-chain `metadataHash`, winner counts match. Returns `201 { id, slug }`.

### `GET /api/draws/:id`
Draw details with private entry data: `{ draw, entries: [{ id, label, contact, entryHash, receiptToken, source }], events }`.

### `PATCH /api/draws/:id`
Body `{ publicSignup?, showWinnerLabels? }`.

### `POST /api/draws/:id/entries`
Body `{ entries: [{ label, contact? }] }` (1 to 5,000). Contacts are lower-cased and unique per draw; duplicates are skipped and listed. 409 once entries are locked or the draw is not Open on-chain. Returns `201 { added, skipped }`.

### `DELETE /api/draws/:id/entries?entryId=…`
Removes an entry before lock.

### `POST /api/draws/:id/lock`
Body `{ unlock?: boolean }`. Locking returns `{ locked: true, commitment: { root, count } }` for the operator to pass to `closeEntries`. Unlocking is allowed only while the draw is still Open on-chain.

### `POST /api/draws/:id/result`
Requires on-chain status Revealed and that the stored entries reproduce the on-chain root. Returns `{ cutoff, root, count }` for `publishResult`.

## Public endpoints

### `GET /api/public/draws/:slug`
Public view: title, terms, chain ids, status, entry count, entries root, winners (`rank`, `entryHash`, `score`, `label` only if the operator enabled it), events with transaction hashes, `winnersMatch`.

### `POST /api/public/draws/:slug/sync`
Re-reads status and events from MST and returns the public view. Rate limit 30 per minute per IP.

### `POST /api/public/draws/:slug/signup`
Body `{ label, contact }` when public sign-up is on. Returns `201 { receiptToken }`; 409 if that contact already entered. Rate limit 5 per minute per IP.

### `GET /api/public/chain/:registry/:onchainId`
`{ entries: [entryHash…] (tree order, only after lock), winners: [{ entryHash, score }] | null, entriesLocked }`. Winners are returned only when their root equals the on-chain root. This is what `drawledger-verify --api` reads.

### `GET /api/receipts/:token`
`{ drawSlug, drawTitle, onchainId, label, salt, entryHash, issuedAt }`. The token is a bearer secret for one entry.

### `GET /api/health`
`{ ok, db, rpc: { ok, chainId, block }, configured, ms }`; 503 when anything is down.

### `GET /api/config`
`{ chainId, registry, deployBlock, configured }`.
