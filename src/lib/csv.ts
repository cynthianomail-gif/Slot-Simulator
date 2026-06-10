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
  const pct = (v: number, d = 2) => `${(v * 100).toFixed(d)}%`;
  const dash = '—';

  // --- game info ---
  section('遊戲資訊 GAME INFO');
  rows.push(['遊戲名稱', config.meta.name]);
  rows.push(['版本', config.meta.version]);
  rows.push(['數學模式', config.math.mode]);

  // --- target vs actual comparison ---
  section('目標 vs 實際 TARGET vs ACTUAL');
  const simLabel = sim ? `模擬 (${sim.rounds.toLocaleString()} 局)` : '模擬';
  rows.push(['指標', '目標', '即時統計', simLabel]);
  rows.push(['RTP', pct(config.math.targetRTP), pct(stats.actualRTP, 4), sim ? pct(sim.actualRTP, 4) : dash]);
  rows.push(['BF (1/N)', `1/${config.math.targetBF}`, stats.actualBF > 0 ? `1/${stats.actualBF.toFixed(0)}` : dash, sim ? (sim.actualBF > 0 ? `1/${sim.actualBF.toFixed(0)}` : dash) : dash]);
  rows.push(['得分率', dash, pct(stats.hitRate, 4), sim ? pct(sim.hitRate, 4) : dash]);
  for (const t of config.math.targets ?? []) {
    const liveMode = stats.modeStats[t.mode];
    const simMode = sim?.modeStats[t.mode];
    rows.push([`${t.mode} 得分率`, pct(t.hitRate), liveMode ? pct(liveMode.hitRate, 4) : dash, simMode ? pct(simMode.hitRate, 4) : dash]);
    rows.push([`${t.mode} 均倍`, `${t.avgWinX.toFixed(2)}x`, liveMode ? `${liveMode.avgWinX.toFixed(4)}x` : dash, simMode ? `${simMode.avgWinX.toFixed(4)}x` : dash]);
    rows.push([`${t.mode} 盤數`, dash, liveMode ? liveMode.spins : dash, simMode ? simMode.spins : dash]);
  }

  // --- statistics detail ---
  section('統計詳情 STATISTICS DETAIL');
  rows.push(['指標', '即時統計', sim ? simLabel : '模擬']);
  rows.push(['最大贏分倍', `${stats.maxWinX.toFixed(2)}x`, sim ? `${sim.maxWinX.toFixed(2)}x` : dash]);
  rows.push(['平均贏分倍', `${stats.averageWinX.toFixed(2)}x`, sim ? `${sim.averageWinX.toFixed(2)}x` : dash]);
  rows.push(['平均 Bonus 間隔', stats.averageBonusInterval > 0 ? stats.averageBonusInterval.toFixed(0) : dash, sim ? (sim.averageBonusInterval > 0 ? sim.averageBonusInterval.toFixed(0) : dash) : dash]);
  rows.push(['Bonus 次數', stats.bonusCount, sim ? sim.bonusCount : dash]);
  rows.push(['總局數', stats.totalRounds, sim ? sim.rounds : dash]);
  rows.push(['總盤數', stats.totalSpins, sim ? sim.totalSpins : dash]);
  rows.push(['總投注', stats.totalWager, sim ? sim.totalWager : dash]);
  rows.push(['總贏分', stats.totalWin, sim ? sim.totalWin : dash]);
  if (sim) {
    rows.push(['模擬種子', dash, sim.seed ?? 'random']);
    rows.push(['模擬耗時', dash, `${(sim.elapsedMs / 1000).toFixed(1)}s`]);
    rows.push(['模擬效能', dash, `${sim.roundsPerSec.toFixed(0)} 局/s`]);
  }

  // --- win distribution ---
  if (config.math.winDistribution?.length) {
    section('各模式占比 WIN DISTRIBUTION');
    rows.push(['名稱', '分組', '區間下限', '區間上限', '占比%']);
    for (const t of config.math.winDistribution) {
      rows.push([t.label, t.group, t.min, t.max ?? '∞', t.percent]);
    }
  }

  // --- symbols ---
  section('圖示賠率 SYMBOL PAYOUTS');
  const ranges = config.pay.payRanges;
  const maxPay = Math.max(0, ...config.symbols.map((s) => s.payout.length));
  const payCols = Array.from({ length: maxPay }, (_, i) => {
    if (ranges && i < ranges.length) {
      const [a, b] = ranges[i];
      return a === b ? `${a}顆` : `${a}~${b}顆`;
    }
    return `${config.pay.minMatch + i}顆`;
  });
  const allModes = new Set<string>();
  for (const s of config.symbols) {
    if (s.modeWeights) for (const m of Object.keys(s.modeWeights)) allModes.add(m);
  }
  const modeList = [...allModes].sort();
  const modeHeaders = modeList.flatMap((m) => [`${m} 權重`, `${m} 堆疊`]);
  rows.push(['ID', '名稱', '類型', 'NG 權重', 'NG 堆疊', ...modeHeaders, ...payCols, '屬性']);
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
    rows.push(['替代符號', config.wild.substituteSymbols.join(' | ')]);
    rows.push(['倍數', config.wild.multiplier ?? 1]);
    rows.push(['展開', config.wild.expand ? '是' : '否']);
    rows.push(['黏著', config.wild.sticky ? '是' : '否']);
  }

  // --- paylines ---
  if (config.pay.paylines?.length) {
    section('賠付線 PAYLINES');
    rows.push(['線 ID', '路徑']);
    for (const l of config.pay.paylines) rows.push([l.id, l.rows.join('-')]);
  }

  // --- triggers ---
  section('觸發條件 TRIGGERS');
  rows.push(['ID', '名稱', '目標功能', '邏輯', '條件']);
  for (const t of config.triggers) {
    const conds = (t.rule.conditions ?? [])
      .map((c) => `${c.symbolId ?? c.metric} ${c.comparator} ${c.value}`)
      .join(' & ');
    rows.push([t.id, t.name, t.target, t.rule.logic, conds]);
  }

  // --- features ---
  section('功能 FEATURES');
  rows.push(['ID', '類型', '啟用', '參數']);
  for (const f of config.features) rows.push([f.id, f.type, f.enabled ? '是' : '否', JSON.stringify(f.params)]);

  // --- animation ---
  section('動畫節奏 ANIMATION');
  rows.push(['欄位', '一般 (s)', '極速 (s)']);
  rows.push(['動畫類型', config.animation.type, config.animation.type]);
  rows.push(['旋轉時間', (config.animation.normal.totalSpinTime / 1000).toFixed(2), (config.animation.turbo.totalSpinTime / 1000).toFixed(2)]);
  rows.push(['停止間隔', (config.animation.normal.stopInterval / 1000).toFixed(2), (config.animation.turbo.stopInterval / 1000).toFixed(2)]);
  rows.push(['回彈時間', (config.animation.normal.bounceDuration / 1000).toFixed(2), (config.animation.turbo.bounceDuration / 1000).toFixed(2)]);

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
