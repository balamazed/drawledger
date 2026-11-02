# DrawRegistry contract reference

Source: `contracts/contracts/DrawRegistry.sol`, `contracts/contracts/SortedMerkle.sol`. Solidity 0.8.24, optimizer 200 runs, EVM target `paris`.

## Constructor

| Parameter | Meaning |
| --- | --- |
| `minBond` (uint96) | Minimum bond in wei an operator must lock per draw |
| `treasury` (address) | Receives bonds of draws whose seed was never revealed; cannot be zero |

## Constants

| Name | Value | Meaning |
| --- | --- | --- |
| `REVEAL_DELAY` | 3 blocks | Target block = close block + 3 |
| `REVEAL_WINDOW` | 250 blocks | Reveal allowed until target + 250 (blockhash covers 256) |
| `MIN_CHALLENGE_PERIOD` | 10 minutes | Shortest challenge window |
| `MAX_CHALLENGE_PERIOD` | 30 days | Longest challenge window |
| `MAX_ENTRIES` | 1,048,576 | Tree depth at most 20 |

## Hash definitions (mirrored in `@drawledger/core`)

| Value | Definition |
| --- | --- |
| seed commitment | `keccak256(abi.encode(operator, secret))` |
| entry hash | `keccak256(abi.encode(drawId, salt))` (computed off-chain) |
| seed | `keccak256(abi.encode(drawId, secret, blockhash(targetBlock)))` |
| score | `uint256(keccak256(abi.encodePacked(seed, entryHash)))` |
| entry leaf | `keccak256(abi.encodePacked(uint8(0), entryHash))` |
| winner leaf | `keccak256(abi.encodePacked(uint8(0), score, entryHash))` |
| node | `keccak256(abi.encodePacked(uint8(1), left, right))` |
| terms hash | `keccak256` of canonical JSON (sorted keys) of the terms object |

Trees are positional over leaves in sorted order (entries ascending by hash, winners ascending by score), padded with zero leaves to the next power of two. A proof is valid only if `index < count` and `proof.length == ceil(log2(count))`.

## Functions

| Function | Caller | Status needed | Effect |
| --- | --- | --- | --- |
| `createDraw(seedCommitment, metadataHash, winnerCount, challengePeriod)` payable | anyone (becomes operator) | none | New draw, status Open, bond = msg.value ≥ minBond |
| `closeEntries(drawId, entriesRoot, entryCount)` | operator | Open | Stores root and count, sets targetBlock, status Closed |
| `reveal(drawId, secret)` | operator | Closed, target < block ≤ target + 250 | Checks commitment, stores seed, status Revealed |
| `markRevealMissed(drawId)` | anyone | Closed, block > target + 250 | Status Failed, bond credited to treasury |
| `publishResult(drawId, cutoff, winnersRoot, winners)` | operator | Revealed | `winners` must equal min(k, entryCount); opens challenge window |
| `challengeExcludedEntry(drawId, entry, hasLower, lower, hasUpper, upper)` | anyone | Published, before deadline | Status Invalid, bond to caller |
| `challengeUnknownWinner(drawId, winner, hasLower, lower, hasUpper, upper)` | anyone | same | same |
| `challengeWrongScore(drawId, winner)` | anyone | same | same |
| `challengeUnsortedWinners(drawId, a, b)` | anyone | same | same |
| `challengeUnsortedEntries(drawId, a, b)` | anyone | same | same |
| `finalize(drawId)` | anyone | Published, after deadline | Status Finalized, bond credited to operator |
| `withdraw()` | anyone with a balance | n/a | Sends `withdrawable[msg.sender]`, non-reentrant |
| `getDraw`, `scoreOf`, `isEntry`, `isWinner`, `withdrawable`, `drawCount` | view | n/a | Reads |

Proof structs:

```solidity
struct EntryProof  { uint256 index; bytes32 entryHash; bytes32[] proof; }
struct WinnerProof { uint256 index; uint256 score; bytes32 entryHash; bytes32[] proof; }
```

## Events

`DrawCreated`, `EntriesClosed`, `SeedRevealed` (includes secret and target block hash, so anyone can recompute the seed), `ResultPublished`, `ResultChallenged` (with `Fault`), `RevealMissed`, `DrawFinalized`, `Withdrawn`.

## Errors

`BondTooLow`, `BadParameter`, `NotOperator`, `WrongStatus(expected, actual)`, `TooEarly`, `TooLate`, `CommitmentMismatch`, `InvalidProof`, `NoFault`, `NothingToWithdraw`, `TransferFailed`.

## Gas (Hardhat network, measured by `test/e2e.protocol.test.ts` and `scripts/smoke.ts`)

| Transaction | Gas | Depends on entrant count? |
| --- | --- | --- |
| createDraw | 159,135 | no |
| closeEntries | 57,441 to 57,453 | no |
| reveal | 56,652 to 56,664 | no |
| publishResult | 80,777 | no |
| finalize | 54,540 | no |
| challengeExcludedEntry (1,000 entries, 50 winners) | 94,109 | logarithmically (proof length) |

A full draw costs about 409,000 gas whether it has 25 or 5,000 entrants. At MST's advertised average fee of about 0.001 MSTC per transaction, a draw costs about 0.005 MSTC plus the refundable bond.
