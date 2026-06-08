import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/misc';
import { useGameStore } from '@/store/gameStore';
import { ScrollText } from 'lucide-react';

const COLOR: Record<string, 'default' | 'accent' | 'success' | 'muted' | 'outline'> = {
  ROUND_START: 'outline',
  ROUND_END: 'outline',
  SPIN_START: 'muted',
  REEL_STOP: 'muted',
  WIN: 'success',
  CASCADE: 'default',
  FG_TRIGGER: 'accent',
  BG_TRIGGER: 'accent',
  BONUS_TRIGGER: 'accent',
  FEATURE_START: 'accent',
  FEATURE_END: 'accent',
  CHEAT: 'default',
  BUY: 'default',
};

/** Event Viewer modal. */
export function EventLogModal() {
  const events = useGameStore((s) => s.events);
  const clearEvents = useGameStore((s) => s.clearEvents);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ScrollText className="h-4 w-4" /> 事件記錄
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <div className="flex items-center justify-between">
          <DialogTitle>事件檢視器</DialogTitle>
          <Button variant="ghost" size="sm" onClick={clearEvents}>清除</Button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto font-mono text-[11px]">
          {events.length === 0 && <div className="text-muted-foreground">尚無事件 —— 旋轉以產生記錄。</div>}
          {[...events].reverse().map((e, i) => (
            <div key={i} className="flex items-center gap-2 border-b border-border/50 py-1">
              <span className="w-10 shrink-0 text-muted-foreground">R{e.roundId}</span>
              <span className="w-8 shrink-0 text-muted-foreground">S{e.spinId}</span>
              <span className="w-8 shrink-0 text-muted-foreground">C{e.cascadeId}</span>
              <Badge variant={COLOR[e.type] ?? 'muted'}>{e.type}</Badge>
              <span className="truncate text-muted-foreground">{summarize(e.payload)}</span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function summarize(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return String(payload ?? '');
  const obj = payload as Record<string, unknown>;
  return Object.entries(obj)
    .filter(([k]) => k !== 'wins')
    .map(([k, v]) => `${k}=${typeof v === 'number' ? v : Array.isArray(v) ? `[${v.length}]` : JSON.stringify(v)}`)
    .join(' ');
}
