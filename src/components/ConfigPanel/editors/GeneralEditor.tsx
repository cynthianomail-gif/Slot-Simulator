import { useGameStore } from '@/store/gameStore';
import { NumField, Field, Section, parseNums } from './fields';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/misc';
import { regularShape } from '@/engine/grid';
import { Plus, X } from 'lucide-react';
import type { PayMode, MathTarget } from '@/types';

export function GeneralEditor() {
  const config = useGameStore((s) => s.config);
  const update = useGameStore((s) => s.updateConfig);
  const mode = config.pay.mode;

  return (
    <div className="space-y-4">
      <Section title="數學模型" desc="目標數據（結果以符號權重計算）">
        <div className="grid grid-cols-2 gap-3">
          <NumField
            label="目標 RTP"
            hint="0 ~ 1（例 0.985）"
            value={config.math.targetRTP}
            step={0.005}
            onChange={(v) => update((c) => { c.math.targetRTP = v; })}
          />
          <NumField
            label="目標 BF"
            hint="N 局觸發 1 次"
            value={config.math.targetBF}
            onChange={(v) => update((c) => { c.math.targetBF = v; })}
          />
        </div>
        <MathTargetsEditor />
      </Section>

      <Section title="盤面" desc="輪數（直行）與每輪列數">
        <div className="grid grid-cols-2 gap-3">
          <NumField
            label="輪數（直行）"
            value={config.grid.cols}
            min={1}
            onChange={(v) => update((c) => {
              const cols = Math.max(1, Math.floor(v));
              const rows = c.grid.shape[0] ?? 3;
              c.grid.cols = cols;
              c.grid.shape = regularShape(cols, rows);
              while (c.reels.strips.length < cols) c.reels.strips.push([...(c.reels.strips[0] ?? [])]);
              c.reels.strips.length = cols;
            })}
          />
          <NumField
            label="列數（規則盤面）"
            value={config.grid.shape[0] ?? 3}
            min={1}
            onChange={(v) => update((c) => {
              c.grid.shape = regularShape(c.grid.cols, Math.max(1, Math.floor(v)));
            })}
          />
        </div>
        <Field label="不規則盤面" hint="每輪列數，以逗號分隔（例 3,3,4,3,3）">
          <Input
            defaultValue={config.grid.shape.join(', ')}
            onBlur={(e) => update((c) => {
              const shape = parseNums(e.target.value).map((n) => Math.max(1, Math.floor(n)));
              if (shape.length) {
                c.grid.shape = shape;
                c.grid.cols = shape.length;
                while (c.reels.strips.length < shape.length) c.reels.strips.push([...(c.reels.strips[0] ?? [])]);
                c.reels.strips.length = shape.length;
              }
            })}
          />
        </Field>
      </Section>

      <Section title="得分" desc="連線方式與賠付規則">
        <Field label="連線方式">
          <Select
            value={mode}
            options={['payline', 'ways', 'cluster']}
            labels={{ payline: '線數 (payline)', ways: '路數 (ways)', cluster: '群集 (cluster)' }}
            onChange={(v) => update((c) => { c.pay.mode = v as PayMode; })}
          />
        </Field>

        {mode === 'cluster' ? (
          <Field label="賠率區間" hint="每個區間用逗號分隔，範圍用 ~ 連接（例 5, 6~7, 8~9, 10~12）">
            <Input
              defaultValue={formatRanges(config.pay.payRanges ?? defaultClusterRanges(config.pay.clusterMin ?? config.pay.minMatch))}
              onBlur={(e) => update((c) => {
                const ranges = parseRanges(e.target.value);
                if (ranges.length) {
                  c.pay.payRanges = ranges;
                  c.pay.clusterMin = ranges[0][0];
                  c.pay.minMatch = ranges[0][0];
                  c.pay.maxMatch = ranges[ranges.length - 1][1];
                }
              })}
            />
          </Field>
        ) : (
          <>
            <NumField
              label="最小連線數"
              hint="連續幾個相同符號開始賠付（通常 3）"
              value={config.pay.minMatch}
              onChange={(v) => update((c) => { c.pay.minMatch = v; })}
            />
            <NumField
              label="最大連線數"
              hint="賠率表的最高連線上限"
              value={config.pay.maxMatch ?? config.pay.minMatch + 2}
              onChange={(v) => update((c) => { c.pay.maxMatch = v; })}
            />
          </>
        )}

        {mode === 'payline' && <PaylineEditor />}
      </Section>

      <CascadeSection />
    </div>
  );
}

/* ----------------------------- math targets -------------------------------- */

const MODE_PRESETS = ['NG', 'FG', 'BG'] as const;
const MODE_LABELS: Record<string, string> = { NG: '一般遊戲', FG: '免費遊戲', BG: 'Bonus' };

function MathTargetsEditor() {
  const config = useGameStore((s) => s.config);
  const update = useGameStore((s) => s.updateConfig);
  const targets = config.math.targets ?? [];
  const usedModes = new Set(targets.map((t) => t.mode));

  const addTarget = (mode: string) =>
    update((c) => {
      c.math.targets = [...(c.math.targets ?? []), { mode, hitRate: 0.25, avgWinX: 1.5 }];
    });

  const removeTarget = (i: number) =>
    update((c) => { c.math.targets.splice(i, 1); });

  const setField = (i: number, key: keyof MathTarget, v: number | string) =>
    update((c) => {
      const t = c.math.targets[i];
      if (key === 'mode') t.mode = v as string;
      else if (key === 'hitRate') t.hitRate = v as number;
      else if (key === 'avgWinX') t.avgWinX = v as number;
    });

  // Preset modes not yet added
  const remaining = MODE_PRESETS.filter((m) => !usedModes.has(m));

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
      <div className="text-[13px] font-medium text-foreground">得分率 / 平均得分倍</div>

      {targets.length === 0 && (
        <div className="py-3 text-center text-[11px] text-muted-foreground">
          尚無設定，點下方按鈕新增模式
        </div>
      )}

      <div className="space-y-2.5">
        {targets.map((t, i) => (
          <div key={i} className="rounded-md border border-border bg-background/40 p-2.5">
            <div className="mb-2 flex items-center justify-between">
              {MODE_LABELS[t.mode] ? (
                <span className="text-[13px] font-semibold text-foreground">
                  {t.mode} <span className="font-normal text-muted-foreground">({MODE_LABELS[t.mode]})</span>
                </span>
              ) : (
                <Input
                  className="h-7 w-28 text-[13px] font-semibold"
                  value={t.mode}
                  placeholder="模式名稱"
                  onChange={(e) => setField(i, 'mode', e.target.value)}
                />
              )}
              <button
                onClick={() => removeTarget(i)}
                className="grid h-6 w-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="text-[11px] text-muted-foreground">得分率</div>
                <Input
                  type="number"
                  step={0.01}
                  value={t.hitRate}
                  onChange={(e) => setField(i, 'hitRate', parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-1">
                <div className="text-[11px] text-muted-foreground">平均得分倍</div>
                <Input
                  type="number"
                  step={0.1}
                  value={t.avgWinX}
                  onChange={(e) => setField(i, 'avgWinX', parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {remaining.map((m) => (
          <Button key={m} size="sm" variant="secondary" className="h-7 px-2.5 text-[11px]" onClick={() => addTarget(m)}>
            <Plus className="mr-1 h-3 w-3" /> {m}
          </Button>
        ))}
        <Button size="sm" variant="outline" className="h-7 px-2.5 text-[11px]" onClick={() => addTarget('')}>
          <Plus className="mr-1 h-3 w-3" /> 自訂模式
        </Button>
      </div>

      <p className="text-[11px] leading-snug text-muted-foreground">
        得分率 0~1，平均得分倍＝得分局的平均贏分 ÷ 注額。
      </p>
    </div>
  );
}

/* ------------------------------ cascade (連爆) ------------------------------ */

function CascadeSection() {
  const config = useGameStore((s) => s.config);
  const update = useGameStore((s) => s.updateConfig);
  const cas = config.cascade ?? { enabled: false, showStepWin: true, refill: 'fillDown' as const };

  const set = (mut: (c: NonNullable<typeof config.cascade>) => void) =>
    update((c) => {
      c.cascade ??= { enabled: false, showStepWin: true, refill: 'fillDown' };
      mut(c.cascade);
    });

  return (
    <Section title="連爆" desc="得分後消除並補盤，連續得分直到無法得分才結束此局">
      <Switch
        checked={cas.enabled}
        onCheckedChange={(v) => set((x) => { x.enabled = v; })}
        label="啟用連爆"
      />
      {cas.enabled && (
        <>
          <Field label="補盤方式" hint="補盤一律依「節奏」分頁的動畫類型演繹">
            <Select
              value={cas.refill}
              options={['fillDown', 'clearMatch', 'respin']}
              labels={{
                fillDown: '消除遞補',
                clearMatch: '同款全消',
                respin: '原地補盤',
              }}
              onChange={(v) => set((x) => { x.refill = v as 'fillDown' | 'clearMatch' | 'respin'; })}
            />
          </Field>
        </>
      )}
    </Section>
  );
}

/* ------------------------------ payline editor ------------------------------ */

function PaylineEditor() {
  const config = useGameStore((s) => s.config);
  const update = useGameStore((s) => s.updateConfig);
  const cols = config.grid.cols;
  const lines = config.pay.paylines ?? [];

  const setLine = (idx: number, raw: string) => update((c) => {
    const rows = parseNums(raw).map((n) => Math.max(0, Math.floor(n)));
    const list = (c.pay.paylines ??= []);
    if (list[idx]) list[idx] = { ...list[idx], rows };
  });

  const addLine = () => update((c) => {
    const list = (c.pay.paylines ??= []);
    const id = list.reduce((m, l) => Math.max(m, l.id), 0) + 1;
    list.push({ id, rows: Array.from({ length: c.grid.cols }, () => 0) });
  });

  const removeLine = (idx: number) => update((c) => {
    c.pay.paylines?.splice(idx, 1);
  });

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/20 p-2.5">
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-medium text-foreground">
          得分線（共 {lines.length} 線）
        </div>
        <Button size="sm" variant="secondary" className="h-7 px-2" onClick={addLine}>
          <Plus className="h-3.5 w-3.5" /> 新增線
        </Button>
      </div>

      {lines.length === 0 && (
        <div className="py-2 text-center text-[11px] text-muted-foreground">
          尚無得分線，點「新增線」開始
        </div>
      )}

      <div className="space-y-1.5">
        {lines.map((l, i) => {
          const lenOk = l.rows.length === cols;
          return (
            <div key={l.id} className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-[11px] tabular-nums text-muted-foreground">
                第 {i + 1} 線
              </span>
              <Input
                className={lenOk ? '' : 'border-amber-500/70'}
                defaultValue={l.rows.join(', ')}
                onBlur={(e) => setLine(i, e.target.value)}
              />
              <button
                onClick={() => removeLine(i)}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                title="刪除此線"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] leading-snug text-muted-foreground">
        每欄填一個列號，以逗號分隔，數量需等於輪數（目前 {cols} 輪）。
        由上往下數，0＝最上列。例：{Array.from({ length: cols }, () => '0').join(',')} 為最上面一橫排。
      </p>
    </div>
  );
}

/* --------------------------------- helpers --------------------------------- */

function parseRanges(text: string): [number, number][] {
  return text
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/^(\d+)\s*[~～\-]\s*(\d+)$/);
      if (m) {
        const a = parseInt(m[1]), b = parseInt(m[2]);
        return [Math.min(a, b), Math.max(a, b)] as [number, number];
      }
      const n = parseInt(s);
      return isNaN(n) ? null : [n, n] as [number, number];
    })
    .filter((r): r is [number, number] => r !== null)
    .sort((a, b) => a[0] - b[0]);
}

function formatRanges(ranges: [number, number][]): string {
  return ranges.map(([a, b]) => a === b ? String(a) : `${a}~${b}`).join(', ');
}

function defaultClusterRanges(min: number): [number, number][] {
  const ranges: [number, number][] = [];
  for (let i = min; i <= min + 4; i++) ranges.push([i, i]);
  return ranges;
}

export function Select({
  value,
  options,
  onChange,
  labels,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  labels?: Record<string, string>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      {options.map((o) => (
        <option key={o} value={o}>{labels?.[o] ?? o}</option>
      ))}
    </select>
  );
}
