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
  const pay = useGameStore((s) => s.config.pay);
  const update = useGameStore((s) => s.updateConfig);

  const ranges = pay.payRanges;
  const countMode = pay.mode === 'cluster' || pay.mode === 'anywhere';
  const useRanges = countMode && ranges && ranges.length > 0;
  const minMatch = countMode ? (pay.clusterMin ?? pay.minMatch) : pay.minMatch;
  const maxMatch = pay.maxMatch ?? minMatch + Math.max(0, ...symbols.map((s) => s.payout.length)) - 1;
  const paySlots = useRanges ? ranges.length : maxMatch - minMatch + 1;
  const unit = countMode ? '顆' : '連';

  const addSymbol = () =>
    update((c) => {
      c.symbols.push({
        id: `NEW${c.symbols.length}`,
        name: '新圖示',
        type: ['normal'],
        weight: 5,
        payout: new Array(paySlots).fill(0),
      });
    });

  return (
    <Section
      title="圖示"
      desc={`盤面符號、權重與賠率（共 ${symbols.length} 個）`}
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
              <Mini label="NG 權重">
                <Input className="h-8" type="number" defaultValue={sym.weight} onBlur={(e) => update((c) => { c.symbols[i].weight = parseFloat(e.target.value); })} />
              </Mini>
              <Mini label="NG 堆疊權重">
                <Input className="h-8" type="number" defaultValue={sym.stackWeight ?? ''} onBlur={(e) => update((c) => { c.symbols[i].stackWeight = e.target.value ? parseFloat(e.target.value) : undefined; })} />
              </Mini>
              <ModeWeightsRow index={i} modeWeights={sym.modeWeights} />
              <div className="col-span-2">
                <div className="mb-1 text-[10px] font-medium text-muted-foreground">賠率</div>
                <div className="flex gap-1.5">
                  {Array.from({ length: paySlots }, (_, k) => {
                    const rangeLabel = useRanges
                      ? (ranges[k][0] === ranges[k][1] ? `${ranges[k][0]}` : `${ranges[k][0]}~${ranges[k][1]}`)
                      : `${minMatch + k}${unit}`;
                    return (
                      <div key={k} className="flex-1 min-w-0">
                        <div className="mb-0.5 text-center text-[9px] text-muted-foreground/70">{rangeLabel}</div>
                        <Input
                          className="h-7 px-1 text-center text-xs"
                          type="number"
                          defaultValue={sym.payout[k] ?? 0}
                          onBlur={(e) => update((c) => {
                            const arr = c.symbols[i].payout;
                            while (arr.length < paySlots) arr.push(0);
                            arr[k] = parseFloat(e.target.value) || 0;
                          })}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
              <Mini label="類型（逗號分隔）" className="col-span-2">
                <Input className="h-8" defaultValue={sym.type.join(', ')} onBlur={(e) => update((c) => { c.symbols[i].type = parseList(e.target.value) as SymbolType[]; })} />
              </Mini>
              <Mini label="圖片網址" className="col-span-2">
                <Input className="h-8" defaultValue={sym.image ?? ''} onBlur={(e) => update((c) => { c.symbols[i].image = e.target.value || undefined; })} />
              </Mini>
              <Mini label="屬性標籤（功能外掛用，逗號分隔）" className="col-span-2">
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

/* ----------------------------- mode weights -------------------------------- */

const MW_PRESETS = ['FG', 'BG'] as const;

interface ModeWeightEntry { weight: number; stackWeight?: number }

function ModeWeightsRow({ index, modeWeights }: { index: number; modeWeights?: Record<string, ModeWeightEntry> }) {
  const update = useGameStore((s) => s.updateConfig);
  const entries = Object.entries(modeWeights ?? {}) as [string, ModeWeightEntry][];
  const usedModes = new Set(entries.map(([k]) => k));
  const remaining = MW_PRESETS.filter((m) => !usedModes.has(m));

  const addMode = (mode: string) =>
    update((c) => {
      const s = c.symbols[index];
      const entry: ModeWeightEntry = { weight: s.weight };
      if (s.stackWeight != null) entry.stackWeight = s.stackWeight;
      s.modeWeights = { ...(s.modeWeights ?? {}), [mode]: entry };
    });

  const removeMode = (mode: string) =>
    update((c) => {
      const mw = { ...(c.symbols[index].modeWeights ?? {}) };
      delete mw[mode];
      c.symbols[index].modeWeights = Object.keys(mw).length ? mw : undefined;
    });

  const setModeWeight = (mode: string, v: number) =>
    update((c) => {
      const mw = c.symbols[index].modeWeights ?? {};
      mw[mode] = { ...mw[mode], weight: v };
      c.symbols[index].modeWeights = { ...mw };
    });

  const setModeStackWeight = (mode: string, v: number | undefined) =>
    update((c) => {
      const mw = c.symbols[index].modeWeights ?? {};
      const entry = { ...mw[mode] };
      if (v == null) delete entry.stackWeight;
      else entry.stackWeight = v;
      mw[mode] = entry;
      c.symbols[index].modeWeights = { ...mw };
    });

  return (
    <>
      {entries.map(([mode, e]) => (
        <div key={mode} className="col-span-2 grid grid-cols-2 gap-2">
          <Mini label={`${mode} 權重`}>
            <div className="flex gap-1">
              <Input
                className="h-8 flex-1"
                type="number"
                defaultValue={e.weight}
                onBlur={(ev) => setModeWeight(mode, parseFloat(ev.target.value) || 0)}
              />
              <button
                onClick={() => removeMode(mode)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </Mini>
          <Mini label={`${mode} 堆疊權重`}>
            <Input
              className="h-8"
              type="number"
              defaultValue={e.stackWeight ?? ''}
              onBlur={(ev) => setModeStackWeight(mode, ev.target.value ? parseFloat(ev.target.value) : undefined)}
            />
          </Mini>
        </div>
      ))}
      <div className="col-span-2 flex flex-wrap gap-1">
        {remaining.map((m) => (
          <Button key={m} size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-muted-foreground" onClick={() => addMode(m)}>
            <Plus className="mr-0.5 h-2.5 w-2.5" /> {m} 權重
          </Button>
        ))}
        <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-muted-foreground" onClick={() => {
          const name = prompt('模式名稱（例: FG2）');
          if (name?.trim()) addMode(name.trim());
        }}>
          <Plus className="mr-0.5 h-2.5 w-2.5" /> 自訂
        </Button>
      </div>
    </>
  );
}
