import type { RoundResult } from '@/types';

/** Per-mode (NG / FG / BG / custom) stats used in the dashboard. */
export interface ModeStatsEntry {
  spins: number;
  hitRate: number;
  /** Average win expressed as ×bet (winning spins only). */
  avgWinX: number;
  /** Feature modes: number of complete sessions observed. */
  sessions: number;
  /** Feature modes: average session total as ×bet. */
  avgSessionX: number;
  /** Feature modes: smallest session total as ×bet (保底 verification). */
  minSessionX: number;
}

/** Computed, display-ready statistics snapshot. */
export interface StatsSnapshot {
  totalRounds: number;
  totalSpins: number;
  totalWager: number;
  totalWin: number;
  actualRTP: number; // totalWin / totalWager
  actualBF: number; // 1-in-N rounds that hit a bonus (0 if none)
  hitRate: number; // winning spins / total spins  (得分率)
  maxWinX: number; // largest single round win as ×bet
  averageWinX: number; // mean win over winning rounds as ×bet
  averageBonusInterval: number; // mean rounds between bonus triggers
  bonusCount: number;
  /** Per-mode breakdown keyed by mode label ('NG', 'FG', 'BG', custom kinds). */
  modeStats: Record<string, ModeStatsEntry>;
}

/**
 * Map an engine spin kind to a user-facing mode label. Custom kinds keep
 * their own label (uppercased) so 自訂模式 are reported separately.
 */
export function kindToModeLabel(kind: string): string {
  if (kind === 'normal') return 'NG';
  if (kind === 'freegame' || kind === 'free') return 'FG';
  if (kind === 'hold') return 'BG';
  return kind.toUpperCase();
}

interface ModeAccum {
  totalSpins: number;
  winningSpins: number;
  /** Cumulative win expressed in bet units (spinWin / bet). */
  totalWinX: number;
  /** Feature-session tracking (one session = one round's spins of this kind). */
  sessionCount: number;
  sessionWinXSum: number;
  minSessionX: number;
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
  private maxWinX = 0;
  private sumWinX = 0;
  private bonusCount = 0;
  private lastBonusRound = 0;
  private bonusIntervalSum = 0;
  private bonusIntervalCount = 0;
  private modes = new Map<string, ModeAccum>();

  reset(): void {
    this.totalRounds = 0;
    this.totalSpins = 0;
    this.totalWager = 0;
    this.totalWin = 0;
    this.winningRounds = 0;
    this.winningSpins = 0;
    this.maxWinX = 0;
    this.sumWinX = 0;
    this.bonusCount = 0;
    this.lastBonusRound = 0;
    this.bonusIntervalSum = 0;
    this.bonusIntervalCount = 0;
    this.modes.clear();
  }

  record(round: RoundResult): void {
    this.totalRounds++;
    this.totalWager += round.bet;
    this.totalWin += round.totalWin;
    this.totalSpins += round.spins.length;

    const naturalTotal = round.spins.reduce((a, s) => a + s.spinWin, 0);
    const winScale = naturalTotal > 0 ? round.totalWin / naturalTotal : 1;

    // per-mode session totals within this round (kind -> ×bet sum)
    const sessionX = new Map<string, number>();

    for (const s of round.spins) {
      const adjustedWin = s.spinWin * winScale;
      if (adjustedWin > 0) this.winningSpins++;

      // per-mode accumulation
      const mode = kindToModeLabel(s.kind);
      const m = this.mode(mode);
      m.totalSpins++;
      const winX = round.bet > 0 ? adjustedWin / round.bet : 0;
      if (adjustedWin > 0) {
        m.winningSpins++;
        m.totalWinX += winX;
      }
      if (mode !== 'NG') {
        sessionX.set(mode, (sessionX.get(mode) ?? 0) + winX);
      }
    }

    for (const [mode, totalX] of sessionX) {
      const m = this.mode(mode);
      m.sessionCount++;
      m.sessionWinXSum += totalX;
      if (totalX < m.minSessionX) m.minSessionX = totalX;
    }

    if (round.totalWin > 0) {
      this.winningRounds++;
      const winX = round.bet > 0 ? round.totalWin / round.bet : 0;
      this.sumWinX += winX;
      if (winX > this.maxWinX) this.maxWinX = winX;
    }

    if (round.triggeredFeatures.length > 0) {
      this.bonusCount++;
      if (this.lastBonusRound > 0) {
        this.bonusIntervalSum += this.totalRounds - this.lastBonusRound;
        this.bonusIntervalCount++;
      }
      this.lastBonusRound = this.totalRounds;
    }
  }

  private mode(label: string): ModeAccum {
    let m = this.modes.get(label);
    if (!m) {
      m = {
        totalSpins: 0,
        winningSpins: 0,
        totalWinX: 0,
        sessionCount: 0,
        sessionWinXSum: 0,
        minSessionX: Infinity,
      };
      this.modes.set(label, m);
    }
    return m;
  }

  snapshot(): StatsSnapshot {
    const modeStats: Record<string, ModeStatsEntry> = {};
    for (const [mode, m] of this.modes) {
      modeStats[mode] = {
        spins: m.totalSpins,
        hitRate: m.totalSpins > 0 ? m.winningSpins / m.totalSpins : 0,
        avgWinX: m.winningSpins > 0 ? m.totalWinX / m.winningSpins : 0,
        sessions: m.sessionCount,
        avgSessionX: m.sessionCount > 0 ? m.sessionWinXSum / m.sessionCount : 0,
        minSessionX: m.sessionCount > 0 && Number.isFinite(m.minSessionX) ? m.minSessionX : 0,
      };
    }
    return {
      totalRounds: this.totalRounds,
      totalSpins: this.totalSpins,
      totalWager: this.totalWager,
      totalWin: this.totalWin,
      actualRTP: this.totalWager > 0 ? this.totalWin / this.totalWager : 0,
      actualBF: this.bonusCount > 0 ? this.totalRounds / this.bonusCount : 0,
      hitRate: this.totalSpins > 0 ? this.winningSpins / this.totalSpins : 0,
      maxWinX: this.maxWinX,
      averageWinX: this.winningRounds > 0 ? this.sumWinX / this.winningRounds : 0,
      averageBonusInterval:
        this.bonusIntervalCount > 0
          ? this.bonusIntervalSum / this.bonusIntervalCount
          : 0,
      bonusCount: this.bonusCount,
      modeStats,
    };
  }
}
