import { Fragment, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Stat } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fmt, fmtInt, pct } from '@/lib/utils';
import { buildConfigCsv, downloadCsv } from '@/lib/csv';
import { Download } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';

const MAX_SIM = 10_000_000;

export function StatsDashboard() {
  const stats = useGameStore((s) => s.stats);
  const rtpHistory = useGameStore((s) => s.rtpHistory);
  const targetRTP = useGameStore((s) => s.config.math.targetRTP);
  const targetBF = useGameStore((s) => s.config.math.targetBF);
  const mathTargets = useGameStore((s) => s.config.math.targets);
  const clearStats = useGameStore((s) => s.clearStats);
  const startSim = useGameStore((s) => s.startSim);
  const simRunning = useGameStore((s) => s.simRunning);
  const simProgress = useGameStore((s) => s.simProgress);
  const simReport = useGameStore((s) => s.simReport);
  const simRtpHistory = useGameStore((s) => s.simRtpHistory);
  const config = useGameStore((s) => s.config);
  const poolInfo = useGameStore((s) => s.poolInfo);

  const [simRounds, setSimRounds] = useState(50_000);

  // When a simulation has run, show its RTP curve in the main chart
  const activeHistory = simRtpHistory.length > 0 ? simRtpHistory : rtpHistory;
  const chartData = activeHistory.map((d) => ({ x: d.round, rtp: d.rtp * 100 }));

  const exportCsv = () => {
    const csv = buildConfigCsv(config, stats, simReport);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    downloadCsv(`slot_模擬數據_${stamp}.xls`, csv);
  };

  const rtpDiff = stats.totalRounds > 0 ? Math.abs(stats.actualRTP - targetRTP) : 0;
  const rtpAccent = stats.totalRounds === 0 ? undefined : rtpDiff < 0.02 ? 'green' as const : rtpDiff < 0.05 ? 'amber' as const : 'red' as const;

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>統計</CardTitle>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" /> 匯出 Excel
          </Button>
          <Button variant="ghost" size="sm" onClick={clearStats}>重置</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Key metrics */}
        <div className="grid grid-cols-2 gap-2">
          <Stat
            label="實際 RTP"
            value={pct(stats.actualRTP)}
            sub={`目標 ${pct(targetRTP, 1)}`}
            accent={rtpAccent}
          />
          <Stat
            label="實際 BF"
            value={stats.actualBF > 0 ? `1 / ${fmt(stats.actualBF, 0)}` : '—'}
            sub={`目標 1/${targetBF}`}
          />
          <Stat label="得分率" value={pct(stats.hitRate)} />
          <Stat label="最大贏分倍" value={`${fmt(stats.maxWinX)}x`} accent="amber" />
          <Stat label="平均贏分倍" value={`${fmt(stats.averageWinX)}x`} />
          <Stat label="平均 Bonus 間隔" value={stats.averageBonusInterval > 0 ? fmt(stats.averageBonusInterval, 0) : '—'} />
        </div>

        {/* Volume stats */}
        <div className="grid grid-cols-4 gap-1.5">
          {([
            ['局數', fmtInt(stats.totalRounds)],
            ['盤數', fmtInt(stats.totalSpins)],
            ['投注', fmtInt(stats.totalWager)],
            ['贏分', fmtInt(stats.totalWin)],
          ] as const).map(([k, v]) => (
            <div key={k} className="rounded-md bg-background/40 px-2 py-1.5 text-center">
              <div className="text-[9px] uppercase text-muted-foreground">{k}</div>
              <div className="text-[11px] font-semibold tabular-nums">{v}</div>
            </div>
          ))}
        </div>

        {/* Per-mode stats (得分率 / 平均得分倍 / 場次與保底) */}
        {(mathTargets.length > 0 || Object.keys(stats.modeStats).length > 0) && (
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">各模式得分率 / 平均得分倍 / 局次</div>
            <div className="divide-y divide-border rounded-md border border-border text-[11px]">
              <div className="grid grid-cols-[2.6rem_1fr_1fr_1fr_1fr] gap-1 bg-muted/30 px-2 py-1 font-semibold text-muted-foreground">
                <span>模式</span><span>得分率</span><span>均倍</span><span>局均倍</span><span>最低局倍</span>
              </div>
              {[...new Set([...mathTargets.map((t) => t.mode), ...Object.keys(stats.modeStats)])].map((mode) => {
                const t = mathTargets.find((x) => x.mode === mode);
                const actual = stats.modeStats[mode];
                const floor = t?.minWinX ?? 0;
                const floorOk = !actual || actual.sessions === 0 || actual.minSessionX >= floor - 1e-6;
                return (
                  <div key={mode} className="grid grid-cols-[2.6rem_1fr_1fr_1fr_1fr] gap-1 px-2 py-1">
                    <span className="font-semibold text-foreground">{mode}</span>
                    <span className="tabular-nums">{actual ? pct(actual.hitRate) : '—'}</span>
                    <span className="tabular-nums">{actual ? fmt(actual.avgWinX) : '—'}</span>
                    <span className="tabular-nums">
                      {actual && actual.sessions > 0 ? `${fmt(actual.avgSessionX)}x` : '—'}
                    </span>
                    <span className={`tabular-nums ${floorOk ? '' : 'font-semibold text-red-500'}`}>
                      {actual && actual.sessions > 0 ? `${fmt(actual.minSessionX)}x` : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 牌庫（產牌→取牌）資訊 */}
        {poolInfo && (
          <div className="space-y-1 rounded-md border border-border bg-muted/20 p-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">牌庫取牌模型</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
              <span className="text-muted-foreground">牌庫自然得分率</span>
              <span className="tabular-nums font-semibold">{pct(poolInfo.naturalHitRate)}</span>
              <span className="text-muted-foreground">NG 得分率</span>
              <span className="tabular-nums">{pct(poolInfo.observedHitRateNG)}</span>
              {poolInfo.features.map((f) => (
                <Fragment key={f.entryId}>
                  <span className="text-muted-foreground">{f.mode} 得分率</span>
                  <span className="tabular-nums">{pct(f.spinHitRate)}</span>
                </Fragment>
              ))}
              {poolInfo.boost !== 1 && (
                <>
                  <span className="text-muted-foreground">全域加成</span>
                  <span className="tabular-nums text-amber-500">×{fmt(poolInfo.boost, 3)}</span>
                </>
              )}
            </div>
            {poolInfo.notes.length > 0 && (
              <ul className="space-y-0.5 text-[10px] leading-snug text-amber-500">
                {poolInfo.notes.map((n, i) => (
                  <li key={i}>⚠ {n}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* RTP convergence chart */}
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            RTP 收斂曲線
          </div>
          <div className="h-36 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="x" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: 11 }}
                  formatter={(v: number) => [`${v.toFixed(2)}%`, 'RTP']}
                />
                <ReferenceLine y={targetRTP * 100} stroke="hsl(var(--accent))" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="rtp" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Simulation */}
        <div className="space-y-2 rounded-lg border border-border/60 bg-gradient-to-br from-secondary/30 to-transparent p-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            數學模擬（無畫面）
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={simRunning} onClick={() => startSim(10_000)}>
              10K
            </Button>
            <Button size="sm" variant="secondary" disabled={simRunning} onClick={() => startSim(100_000)}>
              100K
            </Button>
            <Button size="sm" variant="secondary" disabled={simRunning} onClick={() => startSim(1_000_000)}>
              1M
            </Button>
          </div>
          <div className="space-y-1">
            <div className="text-[11px] font-medium text-muted-foreground">自訂模擬局數（上限 {fmtInt(MAX_SIM)}）</div>
            <div className="flex gap-2">
              <Input
                type="number"
                min={1}
                max={MAX_SIM}
                step={1000}
                className="h-8 flex-1"
                value={simRounds}
                onChange={(e) => setSimRounds(Math.max(1, Math.min(MAX_SIM, Math.floor(Number(e.target.value) || 0))))}
              />
              <Button
                size="sm"
                disabled={simRunning || simRounds < 1}
                onClick={() => startSim(Math.min(MAX_SIM, simRounds))}
              >
                執行
              </Button>
            </div>
          </div>
          {simRunning && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${simProgress * 100}%` }} />
            </div>
          )}
          {simReport && !simRunning && (
            <div className="text-[11px] text-muted-foreground">
              {fmtInt(simReport.rounds)} 局 · RTP {pct(simReport.actualRTP)} · BF 1/
              {fmt(simReport.actualBF, 0)} · {fmtInt(simReport.roundsPerSec)} 局/秒
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
