/**
 * Deterministic, seedable RNG.
 *
 * - Random mode: seeded from a high-entropy value at construction.
 * - Fixed Seed mode: the same seed always reproduces the exact same stream.
 *
 * Uses xmur3 to hash the seed into a 32-bit state, then mulberry32 to advance.
 * The internal state is serialisable via getState()/setState() so a run can be
 * paused, snapshotted and resumed bit-for-bit.
 */

export interface IRng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** Integer in [min, max] inclusive. */
  range(min: number, max: number): number;
  /** Pick a uniformly random element. */
  pick<T>(arr: readonly T[]): T;
  /** Weighted pick: index chosen proportional to weights[i]. */
  weightedIndex(weights: readonly number[]): number;
  /** The seed this RNG was created with (null in pure-random construction). */
  readonly seed: number | null;
  getState(): number;
  setState(state: number): void;
}

function xmur3(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export class Rng implements IRng {
  readonly seed: number | null;
  private state: number;

  /**
   * @param seed  number => fixed seed mode; undefined/null => random mode.
   */
  constructor(seed?: number | null) {
    if (seed === undefined || seed === null) {
      this.seed = null;
      // high-entropy random seed
      const entropy = `${Date.now()}-${Math.random()}-${Math.random()}`;
      this.state = xmur3(entropy);
    } else {
      this.seed = seed;
      this.state = xmur3(String(seed));
    }
  }

  next(): number {
    // mulberry32
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(maxExclusive: number): number {
    if (maxExclusive <= 0) return 0;
    return Math.floor(this.next() * maxExclusive);
  }

  range(min: number, max: number): number {
    return min + this.int(max - min + 1);
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)];
  }

  weightedIndex(weights: readonly number[]): number {
    let total = 0;
    for (let i = 0; i < weights.length; i++) total += weights[i];
    if (total <= 0) return this.int(weights.length);
    let r = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r < 0) return i;
    }
    return weights.length - 1;
  }

  getState(): number {
    return this.state >>> 0;
  }

  setState(state: number): void {
    this.state = state | 0;
  }
}

/** Convenience factory. */
export function createRng(seed?: number | null): Rng {
  return new Rng(seed);
}
