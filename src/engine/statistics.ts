import type { RoundResult } from '@/types';

/** Computed, display-ready statistics snapshot. */
export interface StatsSnapshot {
  totalRounds: number;
  totalSpins: number;
  totalWager: number;
  totalWin: number;
  actualRTP: number; // totalWin / totalWager
  actualBF: number; // 1-in-N rounds that hit a bonus (0 if none)
  hitRate: number; // winning spins / total spins
  maxWin: number; // largest single round win
  averageWin: number; // mean win over winning rounds
  averageBonusInterval: number; // mean rounds between bonus triggers
  bonusCount: number;
}

/**
 * Statistics engine — incremental accumulation so 100K-round simulations stay
 * O(1) per round with no array growth.
 */
export class StatisticsEngine {
  private totalRounds = 0;
  private totalSpins = 0;
  private totalWager = 0;
  private totalWin = 0;
  private winningRounds = 0;
  private winningSpins = 0;
  private maxWin = 0;
  private bonusCount = 0;
  private lastBonusRound = 0;
  private bonusIntervalSum = 0;
  private bonusIntervalCount = 0;

  reset(): void {
    this.totalRounds = 0;
    this.totalSpins = 0;
    this.totalWager = 0;
    this.totalWin = 0;
    this.winningRounds = 0;
    this.winningSpins = 0;
    this.maxWin = 0;
    this.bonusCount = 0;
    this.lastBonusRound = 0;
    this.bonusIntervalSum = 0;
    this.bonusIntervalCount = 0;
  }

  record(round: RoundResult): void {
    this.totalRounds++;
    this.totalWager += round.bet;
    this.totalWin += round.totalWin;
    this.totalSpins += round.spins.length;

    for (const s of round.spins) if (s.spinWin > 0) this.winningSpins++;

    if (round.totalWin > 0) this.winningRounds++;
    if (round.totalWin > this.maxWin) this.maxWin = round.totalWin;

    if (round.triggeredFeatures.length > 0) {
      this.bonusCount++;
      if (this.lastBonusRound > 0) {
        this.bonusIntervalSum += this.totalRounds - this.lastBonusRound;
        this.bonusIntervalCount++;
      }
      this.lastBonusRound = this.totalRounds;
    }
  }

  snapshot(): StatsSnapshot {
    return {
      totalRounds: this.totalRounds,
      totalSpins: this.totalSpins,
      totalWager: this.totalWager,
      totalWin: this.totalWin,
      actualRTP: this.totalWager > 0 ? this.totalWin / this.totalWager : 0,
      actualBF: this.bonusCount > 0 ? this.totalRounds / this.bonusCount : 0,
      hitRate: this.totalSpins > 0 ? this.winningSpins / this.totalSpins : 0,
      maxWin: this.maxWin,
      averageWin: this.winningRounds > 0 ? this.totalWin / this.winningRounds : 0,
      averageBonusInterval:
        this.bonusIntervalCount > 0
          ? this.bonusIntervalSum / this.bonusIntervalCount
          : 0,
      bonusCount: this.bonusCount,
    };
  }
}
