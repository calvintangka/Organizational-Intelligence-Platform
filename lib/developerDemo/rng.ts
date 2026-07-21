import { createHash } from "node:crypto";

function rotateLeft(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

/** xoshiro128** with SHA-256-derived named streams. */
export class NamedDeterministicRng {
  private readonly state: Uint32Array;

  constructor(seed: string, streamName: string) {
    const bytes = createHash("sha256")
      .update(`oip-demo|rng-v1|${seed}|${streamName}`, "utf8")
      .digest();
    this.state = new Uint32Array(4);
    for (let index = 0; index < 4; index += 1) {
      this.state[index] = bytes.readUInt32LE(index * 4);
    }
    if (this.state.every((value) => value === 0)) this.state[0] = 1;
  }

  nextUint32(): number {
    const result = Math.imul(rotateLeft(Math.imul(this.state[1], 5), 7), 9) >>> 0;
    const temporary = (this.state[1] << 9) >>> 0;
    this.state[2] ^= this.state[0];
    this.state[3] ^= this.state[1];
    this.state[1] ^= this.state[2];
    this.state[0] ^= this.state[3];
    this.state[2] ^= temporary;
    this.state[3] = rotateLeft(this.state[3], 11);
    return result;
  }

  integer(maxExclusive: number): number {
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 0x1_0000_0000) {
      throw new Error(`Invalid deterministic RNG bound: ${maxExclusive}`);
    }
    const limit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive;
    let value = this.nextUint32();
    while (value >= limit) value = this.nextUint32();
    return value % maxExclusive;
  }

  pick<T>(values: readonly T[]): T {
    if (values.length === 0) throw new Error("Cannot select from an empty deterministic collection.");
    return values[this.integer(values.length)];
  }

  weightedIndex(weights: readonly number[]): number {
    const total = weights.reduce((sum, weight) => {
      if (!Number.isSafeInteger(weight) || weight < 0) throw new Error("RNG weights must be non-negative integers.");
      return sum + weight;
    }, 0);
    if (total <= 0) throw new Error("At least one deterministic RNG weight must be positive.");
    const selected = this.integer(total);
    let cursor = 0;
    for (let index = 0; index < weights.length; index += 1) {
      cursor += weights[index];
      if (selected < cursor) return index;
    }
    return weights.length - 1;
  }

  shuffle<T>(values: readonly T[]): T[] {
    const copy = [...values];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const other = this.integer(index + 1);
      [copy[index], copy[other]] = [copy[other], copy[index]];
    }
    return copy;
  }
}
