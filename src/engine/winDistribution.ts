import type { WinTier } from '@/types';
import type { IRng } from './rng';

/**
 * Win-distribution tracker — RTP is the HARD constraint.
 *
 * Per round:
 *  1. Compute idealX = the winX that makes cumulative RTP converge to target.
 *  2. From the matching group (NG/FG), collect only tiers whose min ≤ idealX
 *     (i.e. the budget can afford the tier's minimum payout).
 *  3. Among affordable tiers, pick one by deficit-weighted random.
 *  4. Clamp idealX into that tier's [min, max].
 *  5. Result: RTP stays locked near target; tier percentages converge as
 *     the budget naturally fluctuates.
 */
export class WinDistTracker {
  private tierCounts: number[];
  private totalRounds = 0;
  private totalBet = 0;
  private totalWin = 0;

  constructor(
    private tiers: WinTier[],
    private targetRTP: number,
  ) {
    this.tierCounts = new Array(tiers.length).fill(0);
  }

  reset(): void {
    this.tierCounts.fill(0);
    this.totalRounds = 0;
    this.totalBet = 0;
    this.totalWin = 0;
  }

  /**
   * Adjust a round's total win.
   * @returns the adjusted totalWin (always ≥ 0).
   */
  adjust(
    _naturalTotalWin: number,
    bet: number,
    isFeatureRound: boolean,
    rng: IRng,
  ): number {
    if (this.tiers.length === 0 || bet <= 0) {
      return _naturalTotalWin;
    }

    const group = isFeatureRound ? 'FG' : 'NG';

    // Step 1: compute the ideal winX to converge cumulative RTP → target
    const newTotalBet = this.totalBet + bet;
    const idealWin = this.targetRTP * newTotalBet - this.totalWin;
    const idealX = Math.max(0, idealWin / bet);

    // Step 2: collect tiers in this group that the budget can afford
    //         (idealX >= tier.min means we can pay at least the tier minimum)
    const affordable: { idx: number; deficit: number }[] = [];
    const allInGroup: { idx: number; deficit: number; min: number }[] = [];

    for (let i = 0; i < this.tiers.length; i++) {
      const t = this.tiers[i];
      if (t.group !== group) continue;
      const actual = this.totalRounds > 0
        ? (this.tierCounts[i] / this.totalRounds) * 100
        : 0;
      const deficit = t.percent - actual;
      allInGroup.push({ idx: i, deficit, min: t.min });
      if (idealX >= t.min) {
        affordable.push({ idx: i, deficit });
      }
    }

    if (allInGroup.length === 0) {
      // No tiers for this group
      this.book(-1, bet, _naturalTotalWin);
      return _naturalTotalWin;
    }

    // Step 3: pick from affordable tiers; fall back to cheapest tier
    const pool = affordable.length > 0
      ? affordable
      : [allInGroup.reduce((a, b) => a.min < b.min ? a : b)];

    const targetIdx = this.weightedPick(pool, rng);

    // Step 4: clamp idealX into the tier's range
    const t = this.tiers[targetIdx];
    const lo = t.min;
    const hi = t.max ?? this.unboundedCap(t);

    // Small jitter for natural variance (±10% of tier spread, or ±0.2 for narrow tiers)
    const spread = hi - lo;
    const jitter = spread > 0.5
      ? (rng.next() - 0.5) * spread * 0.2
      : (rng.next() - 0.5) * 0.4;

    const clampedX = clamp(idealX + jitter, lo, hi);
    const adjustedWin = Math.max(0, clampedX * bet);

    this.book(targetIdx, bet, adjustedWin);
    return adjustedWin;
  }

  /* ------------------------------------------------------------------ */

  private weightedPick(
    cands: { idx: number; deficit: number }[],
    rng: IRng,
  ): number {
    if (cands.length === 1) return cands[0].idx;

    const minDef = Math.min(...cands.map((c) => c.deficit));
    const weights = cands.map((c) => Math.max(0.01, c.deficit - minDef + 1));
    const totalW = weights.reduce((s, w) => s + w, 0);

    let r = rng.next() * totalW;
    for (let i = 0; i < cands.length; i++) {
      r -= weights[i];
      if (r <= 0) return cands[i].idx;
    }
    return cands[cands.length - 1].idx;
  }

  private book(tierIdx: number, bet: number, win: number): void {
    this.totalRounds++;
    this.totalBet += bet;
    this.totalWin += win;
    if (tierIdx >= 0 && tierIdx < this.tierCounts.length) {
      this.tierCounts[tierIdx]++;
    }
  }

  private unboundedCap(t: WinTier): number {
    return Math.max(t.min * 2, t.min + 50);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
