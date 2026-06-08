import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useGameStore } from '@/store/gameStore';
import { History } from 'lucide-react';
import { fmt } from '@/lib/utils';

/** History — shows the most recent round breakdown (placeholder + live data). */
export function HistoryModal() {
  const lastRound = useGameStore((s) => s.lastRound);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <History className="h-4 w-4" /> 歷史
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogTitle>局歷史</DialogTitle>
        {!lastRound ? (
          <div className="text-sm text-muted-foreground">
            歷史佔位 —— 尚未進行任何局。
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">局</span><span>#{lastRound.roundId}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">押注</span><span>{fmt(lastRound.bet)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">總贏分</span><span className="text-emerald-400">{fmt(lastRound.totalWin)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">回報</span><span>{lastRound.roundReturn.toFixed(2)}×</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">盤數</span><span>{lastRound.spins.length}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">觸發功能</span><span>{lastRound.triggeredFeatures.join(', ') || '—'}</span></div>
            <div className="max-h-48 overflow-y-auto rounded border border-border p-2 font-mono text-[11px]">
              {lastRound.spins.map((s, i) => (
                <div key={i} className="flex justify-between">
                  <span className="text-muted-foreground">#{s.spinId} {s.kind}</span>
                  <span>{fmt(s.spinWin)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
