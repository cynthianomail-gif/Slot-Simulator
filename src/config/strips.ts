/**
 * Reel strip generator.
 *
 * Builds deterministic, evenly-spread reel strips from a per-symbol *count*
 * spec. Separating strip composition into data makes the math tunable:
 *   - Scatter / Bonus counts drive trigger frequency (BF), independent of pays.
 *   - Fill composition drives base-game hit rate.
 *   - Payout magnitudes (in GameConfig.symbols) drive RTP linearly.
 *
 * `buildStrip` uses a largest-remainder (Bresenham-style) scheduler so each
 * symbol's occurrences are spread as evenly as possible across the strip,
 * avoiding accidental clumping that would distort the math.
 */

export interface StripSpec {
  length: number;
  counts: Record<string, number>;
}

/** Build one strip whose symbol counts sum to `length`, evenly interleaved. */
export function buildStrip(spec: StripSpec): string[] {
  const syms = Object.keys(spec.counts);
  const desired = { ...spec.counts };
  const total = syms.reduce((a, s) => a + desired[s], 0);

  // Pad/trim with the most common fill symbol so counts sum to length.
  if (total !== spec.length && syms.length > 0) {
    const filler = syms.reduce((a, b) => (desired[a] >= desired[b] ? a : b));
    desired[filler] += spec.length - total;
  }

  const placed: Record<string, number> = {};
  syms.forEach((s) => (placed[s] = 0));

  const res: string[] = [];
  for (let i = 0; i < spec.length; i++) {
    let best: string | null = null;
    let bestScore = -Infinity;
    for (const s of syms) {
      if (placed[s] >= desired[s]) continue;
      // ideal cumulative count for s by position i+1 minus what we've placed
      const score = (desired[s] * (i + 1)) / spec.length - placed[s];
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }
    if (best === null) best = syms[0];
    res.push(best);
    placed[best]++;
  }
  return res;
}

/**
 * Default per-reel composition (tuned).
 *
 * Scatter (SC) count + strip length are tuned so that P(3+ scatter on a 5x3
 * board) ≈ 1/150 (the target BF). Fill counts favour low symbols to keep the
 * base-game return moderate; final RTP is dialled in via payout magnitudes.
 */
export const DEFAULT_STRIP_SPEC: StripSpec = {
  length: 100,
  counts: {
    WILD: 4,
    SC: 3, // tuned: 3/100 → BF ≈ 1/156 on a 5x3 board (target 1/150)
    BO: 3,
    H1: 4,
    H2: 6,
    H3: 8,
    H4: 10,
    LA: 12,
    LK: 14,
    LQ: 16,
    LJ: 20,
  },
};

/**
 * Per-reel WILD counts (asymmetric reels — a standard production technique for
 * fine RTP control). Difference vs DEFAULT_STRIP_SPEC.WILD is absorbed by LJ to
 * keep every strip length 100. Tuned so the board RTP ≈ 96%.
 */
export const DEFAULT_WILD_PER_REEL = [4, 4, 4, 3, 3];

/** Build the full set of column strips, applying per-reel wild counts. */
export function buildDefaultStrips(
  cols = 5,
  spec: StripSpec = DEFAULT_STRIP_SPEC,
  wildPerReel: number[] = DEFAULT_WILD_PER_REEL,
): string[][] {
  return Array.from({ length: cols }, (_, col) => {
    const w = wildPerReel[col];
    if (w === undefined || w === spec.counts.WILD) return buildStrip(spec);
    const s: StripSpec = { length: spec.length, counts: { ...spec.counts } };
    const delta = s.counts.WILD - w;
    s.counts.WILD = w;
    s.counts.LJ += delta;
    return buildStrip(s);
  });
}
