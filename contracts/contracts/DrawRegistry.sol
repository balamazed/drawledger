// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SortedMerkle} from "./SortedMerkle.sol";

/// @title DrawRegistry
/// @notice Commit-reveal allocation draws. Winners are the entries with the lowest
/// score = keccak256(seed, entryHash). Any wrong published result can be proven on-chain,
/// which invalidates the draw and pays the operator's bond to the challenger.
contract DrawRegistry is ReentrancyGuard {
    enum Status {
        None,
        Open,
        Closed,
        Revealed,
        Published,
        Finalized,
        Invalid,
        Failed
    }

    enum Fault {
        None,
        ExcludedEntry,
        UnknownWinner,
        WrongScore,
        UnsortedWinners,
        UnsortedEntries
    }

    struct Draw {
        address operator;
        Status status;
        uint32 winnerCount;
        uint32 entryCount;
        uint32 publishedWinners;
        uint64 targetBlock;
        uint64 challengePeriod;
        uint64 challengeDeadline;
        uint96 bond;
        bytes32 seedCommitment;
        bytes32 metadataHash;
        bytes32 entriesRoot;
        bytes32 seed;
        bytes32 winnersRoot;
        uint256 cutoff;
    }

    /// @notice A leaf of the winners tree with its position and proof.
    struct WinnerProof {
        uint256 index;
        uint256 score;
        bytes32 entryHash;
        bytes32[] proof;
    }

    /// @notice A leaf of the entries tree with its position and proof.
    struct EntryProof {
        uint256 index;
        bytes32 entryHash;
        bytes32[] proof;
    }

    uint256 public constant REVEAL_DELAY = 3;
    uint256 public constant REVEAL_WINDOW = 250;
    uint64 public constant MIN_CHALLENGE_PERIOD = 10 minutes;
    uint64 public constant MAX_CHALLENGE_PERIOD = 30 days;
    uint32 public constant MAX_ENTRIES = 1 << 20;

    uint96 public immutable minBond;
    address public immutable treasury;

    uint256 public drawCount;
    mapping(uint256 => Draw) private _draws;
    mapping(address => uint256) public withdrawable;

    event DrawCreated(
        uint256 indexed drawId,
        address indexed operator,
        bytes32 seedCommitment,
        bytes32 metadataHash,
        uint32 winnerCount,
        uint64 challengePeriod,
        uint96 bond
    );
    event EntriesClosed(uint256 indexed drawId, bytes32 entriesRoot, uint32 entryCount, uint64 targetBlock);
    event SeedRevealed(uint256 indexed drawId, bytes32 secret, bytes32 targetBlockHash, bytes32 seed);
    event ResultPublished(
        uint256 indexed drawId, uint256 cutoff, bytes32 winnersRoot, uint32 winners, uint64 challengeDeadline
    );
    event ResultChallenged(uint256 indexed drawId, address indexed challenger, Fault fault);
    event RevealMissed(uint256 indexed drawId);
    event DrawFinalized(uint256 indexed drawId);
    event Withdrawn(address indexed account, uint256 amount);

    error BondTooLow();
    error BadParameter();
    error NotOperator();
    error WrongStatus(Status expected, Status actual);
    error TooEarly();
    error TooLate();
    error CommitmentMismatch();
    error InvalidProof();
    error NoFault();
    error NothingToWithdraw();
    error TransferFailed();

    constructor(uint96 minBond_, address treasury_) {
        if (treasury_ == address(0)) revert BadParameter();
        minBond = minBond_;
        treasury = treasury_;
    }

    modifier onlyOperator(uint256 drawId) {
        if (_draws[drawId].operator != msg.sender) revert NotOperator();
        _;
    }

    // ---------------------------------------------------------------- lifecycle

    /// @param seedCommitment keccak256(abi.encode(operator, secret)) for a fresh 32-byte secret
    /// @param metadataHash keccak256 of the draw's published terms (title, rules, eligibility)
    function createDraw(bytes32 seedCommitment, bytes32 metadataHash, uint32 winnerCount, uint64 challengePeriod)
        external
        payable
        returns (uint256 drawId)
    {
        if (msg.value < minBond) revert BondTooLow();
        if (msg.value > type(uint96).max) revert BadParameter();
        if (seedCommitment == bytes32(0) || winnerCount == 0) revert BadParameter();
        if (challengePeriod < MIN_CHALLENGE_PERIOD || challengePeriod > MAX_CHALLENGE_PERIOD) revert BadParameter();

        drawId = ++drawCount;
        Draw storage d = _draws[drawId];
        d.operator = msg.sender;
        d.status = Status.Open;
        d.winnerCount = winnerCount;
        d.challengePeriod = challengePeriod;
        d.bond = uint96(msg.value);
        d.seedCommitment = seedCommitment;
        d.metadataHash = metadataHash;

        emit DrawCreated(drawId, msg.sender, seedCommitment, metadataHash, winnerCount, challengePeriod, uint96(msg.value));
    }

    /// @notice Freezes the entry list. The target block's hash later joins the seed.
    function closeEntries(uint256 drawId, bytes32 entriesRoot, uint32 entryCount) external onlyOperator(drawId) {
        Draw storage d = _draws[drawId];
        _expect(d, Status.Open);
        if (entriesRoot == bytes32(0) || entryCount == 0 || entryCount > MAX_ENTRIES) revert BadParameter();

        d.entriesRoot = entriesRoot;
        d.entryCount = entryCount;
        d.targetBlock = uint64(block.number + REVEAL_DELAY);
        d.status = Status.Closed;

        emit EntriesClosed(drawId, entriesRoot, entryCount, d.targetBlock);
    }

    function reveal(uint256 drawId, bytes32 secret) external onlyOperator(drawId) {
        Draw storage d = _draws[drawId];
        _expect(d, Status.Closed);
        if (block.number <= d.targetBlock) revert TooEarly();
        if (block.number > d.targetBlock + REVEAL_WINDOW) revert TooLate();
        if (keccak256(abi.encode(msg.sender, secret)) != d.seedCommitment) revert CommitmentMismatch();

        bytes32 targetHash = blockhash(d.targetBlock);
        d.seed = keccak256(abi.encode(drawId, secret, targetHash));
        d.status = Status.Revealed;

        emit SeedRevealed(drawId, secret, targetHash, d.seed);
    }

    /// @notice Anyone can fail a draw whose operator did not reveal in time; the bond goes to the treasury.
    function markRevealMissed(uint256 drawId) external {
        Draw storage d = _draws[drawId];
        _expect(d, Status.Closed);
        if (block.number <= d.targetBlock + REVEAL_WINDOW) revert TooEarly();

        d.status = Status.Failed;
        withdrawable[treasury] += d.bond;
        emit RevealMissed(drawId);
    }

    function publishResult(uint256 drawId, uint256 cutoff, bytes32 winnersRoot, uint32 winners)
        external
        onlyOperator(drawId)
    {
        Draw storage d = _draws[drawId];
        _expect(d, Status.Revealed);
        uint32 expected = d.entryCount < d.winnerCount ? d.entryCount : d.winnerCount;
        if (winnersRoot == bytes32(0) || winners != expected) revert BadParameter();

        d.cutoff = cutoff;
        d.winnersRoot = winnersRoot;
        d.publishedWinners = winners;
        d.challengeDeadline = uint64(block.timestamp) + d.challengePeriod;
        d.status = Status.Published;

        emit ResultPublished(drawId, cutoff, winnersRoot, winners, d.challengeDeadline);
    }

    function finalize(uint256 drawId) external {
        Draw storage d = _draws[drawId];
        _expect(d, Status.Published);
        if (block.timestamp <= d.challengeDeadline) revert TooEarly();

        d.status = Status.Finalized;
        withdrawable[d.operator] += d.bond;
        emit DrawFinalized(drawId);
    }

    function withdraw() external nonReentrant {
        uint256 amount = withdrawable[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        withdrawable[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(msg.sender, amount);
    }

    // ---------------------------------------------------------------- challenges

    /// @notice An entry with score at or below the cutoff is missing from the winners tree.
    /// Pass `hasLower`/`hasUpper` false when the entry would sort before the first or after the last winner.
    function challengeExcludedEntry(
        uint256 drawId,
        EntryProof calldata entry,
        bool hasLower,
        WinnerProof calldata lower,
        bool hasUpper,
        WinnerProof calldata upper
    ) external {
        Draw storage d = _challengeable(drawId);
        _requireEntry(d, entry);
        uint256 s = _score(d.seed, entry.entryHash);
        if (s > d.cutoff) revert NoFault();

        if (hasLower) {
            _requireWinner(d, lower);
            if (lower.score >= s) revert NoFault();
        }
        if (hasUpper) {
            _requireWinner(d, upper);
            if (upper.score <= s) revert NoFault();
        }
        if (hasLower && hasUpper) {
            if (upper.index != lower.index + 1) revert InvalidProof();
        } else if (hasUpper) {
            if (upper.index != 0) revert InvalidProof();
        } else if (hasLower) {
            if (lower.index != d.publishedWinners - 1) revert InvalidProof();
        } else {
            revert InvalidProof();
        }

        _invalidate(drawId, d, Fault.ExcludedEntry);
    }

    /// @notice A published winner whose entry hash is not in the entries tree.
    function challengeUnknownWinner(
        uint256 drawId,
        WinnerProof calldata winner,
        bool hasLower,
        EntryProof calldata lower,
        bool hasUpper,
        EntryProof calldata upper
    ) external {
        Draw storage d = _challengeable(drawId);
        _requireWinner(d, winner);
        uint256 x = uint256(winner.entryHash);

        if (hasLower) {
            _requireEntry(d, lower);
            if (uint256(lower.entryHash) >= x) revert NoFault();
        }
        if (hasUpper) {
            _requireEntry(d, upper);
            if (uint256(upper.entryHash) <= x) revert NoFault();
        }
        if (hasLower && hasUpper) {
            if (upper.index != lower.index + 1) revert InvalidProof();
        } else if (hasUpper) {
            if (upper.index != 0) revert InvalidProof();
        } else if (hasLower) {
            if (lower.index != d.entryCount - 1) revert InvalidProof();
        } else {
            revert InvalidProof();
        }

        _invalidate(drawId, d, Fault.UnknownWinner);
    }

    /// @notice A published winner whose score is not keccak256(seed, entryHash), or is above the cutoff.
    function challengeWrongScore(uint256 drawId, WinnerProof calldata winner) external {
        Draw storage d = _challengeable(drawId);
        _requireWinner(d, winner);
        if (winner.score == _score(d.seed, winner.entryHash) && winner.score <= d.cutoff) revert NoFault();
        _invalidate(drawId, d, Fault.WrongScore);
    }

    /// @notice Two adjacent winners out of strictly ascending score order (includes duplicates).
    function challengeUnsortedWinners(uint256 drawId, WinnerProof calldata a, WinnerProof calldata b) external {
        Draw storage d = _challengeable(drawId);
        _requireWinner(d, a);
        _requireWinner(d, b);
        if (b.index != a.index + 1) revert InvalidProof();
        if (a.score < b.score) revert NoFault();
        _invalidate(drawId, d, Fault.UnsortedWinners);
    }

    /// @notice Two adjacent entries out of strictly ascending order (includes duplicates).
    function challengeUnsortedEntries(uint256 drawId, EntryProof calldata a, EntryProof calldata b) external {
        Draw storage d = _challengeable(drawId);
        _requireEntry(d, a);
        _requireEntry(d, b);
        if (b.index != a.index + 1) revert InvalidProof();
        if (uint256(a.entryHash) < uint256(b.entryHash)) revert NoFault();
        _invalidate(drawId, d, Fault.UnsortedEntries);
    }

    // ---------------------------------------------------------------- views

    function getDraw(uint256 drawId) external view returns (Draw memory) {
        return _draws[drawId];
    }

    function scoreOf(uint256 drawId, bytes32 entryHash) external view returns (uint256) {
        Draw storage d = _draws[drawId];
        if (d.seed == bytes32(0)) revert WrongStatus(Status.Revealed, d.status);
        return _score(d.seed, entryHash);
    }

    function isEntry(uint256 drawId, EntryProof calldata entry) external view returns (bool) {
        Draw storage d = _draws[drawId];
        return SortedMerkle.verify(
            d.entriesRoot, d.entryCount, SortedMerkle.entryLeaf(entry.entryHash), entry.index, entry.proof
        );
    }

    function isWinner(uint256 drawId, WinnerProof calldata winner) external view returns (bool) {
        Draw storage d = _draws[drawId];
        return SortedMerkle.verify(
            d.winnersRoot,
            d.publishedWinners,
            SortedMerkle.winnerLeaf(winner.score, winner.entryHash),
            winner.index,
            winner.proof
        );
    }

    // ---------------------------------------------------------------- internals

    function _score(bytes32 seed, bytes32 entryHash) internal pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(seed, entryHash)));
    }

    function _expect(Draw storage d, Status s) internal view {
        if (d.status != s) revert WrongStatus(s, d.status);
    }

    function _challengeable(uint256 drawId) internal view returns (Draw storage d) {
        d = _draws[drawId];
        _expect(d, Status.Published);
        if (block.timestamp > d.challengeDeadline) revert TooLate();
    }

    function _requireEntry(Draw storage d, EntryProof calldata e) internal view {
        bool ok =
            SortedMerkle.verify(d.entriesRoot, d.entryCount, SortedMerkle.entryLeaf(e.entryHash), e.index, e.proof);
        if (!ok) revert InvalidProof();
    }

    function _requireWinner(Draw storage d, WinnerProof calldata w) internal view {
        bool ok = SortedMerkle.verify(
            d.winnersRoot, d.publishedWinners, SortedMerkle.winnerLeaf(w.score, w.entryHash), w.index, w.proof
        );
        if (!ok) revert InvalidProof();
    }

    function _invalidate(uint256 drawId, Draw storage d, Fault fault) internal {
        d.status = Status.Invalid;
        withdrawable[msg.sender] += d.bond;
        emit ResultChallenged(drawId, msg.sender, fault);
    }
}
