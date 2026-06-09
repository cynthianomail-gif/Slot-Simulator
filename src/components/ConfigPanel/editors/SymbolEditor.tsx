import { useGameStore } from '@/store/gameStore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge, Switch } from '@/components/ui/misc';
import { Section, ItemCard, Mini, parseNums, parseList } from './fields';
import { symbolStyle } from '@/lib/symbolStyle';
import { Plus, Trash2 } from 'lucide-react';
import type { SymbolType } from '@/types';

export function SymbolEditor() {
  const symbols = useGameStore((s) => s.config.symbols);
  const update = useGameStore((s) => s.updateConfig);

  const addSymbol = () =>
    update((c) => {
      c.symbols.push({
        id: `NEW${c.symbols.length}`,
        name: '新圖示',
        type: ['normal'],
        weight: 5,
        payout: [1, 2, 5],
      });
    });

  return (
    <Section
      title="圖示"
      desc={`盤面符號、權重與賠付（共 ${symbols.length} 個）`}
      action={
        <Button size="sm" variant="secondary" className="h-7 px-2" onClick={addSymbol}>
          <Plus className="h-3.5 w-3.5" /> 新增
        </Button>
      }
    >
      {symbols.map((sym, i) => {
        const style = symbolStyle(sym, sym.id);
        return (
          <ItemCard key={i}>
            <div className="flex items-center gap-2">
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-bold ${style.bg} ${style.fg}`}>
                {style.glyph}
              </div>
              <Input
                className="h-8 w-20"
                defaultValue={sym.id}
                onBlur={(e) => update((c) => { c.symbols[i].id = e.target.value; })}
              />
              <Input
                className="h-8 flex-1"
                defaultValue={sym.name}
                onBlur={(e) => update((c) => { c.symbols[i].name = e.target.value; })}
              />
              <button
                onClick={() => update((c) => { c.symbols.splice(i, 1); })}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                title="刪除"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Mini label="權重">
                <Input className="h-8" type="number" defaultValue={sym.weight} onBlur={(e) => update((c) => { c.symbols[i].weight = parseFloat(e.target.value); })} />
              </Mini>
              <Mini label="堆疊權重">
                <Input className="h-8" type="number" defaultValue={sym.stackWeight ?? ''} onBlur={(e) => update((c) => { c.symbols[i].stackWeight = e.target.value ? parseFloat(e.target.value) : undefined; })} />
              </Mini>
              <Mini label="賠付（3,4,5… 連線）" className="col-span-2">
                <Input className="h-8" defaultValue={sym.payout.join(', ')} onBlur={(e) => update((c) => { c.symbols[i].payout = parseNums(e.target.value); })} />
              </Mini>
              <Mini label="類型（逗號分隔）" className="col-span-2">
                <Input className="h-8" defaultValue={sym.type.join(', ')} onBlur={(e) => update((c) => { c.symbols[i].type = parseList(e.target.value) as SymbolType[]; })} />
              </Mini>
              <Mini label="圖片網址" className="col-span-2">
                <Input className="h-8" defaultValue={sym.image ?? ''} onBlur={(e) => update((c) => { c.symbols[i].image = e.target.value || undefined; })} />
              </Mini>
              <Mini label="屬性（逗號分隔）" className="col-span-2">
                <Input className="h-8" defaultValue={(sym.properties ?? []).join(', ')} onBlur={(e) => update((c) => { c.symbols[i].properties = parseList(e.target.value); })} />
              </Mini>
              <div className="col-span-2 pt-0.5">
                <Switch
                  checked={sym.excludeReels !== undefined}
                  onCheckedChange={(v) => update((c) => {
                    c.symbols[i].excludeReels = v ? (c.symbols[i].excludeReels ?? []) : undefined;
                  })}
                  label="並非每輪都出現"
                />
              </div>
              {sym.excludeReels !== undefined && (
                <Mini label="不出現的輪（輪號，逗號分隔）" className="col-span-2">
                  <Input
                    className="h-8"
                    placeholder="例：2, 4"
                    defaultValue={sym.excludeReels.join(', ')}
                    onBlur={(e) => update((c) => {
                      c.symbols[i].excludeReels = parseNums(e.target.value).map((n) => Math.max(1, Math.floor(n)));
                    })}
                  />
                </Mini>
              )}
            </div>

            <div className="flex flex-wrap gap-1">
              {sym.type.map((t) => <Badge key={t} variant="muted">{t}</Badge>)}
            </div>
          </ItemCard>
        );
      })}
    </Section>
  );
}
