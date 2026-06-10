import type { GameConfig } from '@/types';
import type { StatsSnapshot } from '@/engine/statistics';
import type { SimulationReport } from '@/engine/simulation';

const S = {
  headerBg: '#1e3a5f',
  headerFg: '#ffffff',
  sectionBg: '#2a4a6b',
  sectionFg: '#ffffff',
  rowEven: '#f8fafc',
  rowOdd: '#eef2f7',
  border: '#c0c8d4',
  ok: '#16a34a',
  warn: '#d97706',
  bad: '#dc2626',
  labelBg: '#dbeafe',
};

function esc(v: string | number): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function deviation(actual: number, target: number, tolerance: number): { label: string; color: string } {
  if (target === 0) return { label: '', color: '' };
  const diff = Math.abs(actual - target) / target;
  if (diff <= tolerance) return { label: '✓', color: S.ok };
  if (diff <= tolerance * 2.5) return { label: '△', color: S.warn };
  return { label: '✗', color: S.bad };
}

function pct(v: number, d = 2): string {
  return `${(v * 100).toFixed(d)}%`;
}

const DASH = '—';

function sectionHeader(title: string, colspan: number): string {
  return `<tr><td colspan="${colspan}" style="background:${S.sectionBg};color:${S.sectionFg};font-weight:bold;font-size:13px;padding:6px 8px;text-align:left;">${esc(title)}</td></tr>`;
}

function th(text: string): string {
  return `<th style="background:${S.headerBg};color:${S.headerFg};font-weight:bold;padding:5px 10px;text-align:center;border:1px solid ${S.border};font-size:11px;">${esc(text)}</th>`;
}

function td(text: string | number, opts?: { align?: string; bg?: string; color?: string; bold?: boolean }): string {
  const a = opts?.align ?? 'center';
  const bg = opts?.bg ? `background:${opts.bg};` : '';
  const fg = opts?.color ? `color:${opts.color};` : '';
  const b = opts?.bold ? 'font-weight:bold;' : '';
  return `<td style="padding:4px 8px;text-align:${a};border:1px solid ${S.border};${bg}${fg}${b}font-size:11px;">${esc(text)}</td>`;
}

function statusTd(dev: { label: string; color: string }): string {
  if (!dev.label) return td('');
  return td(dev.label, { color: dev.color, bold: true });
}

export function buildConfigCsv(
  config: GameConfig,
  stats: StatsSnapshot,
  sim: SimulationReport | null,
): string {
  const lines: string[] = [];
  const push = (s: string) => lines.push(s);

  push('<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">');
  push('<head><meta charset="utf-8">');
  push('<style>table{border-collapse:collapse;font-family:"Microsoft JhengHei","PingFang TC",sans-serif;}');
  push(`td,th{white-space:nowrap;}</style></head><body>`);

  // ═══ Game Info ═══
  push('<table>');
  push(`<tr>${td('遊戲名稱', { bg: S.labelBg, bold: true, align: 'right' })}${td(config.meta.name, { align: 'left' })}${td('')}${td('版本', { bg: S.labelBg, bold: true, align: 'right' })}${td(config.meta.version, { align: 'left' })}</tr>`);
  push(`<tr>${td('', { bg: S.labelBg })}${td('', { align: 'left' })}${td('')}${td('匯出時間', { bg: S.labelBg, bold: true, align: 'right' })}${td(new Date().toLocaleString('zh-TW'), { align: 'left' })}</tr>`);
  push('</table><br>');

  // ═══ Target vs Actual ═══
  const simLabel = sim ? `模擬 (${sim.rounds.toLocaleString()} 局)` : '模擬';
  push('<table>');
  push(sectionHeader('目標 vs 實際', 5));
  push(`<tr>${th('指標')}${th('目標')}${th('即時統計')}${th(simLabel)}${th('狀態')}</tr>`);

  const dataRow = (label: string, target: string, live: string, simVal: string, dev: { label: string; color: string }, i: number) => {
    const bg = i % 2 === 0 ? S.rowEven : S.rowOdd;
    return `<tr>${td(label, { bg, bold: true, align: 'left' })}${td(target, { bg })}${td(live, { bg })}${td(simVal, { bg })}${statusTd(dev)}</tr>`;
  };

  let ri = 0;
  const rtpDev = (a: number) => deviation(a, config.math.targetRTP, 0.02);
  push(dataRow('RTP', pct(config.math.targetRTP), pct(stats.actualRTP, 4), sim ? pct(sim.actualRTP, 4) : DASH, sim ? rtpDev(sim.actualRTP) : rtpDev(stats.actualRTP), ri++));

  const bfDev = (a: number) => deviation(a, config.math.targetBF, 0.15);
  push(dataRow('BF (1/N)', `1/${config.math.targetBF}`, stats.actualBF > 0 ? `1/${stats.actualBF.toFixed(0)}` : DASH, sim ? (sim.actualBF > 0 ? `1/${sim.actualBF.toFixed(0)}` : DASH) : DASH, sim && sim.actualBF > 0 ? bfDev(sim.actualBF) : (stats.actualBF > 0 ? bfDev(stats.actualBF) : { label: '', color: '' }), ri++));

  push(dataRow('得分率', DASH, pct(stats.hitRate, 4), sim ? pct(sim.hitRate, 4) : DASH, { label: '', color: '' }, ri++));

  for (const t of config.math.targets ?? []) {
    const liveMode = stats.modeStats[t.mode];
    const simMode = sim?.modeStats[t.mode];
    const hrDev = (a: number) => deviation(a, t.hitRate, 0.05);
    const wxDev = (a: number) => deviation(a, t.avgWinX, 0.1);
    push(dataRow(`${t.mode} 得分率`, pct(t.hitRate), liveMode ? pct(liveMode.hitRate, 4) : DASH, simMode ? pct(simMode.hitRate, 4) : DASH, simMode ? hrDev(simMode.hitRate) : (liveMode ? hrDev(liveMode.hitRate) : { label: '', color: '' }), ri++));
    push(dataRow(`${t.mode} 均倍`, `${t.avgWinX.toFixed(2)}x`, liveMode ? `${liveMode.avgWinX.toFixed(4)}x` : DASH, simMode ? `${simMode.avgWinX.toFixed(4)}x` : DASH, simMode ? wxDev(simMode.avgWinX) : (liveMode ? wxDev(liveMode.avgWinX) : { label: '', color: '' }), ri++));
    push(dataRow(`${t.mode} 盤數`, DASH, liveMode ? String(liveMode.spins) : DASH, simMode ? String(simMode.spins) : DASH, { label: '', color: '' }, ri++));
  }

  // Stats detail rows
  push(`<tr><td colspan="5" style="background:${S.headerBg};height:2px;padding:0;"></td></tr>`);
  const statRow = (label: string, live: string, simVal: string, i: number) => {
    const bg = i % 2 === 0 ? S.rowEven : S.rowOdd;
    return `<tr>${td(label, { bg, bold: true, align: 'left' })}${td('', { bg })}${td(live, { bg })}${td(simVal, { bg })}${td('', { bg })}</tr>`;
  };
  push(statRow('最大贏分倍', `${stats.maxWinX.toFixed(2)}x`, sim ? `${sim.maxWinX.toFixed(2)}x` : DASH, ri++));
  push(statRow('平均贏分倍', `${stats.averageWinX.toFixed(2)}x`, sim ? `${sim.averageWinX.toFixed(2)}x` : DASH, ri++));
  push(statRow('平均 Bonus 間隔', stats.averageBonusInterval > 0 ? stats.averageBonusInterval.toFixed(0) : DASH, sim ? (sim.averageBonusInterval > 0 ? sim.averageBonusInterval.toFixed(0) : DASH) : DASH, ri++));
  push(statRow('Bonus 次數', String(stats.bonusCount), sim ? String(sim.bonusCount) : DASH, ri++));
  push(statRow('總局數', String(stats.totalRounds), sim ? String(sim.rounds) : DASH, ri++));
  push(statRow('總盤數', String(stats.totalSpins), sim ? String(sim.totalSpins) : DASH, ri++));
  push(statRow('總投注', String(stats.totalWager), sim ? String(sim.totalWager) : DASH, ri++));
  push(statRow('總贏分', String(stats.totalWin), sim ? String(sim.totalWin) : DASH, ri++));
  if (sim) {
    push(statRow('模擬種子', DASH, String(sim.seed ?? 'random'), ri++));
    push(statRow('模擬耗時', DASH, `${(sim.elapsedMs / 1000).toFixed(1)}s`, ri++));
    push(statRow('模擬效能', DASH, `${sim.roundsPerSec.toFixed(0)} 局/s`, ri++));
  }
  push('</table><br>');

  // ═══ Win Distribution ═══
  if (config.math.winDistribution?.length) {
    push('<table>');
    push(sectionHeader('各模式占比', 5));
    push(`<tr>${th('名稱')}${th('分組')}${th('區間下限')}${th('區間上限')}${th('占比%')}</tr>`);
    config.math.winDistribution.forEach((t, i) => {
      const bg = i % 2 === 0 ? S.rowEven : S.rowOdd;
      push(`<tr>${td(t.label, { bg, bold: true, align: 'left' })}${td(t.group, { bg })}${td(t.min, { bg })}${td(t.max ?? '∞', { bg })}${td(`${t.percent}%`, { bg })}</tr>`);
    });
    push('</table><br>');
  }

  // ═══ Symbol Payouts ═══
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
  const symHeaders = ['ID', '名稱', '類型', 'NG 權重', 'NG 堆疊', ...modeHeaders, ...payCols, '屬性'];
  const symColSpan = symHeaders.length;

  push('<table>');
  push(sectionHeader('圖示賠率', symColSpan));
  push(`<tr>${symHeaders.map(h => th(h)).join('')}</tr>`);
  config.symbols.forEach((s, i) => {
    const bg = i % 2 === 0 ? S.rowEven : S.rowOdd;
    const pays = Array.from({ length: maxPay }, (_, j) => s.payout[j] ?? '');
    const modeCols = modeList.flatMap((m) => {
      const e = s.modeWeights?.[m];
      return [String(e?.weight ?? ''), String(e?.stackWeight ?? '')];
    });
    const cells = [s.id, s.name, s.type.join('|'), String(s.weight), String(s.stackWeight ?? ''), ...modeCols, ...pays.map(String), (s.properties ?? []).join('|')];
    push(`<tr>${cells.map((c, ci) => td(c, { bg, align: ci <= 1 ? 'left' : 'center' })).join('')}</tr>`);
  });
  push('</table><br>');

  // ═══ Game Mechanics ═══
  if (config.triggers.length > 0 || config.features.length > 0) {
    push('<table>');
    push(sectionHeader('遊戲機制', 4));

    if (config.triggers.length > 0) {
      push(`<tr>${th('觸發 ID')}${th('名稱')}${th('目標功能')}${th('條件')}</tr>`);
      config.triggers.forEach((t, i) => {
        const bg = i % 2 === 0 ? S.rowEven : S.rowOdd;
        const conds = (t.rule.conditions ?? []).map((c) => `${c.symbolId ?? c.metric} ${c.comparator} ${c.value}`).join(' & ');
        push(`<tr>${td(t.id, { bg, align: 'left' })}${td(t.name, { bg, align: 'left' })}${td(t.target, { bg })}${td(`[${t.rule.logic}] ${conds}`, { bg, align: 'left' })}</tr>`);
      });
    }

    if (config.features.length > 0) {
      if (config.triggers.length > 0) push(`<tr><td colspan="4" style="height:6px;"></td></tr>`);
      push(`<tr>${th('功能 ID')}${th('類型')}${th('啟用')}${th('參數')}</tr>`);
      config.features.forEach((f, i) => {
        const bg = i % 2 === 0 ? S.rowEven : S.rowOdd;
        push(`<tr>${td(f.id, { bg, align: 'left' })}${td(f.type, { bg })}${td(f.enabled ? '是' : '否', { bg, color: f.enabled ? S.ok : S.bad })}${td(JSON.stringify(f.params), { bg, align: 'left' })}</tr>`);
      });
    }
    push('</table><br>');
  }

  // ═══ Animation ═══
  push('<table>');
  push(sectionHeader('動畫節奏', 3));
  push(`<tr>${th('')}${th('一般 (s)')}${th('極速 (s)')}</tr>`);
  const animRows: [string, string, string][] = [
    ['動畫類型', config.animation.type, config.animation.type],
    ['旋轉時間', (config.animation.normal.totalSpinTime / 1000).toFixed(2), (config.animation.turbo.totalSpinTime / 1000).toFixed(2)],
    ['停止間隔', (config.animation.normal.stopInterval / 1000).toFixed(2), (config.animation.turbo.stopInterval / 1000).toFixed(2)],
    ['回彈時間', (config.animation.normal.bounceDuration / 1000).toFixed(2), (config.animation.turbo.bounceDuration / 1000).toFixed(2)],
  ];
  animRows.forEach(([label, n, t], i) => {
    const bg = i % 2 === 0 ? S.rowEven : S.rowOdd;
    push(`<tr>${td(label, { bg, bold: true, align: 'left' })}${td(n, { bg })}${td(t, { bg })}</tr>`);
  });
  push('</table>');

  push('</body></html>');
  return lines.join('\n');
}

/** Download an HTML-table file as .xls (Excel opens it with formatting). */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
