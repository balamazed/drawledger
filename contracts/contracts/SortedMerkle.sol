// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title SortedMerkle
/// @notice Positional Merkle trees over sorted leaves, padded to a power of two with zero leaves.
/// Leaves and internal nodes carry different one-byte prefixes so a leaf can never pose as a node.
library SortedMerkle {
    function entryLeaf(bytes32 entryHash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(uint8(0), entryHash));
    }

    function winnerLeaf(uint256 score, bytes32 entryHash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(uint8(0), score, entryHash));
    }

    function node(bytes32 left, bytes32 right) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(uint8(1), left, right));
    }

    function depthFor(uint256 count) internal pure returns (uint256 depth) {
        uint256 size = 1;
        while (size < count) {
            size <<= 1;
            ++depth;
        }
    }

    /// @notice True if `leaf` sits at `index` in a tree of `count` real leaves with root `root`.
    function verify(bytes32 root, uint256 count, bytes32 leaf, uint256 index, bytes32[] calldata proof)
        internal
        pure
        returns (bool)
    {
        if (index >= count || proof.length != depthFor(count)) return false;
        bytes32 h = leaf;
        for (uint256 i; i < proof.length; ++i) {
            h = (index & 1) == 0 ? node(h, proof[i]) : node(proof[i], h);
            index >>= 1;
        }
        return h == root;
    }
}
