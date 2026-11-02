import { encodePacked, keccak256, type Hex } from "viem";

const ZERO: Hex = "0x0000000000000000000000000000000000000000000000000000000000000000";

export function entryLeaf(entryHash: Hex): Hex {
  return keccak256(encodePacked(["uint8", "bytes32"], [0, entryHash]));
}

export function winnerLeaf(score: bigint, entryHash: Hex): Hex {
  return keccak256(encodePacked(["uint8", "uint256", "bytes32"], [0, score, entryHash]));
}

export function node(left: Hex, right: Hex): Hex {
  return keccak256(encodePacked(["uint8", "bytes32", "bytes32"], [1, left, right]));
}

export function depthFor(count: number): number {
  let size = 1;
  let depth = 0;
  while (size < count) {
    size <<= 1;
    depth++;
  }
  return depth;
}

// Positional tree over leaves in the given order, padded with zero leaves; mirrors SortedMerkle.sol
export class PositionalTree {
  readonly count: number;
  private readonly layers: Hex[][];

  constructor(leaves: Hex[]) {
    if (leaves.length === 0) throw new Error("tree needs at least one leaf");
    this.count = leaves.length;
    const size = 1 << depthFor(leaves.length);
    let layer = [...leaves, ...Array<Hex>(size - leaves.length).fill(ZERO)];
    this.layers = [layer];
    while (layer.length > 1) {
      const next: Hex[] = [];
      for (let i = 0; i < layer.length; i += 2) next.push(node(layer[i], layer[i + 1]));
      this.layers.push(next);
      layer = next;
    }
  }

  get root(): Hex {
    return this.layers[this.layers.length - 1][0];
  }

  proof(index: number): Hex[] {
    if (index < 0 || index >= this.count) throw new Error(`index ${index} out of range`);
    const path: Hex[] = [];
    let i = index;
    for (let level = 0; level < this.layers.length - 1; level++) {
      path.push(this.layers[level][i ^ 1]);
      i >>= 1;
    }
    return path;
  }
}

export function verifyProof(root: Hex, count: number, leaf: Hex, index: number, proof: Hex[]): boolean {
  if (index < 0 || index >= count || proof.length !== depthFor(count)) return false;
  let h = leaf;
  let i = index;
  for (const sibling of proof) {
    h = (i & 1) === 0 ? node(h, sibling) : node(sibling, h);
    i >>= 1;
  }
  return h.toLowerCase() === root.toLowerCase();
}
