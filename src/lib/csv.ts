import type { GameConfig } from '@/types';
import type { StatsSnapshot } from '@/engine/statistics';
import type { SimulationReport } from '@/engine/simulation';

type Row = (string | number)[];

function cell(v: string | number): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function rowsToCsv(rows: Row[]): string {
  return rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

function deviation(actual: number, target: number, tolerance: number): string {
  if (target === 0) return '';
  const diff = Math.abs(actual - target) / target;
  if (diff <= tolerance) return '✓';
  if (diff <= tolerance * 2.5) return '△';
  return '✗';
}

const SEP_4 = ['════════════', '════════════', '════════════', '════════════'];
const SEP_5 = ['════════════', '════════════', '════════════', '════════════', '════════════'];

export function buildConfigCsv(
  config: GameConfig,
  stats: StatsSnapshot,
  sim: SimulationReport | null,
): string {
  const rows: Row[] = [];
  const pct = (v: number, d = 2) => `${(v * 100).toFixed(d)}%`;
  const dash = '—';

  // ═══ Header ═══
  rows.push(['遊戲名稱', config.meta.name, '', '版本', config.meta.version]);
  rows.push(['數學模式', config.math.mode, '', '匯出時間', new Date().toLocaleString('zh-TW')]);
  rows.push([]);

  // ═══ 目標 vs 實際 + 統計詳情（合併） ═══
  const simLabel = sim ? `模擬 (${sim.rounds.toLocaleString()} 局)` : '模擬';
  rows.push(['【 目標 vs 實際 】', '', '', '', '']);
  rows.push(SEP_5);
  rows.push(['指標', '目標', '即時統計', simLabel, '狀態']);
  rows.push(SEP_5);

  const rtpDev = (a: number) => deviation(a, config.math.targetRTP, 0.02);
  rows.push(['RTP', pct(config.math.targetRTP), pct(stats.actualRTP, 4), sim ? pct(sim.actualRTP, 4) : dash, sim ? rtpDev(sim.actualRTP) : rtpDev(stats.actualRTP)]);

  const bfTarget = config.math.targetBF;
  const bfDev = (a: number) => deviation(a, bfTarget, 0.15);
  rows.push(['BF (1/N)', `1/${bfTarget}`, stats.actualBF > 0 ? `1/${stats.actualBF.toFixed(0)}` : dash, sim ? (sim.actualBF > 0 ? `1/${sim.actualBF.toFixed(0)}` : dash) : dash, sim && sim.actualBF > 0 ? bfDev(sim.actualBF) : (stats.actualBF > 0 ? bfDev(stats.actualBF) : '')]);

  rows.push(['得分率', dash, pct(stats.hitRate, 4), sim ? pct(sim.hitRate, 4) : dash, '']);

  for (const t of config.math.targets ?? []) {
    const liveMode = stats.modeStats[t.mode];
    const simMode = sim?.modeStats[t.mode];
    const hrDev = (a: number) => deviation(a, t.hitRate, 0.05);
    const wxDev = (a: number) => deviation(a, t.avgWinX, 0.1);
    rows.push([`${t.mode} 得分率`, pct(t.hitRate), liveMode ? pct(liveMode.hitRate, 4) : dash, simMode ? pct(simMode.hitRate, 4) : dash, simMode ? hrDev(simMode.hitRate) : (liveMode ? hrDev(liveMode.hitRate) : '')]);
    rows.push([`${t.mode} 均倍`, `${t.avgWinX.toFixed(2)}x`, liveMode ? `${liveMode.avgWinX.toFixed(4)}x` : dash, simMode ? `${simMode.avgWinX.toFixed(4)}x` : dash, simMode ? wxDev(simMode.avgWinX) : (liveMode ? wxDev(liveMode.avgWinX) : '')]);
    rows.push([`${t.mode} 盤數`, dash, liveMode ? liveMode.spins : dash, simMode ? simMode.spins : dash, '']);
  }

  rows.push(SEP_5);

  // key stats rows
  rows.push(['最大贏分倍', '', `${stats.maxWinX.toFixed(2)}x`, sim ? `${sim.maxWinX.toFixed(2)}x` : dash, '']);
  rows.push(['平均贏分倍', '', `${stats.averageWinX.toFixed(2)}x`, sim ? `${sim.averageWinX.toFixed(2)}x` : dash, '']);
  rows.push(['平均 Bonus 間隔', '', stats.averageBonusInterval > 0 ? stats.averageBonusInterval.toFixed(0) : dash, sim ? (sim.averageBonusInterval > 0 ? sim.averageBonusInterval.toFixed(0) : dash) : dash, '']);
  rows.push(['Bonus 次數', '', stats.bonusCount, sim ? sim.bonusCount : dash, '']);
  rows.push(['總局數', '', stats.totalRounds, sim ? sim.rounds : dash, '']);
  rows.push(['總盤數', '', stats.totalSpins, sim ? sim.totalSpins : dash, '']);
  rows.push(['總投注', '', stats.totalWager, sim ? sim.totalWager : dash, '']);
  rows.push(['總贏分', '', stats.totalWin, sim ? sim.totalWin : dash, '']);

  if (sim) {
    rows.push(SEP_5);
    rows.push(['模擬種子', '', dash, sim.seed ?? 'random', '']);
    rows.push(['模擬耗時', '', dash, `${(sim.elapsedMs / 1000).toFixed(1)}s`, '']);
    rows.push(['模擬效能', '', dash, `${sim.roundsPerSec.toFixed(0)} 局/s`, '']);
  }

  rows.push([]);

  // ═══ 各模式占比 ═══
  if (config.math.winDistribution?.length) {
    rows.push(['【 各模式占比 】', '', '', '', '']);
    rows.push(SEP_5);
    rows.push(['名稱', '分組', '區間下限', '區間上限', '占比%']);
    rows.push(SEP_5);
    for (const t of config.math.winDistribution) {
      rows.push([t.label, t.group, t.min, t.max ?? '∞', `${t.percent}%`]);
    }
    rows.push([]);
  }

  // ═══ 圖示賠率 ═══
  rows.push(['【 圖示賠率 】']);
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
  const symHeader = ['ID', '名稱', '類型', 'NG 權重', 'NG 堆疊', ...modeHeaders, ...payCols, '屬性'];
  const symSep = symHeader.map(() => '════════════');
  rows.push(symSep);
  rows.push(symHeader);
  rows.push(symSep);
  for (const s of config.symbols) {
    const pays = Array.from({ length: maxPay }, (_, i) => s.payout[i] ?? '');
    const modeCols = modeList.flatMap((m) => {
      const e = s.modeWeights?.[m];
      return [e?.weight ?? '', e?.stackWeight ?? ''];
    });
    rows.push([s.id, s.name, s.type.join('|'), s.weight, s.stackWeight ?? '', ...modeCols, ...pays, (s.properties ?? []).join('|')]);
  }
  rows.push([]);

  // ═══ 遊戲機制（觸發+功能合併） ═══
  if (config.triggers.length > 0 || config.features.length > 0) {
    rows.push(['【 遊戲機制 】']);
    rows.push(SEP_4);

    if (config.triggers.length > 0) {
      rows.push(['觸發 ID', '名稱', '目標功能', '條件']);
      rows.push(SEP_4);
      for (const t of config.triggers) {
        const conds = (t.rule.conditions ?? [])
          .map((c) => `${c.symbolId ?? c.metric} ${c.comparator} ${c.value}`)
          .join(' & ');
        rows.push([t.id, t.name, t.target, `[${t.rule.logic}] ${conds}`]);
      }
      rows.push([]);
    }

    if (config.features.length > 0) {
      rows.push(['功能 ID', '類型', '啟用', '參數']);
      rows.push(SEP_4);
      for (const f of config.features) rows.push([f.id, f.type, f.enabled ? '是' : '否', JSON.stringify(f.params)]);
      rows.push([]);
    }
  }

  // ═══ 動畫節奏 ═══
  rows.push(['【 動畫節奏 】']);
  rows.push(['', '一般 (s)', '極速 (s)']);
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
