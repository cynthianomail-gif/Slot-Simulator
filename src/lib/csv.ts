import type { GameConfig } from '@/types';
import type { StatsSnapshot } from '@/engine/statistics';
import type { SimulationReport } from '@/engine/simulation';

/**
 * CSV export. Produces a single, tidy multi-section CSV containing the full
 * GameConfig (every setting) plus the live statistics and the latest headless
 * simulation report. Designed to open cleanly in Excel / Google Sheets.
 */

type Row = (string | number)[];

function cell(v: string | number): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function rowsToCsv(rows: Row[]): string {
  return rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

export function buildConfigCsv(
  config: GameConfig,
  stats: StatsSnapshot,
  sim: SimulationReport | null,
): string {
  const rows: Row[] = [];
  const section = (title: string) => {
    rows.push([]);
    rows.push([`# ${title}`]);
  };

  // --- overview ---
  section('遊戲設定總覽 GAME OVERVIEW');
  rows.push(['欄位 Field', '值 Value']);
  rows.push(['遊戲名稱 Name', config.meta.name]);
  rows.push(['版本 Version', config.meta.version]);
  rows.push(['數學模式 Math Mode', config.math.mode]);
  rows.push(['目標 RTP Target RTP', config.math.targetRTP]);
  rows.push(['目標 BF Target BF (1 in N)', config.math.targetBF]);
  for (const t of config.math.targets ?? []) {
    rows.push([`${t.mode} 目標得分率 Target Hit Rate`, t.hitRate]);
    rows.push([`${t.mode} 目標均倍 Target Avg WinX`, t.avgWinX]);
  }
  rows.push(['派彩模式 Pay Mode', config.pay.mode]);
  rows.push(['最小連線 Min Match', config.pay.minMatch]);
  rows.push(['群集最小 Cluster Min', config.pay.clusterMin ?? '']);
  rows.push(['輪數 Columns', config.grid.cols]);
  rows.push(['盤面 Grid Shape', config.grid.shape.join('-')]);
  rows.push(['預設押注 Default Bet', config.bet.default]);
  rows.push(['押注級距 Bet Steps', config.bet.steps.join(' ')]);
  rows.push(['玩家 User', config.user.name]);
  rows.push(['餘額 Balance', config.user.balance]);

  // --- win distribution ---
  if (config.math.winDistribution?.length) {
    section('各模式占比 WIN DISTRIBUTION');
    rows.push(['名稱 Label', '分組 Group', '區間下限 Min', '區間上限 Max', '占比% Percent']);
    for (const t of config.math.winDistribution) {
      rows.push([t.label, t.group, t.min, t.max ?? '∞', t.percent]);
    }
  }

  // --- symbols ---
  section('圖示 SYMBOLS');
  const ranges = config.pay.payRanges;
  const maxPay = Math.max(0, ...config.symbols.map((s) => s.payout.length));
  const payCols = Array.from({ length: maxPay }, (_, i) => {
    if (ranges && i < ranges.length) {
      const [a, b] = ranges[i];
      return a === b ? `賠率x${a}` : `賠率x${a}~${b}`;
    }
    return `賠率x${config.pay.minMatch + i} (${config.pay.minMatch + i}OAK)`;
  });
  // collect all mode keys across all symbols
  const allModes = new Set<string>();
  for (const s of config.symbols) {
    if (s.modeWeights) for (const m of Object.keys(s.modeWeights)) allModes.add(m);
  }
  const modeList = [...allModes].sort();
  const modeHeaders = modeList.flatMap((m) => [`${m} 權重 ${m} Weight`, `${m} 堆疊權重 ${m} StackWeight`]);
  rows.push(['ID', '名稱 Name', '類型 Type', 'NG 權重 Weight', 'NG 堆疊權重 StackWeight', ...modeHeaders, ...payCols, '屬性 Properties']);
  for (const s of config.symbols) {
    const pays = Array.from({ length: maxPay }, (_, i) => s.payout[i] ?? '');
    const modeCols = modeList.flatMap((m) => {
      const e = s.modeWeights?.[m];
      return [e?.weight ?? '', e?.stackWeight ?? ''];
    });
    rows.push([s.id, s.name, s.type.join('|'), s.weight, s.stackWeight ?? '', ...modeCols, ...pays, (s.properties ?? []).join('|')]);
  }

  // --- wild ---
  if (config.wild) {
    section('百搭 WILD');
    rows.push(['替代符號 Substitutes', config.wild.substituteSymbols.join('|')]);
    rows.push(['倍數 Multiplier', config.wild.multiplier ?? 1]);
    rows.push(['展開 Expand', String(config.wild.expand ?? false)]);
    rows.push(['黏著 Sticky', String(config.wild.sticky ?? false)]);
  }

  // --- paylines ---
  if (config.pay.paylines?.length) {
    section('賠付線 PAYLINES');
    rows.push(['線 ID', '每軸行 Rows per column']);
    for (const l of config.pay.paylines) rows.push([l.id, l.rows.join('-')]);
  }

  // --- reels ---
  section('滾輪帶 REEL STRIPS');
  rows.push(['滾輪 Reel', '長度 Length', '內容 Strip']);
  config.reels.strips.forEach((strip, i) => rows.push([i + 1, strip.length, strip.join(' ')]));

  // --- triggers ---
  section('觸發條件 TRIGGERS');
  rows.push(['ID', '名稱 Name', '目標功能 Target', '邏輯 Logic', '條件 Conditions']);
  for (const t of config.triggers) {
    const conds = (t.rule.conditions ?? [])
      .map((c) => `${c.symbolId ?? c.metric}${c.comparator}${c.value}`)
      .join(' & ');
    rows.push([t.id, t.name, t.target, t.rule.logic, conds]);
  }

  // --- features ---
  section('功能 FEATURES');
  rows.push(['ID', '類型 Type', '啟用 Enabled', '參數 Params (JSON)']);
  for (const f of config.features) rows.push([f.id, f.type, String(f.enabled), JSON.stringify(f.params)]);

  // --- buy ---
  if (config.buyOptions.length) {
    section('購買功能 BUY OPTIONS');
    rows.push(['ID', '名稱 Name', '成本x押注 Cost(xBet)', '目標 Target']);
    for (const b of config.buyOptions) rows.push([b.id, b.name, b.cost, b.forceTarget]);
  }

  // --- animation ---
  section('動畫 ANIMATION');
  rows.push(['欄位 Field', '一般 Normal (s)', '極速 Turbo (s)']);
  rows.push(['類型 Type', config.animation.type, config.animation.type]);
  rows.push(['總旋轉時間 TotalSpinTime', config.animation.normal.totalSpinTime / 1000, config.animation.turbo.totalSpinTime / 1000]);
  rows.push(['速度倍率 SpinSpeed', config.animation.normal.spinSpeed, config.animation.turbo.spinSpeed]);
  rows.push(['停止間隔 StopInterval', config.animation.normal.stopInterval / 1000, config.animation.turbo.stopInterval / 1000]);
  rows.push(['回彈時間 BounceDuration', config.animation.normal.bounceDuration / 1000, config.animation.turbo.bounceDuration / 1000]);

  // --- live stats ---
  section('即時統計 LIVE STATISTICS');
  rows.push(['欄位 Field', '值 Value']);
  rows.push(['實際 RTP Actual RTP', `${(stats.actualRTP * 100).toFixed(4)}%`]);
  rows.push(['實際 BF Actual BF', stats.actualBF > 0 ? `1/${stats.actualBF.toFixed(2)}` : '']);
  rows.push(['得分率 Hit Rate', `${(stats.hitRate * 100).toFixed(4)}%`]);
  rows.push(['最大贏分 Max Win', stats.maxWin]);
  rows.push(['平均贏分 Average Win', stats.averageWin.toFixed(2)]);
  rows.push(['平均 Bonus 間隔 Avg Bonus Interval', stats.averageBonusInterval.toFixed(2)]);
  rows.push(['Bonus 次數 Bonus Count', stats.bonusCount]);
  rows.push(['總局數 Total Rounds', stats.totalRounds]);
  rows.push(['總盤數 Total Spins', stats.totalSpins]);
  rows.push(['總投注 Total Wager', stats.totalWager]);
  rows.push(['總贏分 Total Win', stats.totalWin]);
  // per-mode breakdown
  for (const [mode, m] of Object.entries(stats.modeStats)) {
    rows.push([`${mode} 得分率 Hit Rate`, `${(m.hitRate * 100).toFixed(4)}%`]);
    rows.push([`${mode} 平均得分倍 Avg WinX`, m.avgWinX.toFixed(4)]);
    rows.push([`${mode} 盤數 Spins`, m.spins]);
  }

  // --- simulation report ---
  if (sim) {
    section('模擬報告 SIMULATION REPORT');
    rows.push(['欄位 Field', '值 Value']);
    rows.push(['局數 Rounds', sim.rounds]);
    rows.push(['押注 Bet', sim.bet]);
    rows.push(['種子 Seed', sim.seed ?? 'random']);
    rows.push(['實際 RTP Actual RTP', `${(sim.actualRTP * 100).toFixed(4)}%`]);
    rows.push(['實際 BF Actual BF', sim.actualBF > 0 ? `1/${sim.actualBF.toFixed(2)}` : '']);
    rows.push(['得分率 Hit Rate', `${(sim.hitRate * 100).toFixed(4)}%`]);
    rows.push(['最大贏分 Max Win', sim.maxWin]);
    rows.push(['最大贏分倍數 Max Win x', (sim.maxWin / sim.bet).toFixed(1)]);
    rows.push(['平均贏分 Average Win', sim.averageWin.toFixed(2)]);
    rows.push(['平均 Bonus 間隔 Avg Bonus Interval', sim.averageBonusInterval.toFixed(2)]);
    rows.push(['耗時(ms) Elapsed', sim.elapsedMs.toFixed(0)]);
    rows.push(['效能 Rounds/s', sim.roundsPerSec.toFixed(0)]);
  }

  return rowsToCsv(rows);
}

/** Trigger a browser download of CSV text (UTF-8 BOM for Excel CJK support). */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
