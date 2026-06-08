import { useGameStore } from '@/store/gameStore';
import { Input, Label } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/misc';
import { parseNums, parseList } from './fields';
import { symbolStyle } from '@/lib/symbolStyle';
import { Plus, Trash2 } from 'lucide-react';
import type { SymbolType } from '@/types';

export function SymbolEditor() {
  const symbols = useGameStore((s) => s.config.symbols);
  const update = useGameStore((s) => s.updateConfig);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>共 {symbols.length} 個圖示</Label>
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            update((c) => {
              c.symbols.push({
                id: `NEW${c.symbols.length}`,
                name: '新圖示',
                type: ['normal'],
                weight: 5,
                payout: [1, 2, 5],
              });
            })
          }
        >
          <Plus className="h-4 w-4" /> 新增
        </Button>
      </div>

      <div className="space-y-2">
        {symbols.map((sym, i) => {
          const style = symbolStyle(sym, sym.id);
          return (
            <div key={i} className="rounded-md border border-border p-2">
              <div className="mb-2 flex items-center gap-2">
                <div className={`flex h-7 w-7 items-center justify-center rounded font-bold text-sm ${style.bg} ${style.fg}`}>
                  {style.glyph}
                </div>
                <Input
                  className="h-7 w-20"
                  defaultValue={sym.id}
                  onBlur={(e) => update((c) => { c.symbols[i].id = e.target.value; })}
                />
                <Input
                  className="h-7 flex-1"
                  defaultValue={sym.name}
                  onBlur={(e) => update((c) => { c.symbols[i].name = e.target.value; })}
                />
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => update((c) => { c.symbols.splice(i, 1); })}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <Label>權重</Label>
                  <Input className="h-7" type="number" defaultValue={sym.weight} onBlur={(e) => update((c) => { c.symbols[i].weight = parseFloat(e.target.value); })} />
                </div>
                <div>
                  <Label>堆疊權重</Label>
                  <Input className="h-7" type="number" defaultValue={sym.stackWeight ?? ''} onBlur={(e) => update((c) => { c.symbols[i].stackWeight = e.target.value ? parseFloat(e.target.value) : undefined; })} />
                </div>
                <div className="col-span-2">
                  <Label>賠付（3,4,5… 以逗號分隔）</Label>
                  <Input className="h-7" defaultValue={sym.payout.join(', ')} onBlur={(e) => update((c) => { c.symbols[i].payout = parseNums(e.target.value); })} />
                </div>
                <div className="col-span-2">
                  <Label>類型（以逗號分隔）</Label>
                  <Input className="h-7" defaultValue={sym.type.join(', ')} onBlur={(e) => update((c) => { c.symbols[i].type = parseList(e.target.value) as SymbolType[]; })} />
                </div>
                <div className="col-span-2">
                  <Label>圖片網址</Label>
                  <Input className="h-7" defaultValue={sym.image ?? ''} onBlur={(e) => update((c) => { c.symbols[i].image = e.target.value || undefined; })} />
                </div>
                <div className="col-span-2">
                  <Label>屬性（以逗號分隔）</Label>
                  <Input className="h-7" defaultValue={(sym.properties ?? []).join(', ')} onBlur={(e) => update((c) => { c.symbols[i].properties = parseList(e.target.value); })} />
                </div>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {sym.type.map((t) => <Badge key={t} variant="muted">{t}</Badge>)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
