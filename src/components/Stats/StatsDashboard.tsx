import { useGameStore } from '@/store/gameStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Stat } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
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

export function StatsDashboard() {
  const stats = useGameStore((s) => s.stats);
  const rtpHistory = useGameStore((s) => s.rtpHistory);
  const targetRTP = useGameStore((s) => s.config.math.targetRTP);
  const targetBF = useGameStore((s) => s.config.math.targetBF);
  const clearStats = useGameStore((s) => s.clearStats);
  const startSim = useGameStore((s) => s.startSim);
  const simRunning = useGameStore((s) => s.simRunning);
  const simProgress = useGameStore((s) => s.simProgress);
  const simReport = useGameStore((s) => s.simReport);
  const config = useGameStore((s) => s.config);

  const chartData = rtpHistory.map((d) => ({ x: d.round, rtp: d.rtp * 100 }));

  const exportCsv = () => {
    const csv = buildConfigCsv(config, stats, simReport);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const safe = config.meta.name.replace(/[^\w一-龥-]+/g, '_');
    downloadCsv(`slot_${safe}_${stamp}.csv`, csv);
  };

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>統計</CardTitle>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" /> 匯出 CSV
          </Button>
          <Button variant="ghost" size="sm" onClick={clearStats}>重置</Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-3 overflow-y-auto">
        <div className="grid grid-cols-2 gap-2">
          <Stat
            label="實際 RTP"
            value={pct(stats.actualRTP)}
            sub={`目標 ${pct(targetRTP, 1)}`}
          />
          <Stat
            label="實際 BF"
            value={stats.actualBF > 0 ? `1 / ${fmt(stats.actualBF, 0)}` : '—'}
            sub={`目標 1/${targetBF}`}
          />
          <Stat label="中獎率" value={pct(stats.hitRate)} />
          <Stat label="最大贏分" value={fmt(stats.maxWin)} />
          <Stat label="平均贏分" value={fmt(stats.averageWin)} />
          <Stat label="平均 Bonus 間隔" value={stats.averageBonusInterval > 0 ? fmt(stats.averageBonusInterval, 0) : '—'} />
          <Stat label="總盤數" value={fmtInt(stats.totalSpins)} />
          <Stat label="總局數" value={fmtInt(stats.totalRounds)} />
          <Stat label="總投注" value={fmtInt(stats.totalWager)} />
          <Stat label="總贏分" value={fmtInt(stats.totalWin)} />
        </div>

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
        <div className="space-y-2 rounded-md border border-border p-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
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
