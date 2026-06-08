import { useGameStore } from '@/store/gameStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/misc';
import { Input, Label } from '@/components/ui/input';
import { fmt } from '@/lib/utils';
import type { CheatKind } from '@/engine/cheats';

const CHEATS: { kind: CheatKind; label: string }[] = [
  { kind: 'FORCE_FG', label: '強制免費遊戲' },
  { kind: 'FORCE_BG', label: '強制 Bonus 遊戲' },
  { kind: 'FORCE_BONUS', label: '強制 Bonus' },
  { kind: 'FORCE_RESPIN', label: '強制 Respin' },
  { kind: 'FORCE_SCATTER', label: '強制 Scatter' },
  { kind: 'FORCE_MAX_WIN', label: '強制最大贏分' },
];

export function CheatBuyPanel() {
  const armed = useGameStore((s) => s.cheats.armed);
  const maxWinX = useGameStore((s) => s.cheats.maxWinX);
  const armCheat = useGameStore((s) => s.armCheat);
  const clearCheats = useGameStore((s) => s.clearCheats);
  const buyOptions = useGameStore((s) => s.config.buyOptions);
  const buy = useGameStore((s) => s.buy);
  const bet = useGameStore((s) => s.bet);
  const balance = useGameStore((s) => s.balance);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-primary">開發者作弊</div>
          {armed.length > 0 && <Button size="sm" variant="ghost" onClick={clearCheats}>清除</Button>}
        </div>
        <p className="text-[11px] text-muted-foreground">已裝填的作弊僅套用於下一盤。</p>
        <div className="grid grid-cols-2 gap-2">
          {CHEATS.map((c) => (
            <Button
              key={c.kind}
              size="sm"
              variant={armed.includes(c.kind) ? 'accent' : 'outline'}
              onClick={() => armCheat(c.kind)}
            >
              {c.label}
            </Button>
          ))}
        </div>
        <div>
          <Label>最大贏分倍數（× 押注）</Label>
          <Input type="number" defaultValue={maxWinX} onBlur={(e) => armCheat('FORCE_MAX_WIN', parseFloat(e.target.value))} />
        </div>
        {armed.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {armed.map((a) => <Badge key={a} variant="accent">{a}</Badge>)}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-primary">購買功能</div>
        <div className="space-y-2">
          {buyOptions.map((o) => {
            const cost = o.cost * bet;
            return (
              <div key={o.id} className="flex items-center justify-between rounded-md border border-border p-2">
                <div>
                  <div className="text-sm font-medium">{o.name}</div>
                  <div className="text-[11px] text-muted-foreground">{o.cost}× 押注 = {fmt(cost, 0)}</div>
                </div>
                <Button size="sm" variant="secondary" disabled={balance < cost} onClick={() => buy(o.id)}>
                  購買
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
