import { useGameStore } from '@/store/gameStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/misc';
import { pct } from '@/lib/utils';

export function DebugPanel() {
  const s = useGameStore();

  const rows: [string, React.ReactNode][] = [
    ['強開功能', s.cheats.armedTriggers.length > 0 ? s.cheats.armedTriggers.join(', ') : '—'],
['亂數種子', s.useFixedSeed ? String(s.seed) : '隨機'],
    ['目前 RTP', pct(s.stats.actualRTP)],
    ['目前 BF', s.stats.actualBF > 0 ? `1/${s.stats.actualBF.toFixed(0)}` : '—'],
    ['局數', s.roundId],
    ['盤數', s.spinId],
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>除錯面板</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1 font-mono text-[11px]">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-2 border-b border-border/40 py-1">
              <span className="text-muted-foreground">{k}</span>
              <span className="tabular-nums">{v}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
