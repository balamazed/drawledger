import type { Hex } from "viem";
import type { Winner } from "./protocol";

export interface WinnerJson {
  entryHash: Hex;
  score: string;
}

export function winnersToJson(winners: Winner[]): WinnerJson[] {
  return winners.map((w) => ({ entryHash: w.entryHash, score: w.score.toString() }));
}

export function winnersFromJson(json: WinnerJson[]): Winner[] {
  return json.map((w) => ({ entryHash: w.entryHash.toLowerCase() as Hex, score: BigInt(w.score) }));
}

// JSON.stringify replacer that writes bigints as decimal strings
export function bigintReplacer(_key: string, value: unknown) {
  return typeof value === "bigint" ? value.toString() : value;
}
