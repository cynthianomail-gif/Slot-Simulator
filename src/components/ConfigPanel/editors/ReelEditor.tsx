import { useGameStore } from '@/store/gameStore';
import { Section, NumField } from './fields';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/misc';
import { SymbolFace } from '@/components/ui/symbolFace';
import { reelSymbolWeights } from '@/engine/reel';
import type { GameConfig } from '@/types';

/* Default upgrade matrix (the example the user provided) used when 假收集 is
   first switched on. Rows = stages, up = [+1,+2,+3,+4] %, stay = remain %. */
const DEFAULT_UPGRADE = [
  { up: [20, 9, 4, 1.5], stay: 65 },
  { up: [15, 6, 3, 1], stay: 75 },
  { up: [13, 4, 2, 0], stay: 81 },
  { up: [10.5, 2.5, 0, 0], stay: 87 },
  { up: [5, 0, 0, 0], stay: 95 },
  { up: [0, 0, 0, 0], stay: 100 },
];

export function ReelEditor() {
  return (
    <div className="space-y-4">
      <FakeBoardSection />
      <FakeCollectSection />
    </div>
  );
}

/* ------------------------------- 假盤 ------------------------------------- */

function FakeBoardSection() {
  const config = useGameStore((s) => s.config);
  const update = useGameStore((s) => s.updateConfig);
  const cols = config.grid.cols;
  const custom = config.fakeReel?.enabled ?? false;

  // current %-share per reel/symbol (from the math weights)
  const reelShares = (col: number) => {
    const { ids, weights } = reelSymbolWeights(config, col);
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    return ids.map((id, k) => ({ id, pct: (weights[k] / total) * 100 }));
  };

  const toggleCustom = (on: boolean) =>
    update((c) => {
      if (on) {
        // seed editable weights from the current %-shares so values are kept
        const weights: Record<number, Record<string, number>> = {};
        for (let col = 0; col < c.grid.cols; col++) {
          weights[col] = {};
          for (const { id, pct } of reelShares(col)) weights[col][id] = +pct.toFixed(2);
        }
        c.fakeReel = { enabled: true, weights };
      } else if (c.fakeReel) {
        c.fakeReel.enabled = false;
      }
    });

  const setWeight = (col: number, id: string, v: number) =>
    update((c) => {
      if (!c.fakeReel) c.fakeReel = { enabled: true, weights: {} };
      (c.fakeReel.weights[col] ??= {})[id] = v;
    });

  return (
    <Section
      title="假盤"
      desc="滾動中各輪會出現的圖示，依「圖示」的權重與排除規則自動產生"
      action={
        <Switch checked={custom} onCheckedChange={toggleCustom} label="與權重不同" />
      }
    >
      {custom && (
        <p className="text-[11px] leading-snug text-muted-foreground">
          假盤已與權重脫鉤，下列數字可自由編輯，僅影響滾動畫面、不影響數學結果。
        </p>
      )}
      {Array.from({ length: cols }).map((_, col) => {
        const shares = reelShares(col);
        return (
          <div key={col} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="grid h-5 min-w-5 place-items-center rounded bg-primary/15 px-1.5 text-[11px] font-semibold text-primary">
                {col + 1}
              </span>
              <span className="text-[13px] font-medium text-foreground">輪 {col + 1}</span>
              <span className="text-[11px] text-muted-foreground">· {shares.length} 種圖示</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {shares.map(({ id, pct }) => {
                const val = custom
                  ? config.fakeReel?.weights[col]?.[id] ?? +pct.toFixed(2)
                  : pct;
                return (
                  <div
                    key={id}
                    className="flex items-center gap-1 rounded-md border border-border bg-background/40 px-1.5 py-1"
                    title={id}
                  >
                    <SymbolFace
                      sym={config.symbols.find((s) => s.id === id)}
                      id={id}
                      className="grid h-5 w-5 place-items-center overflow-hidden rounded text-[11px] font-bold"
                    />
                    {custom ? (
                      <input
                        type="number"
                        step={0.1}
                        className="h-6 w-14 rounded border border-input bg-background px-1 text-[11px] tabular-nums focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        defaultValue={val}
                        onBlur={(e) => setWeight(col, id, parseFloat(e.target.value) || 0)}
                      />
                    ) : (
                      <span className="text-[11px] tabular-nums text-muted-foreground">{pct.toFixed(1)}%</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </Section>
  );
}

/* ------------------------------ 假收集 ----------------------------------- */

const JUMP_COLS = [
  { label: '升4階', k: 3 },
  { label: '升3階', k: 2 },
  { label: '升2階', k: 1 },
  { label: '升1階', k: 0 },
];

function normalizeFC(c: GameConfig) {
  const fc = c.fakeCollect!;
  const rows = fc.upgrade ? [...fc.upgrade] : [];
  while (rows.length < fc.stages) rows.push({ up: [0, 0, 0, 0], stay: 100 });
  rows.length = fc.stages;
  fc.upgrade = rows.map((r) => ({ up: [...r.up], stay: r.stay }));
}

function FakeCollectSection() {
  const config = useGameStore((s) => s.config);
  const update = useGameStore((s) => s.updateConfig);
  const fc = config.fakeCollect;
  const enabled = fc?.enabled ?? false;

  const toggle = (on: boolean) =>
    update((c) => {
      if (on) {
        c.fakeCollect = c.fakeCollect ?? {
          enabled: true,
          count: 3,
          stages: 6,
          upgrade: DEFAULT_UPGRADE.map((r) => ({ up: [...r.up], stay: r.stay })),
        };
        c.fakeCollect.enabled = true;
        normalizeFC(c);
      } else if (c.fakeCollect) {
        c.fakeCollect.enabled = false;
      }
    });

  return (
    <Section
      title="假收集"
      desc="盤面上額外出現的 Feature 收集"
      action={<Switch checked={enabled} onCheckedChange={toggle} label="啟用" />}
    >
      {!enabled || !fc ? (
        <div className="py-2 text-center text-[11px] text-muted-foreground">
          開啟後可設定 Feature 數量與各階段升階權重
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <NumField
              label="Feature 數量"
              hint="盤面上額外出現幾個 Feature"
              value={fc.count}
              min={0}
              onChange={(v) => update((c) => { c.fakeCollect!.count = Math.max(0, Math.floor(v)); })}
            />
            <NumField
              label="階段數"
              hint="Feature 由小到大的階段數"
              value={fc.stages}
              min={1}
              onChange={(v) => update((c) => {
                c.fakeCollect!.stages = Math.max(1, Math.floor(v));
                normalizeFC(c);
              })}
            />
          </div>

          <UpgradeMatrix />
        </>
      )}
    </Section>
  );
}

function UpgradeMatrix() {
  const config = useGameStore((s) => s.config);
  const update = useGameStore((s) => s.updateConfig);
  const fc = config.fakeCollect!;
  const stages = fc.stages;
  const rows = fc.upgrade;

  const setUp = (row: number, k: number, v: number) =>
    update((c) => { normalizeFC(c); c.fakeCollect!.upgrade[row].up[k] = v; });
  const setStay = (row: number, v: number) =>
    update((c) => { normalizeFC(c); c.fakeCollect!.upgrade[row].stay = v; });

  const cell =
    'h-7 w-full min-w-0 rounded border border-input bg-background px-0.5 text-center text-[11px] tabular-nums focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';
  const gridCols = 'grid grid-cols-[1.4rem_repeat(5,minmax(0,1fr))_2.2rem] items-center gap-1';

  return (
    <div className="space-y-1">
      <div className="text-[11px] font-medium text-muted-foreground">升階權重（每列合計需 100%）</div>
      <div className="space-y-1">
        {/* header */}
        <div className={`${gridCols} text-[10px] text-muted-foreground`}>
          <div>階</div>
          {JUMP_COLS.map((j) => <div key={j.label} className="text-center">{j.label}</div>)}
          <div className="text-center">不變</div>
          <div className="text-center">合計</div>
        </div>
        {Array.from({ length: stages }).map((_, row) => {
          const s = row + 1;
          const r = rows[row] ?? { up: [0, 0, 0, 0], stay: 100 };
          let sum = r.stay;
          return (
            <div key={row} className={gridCols}>
              <div className="text-[11px] font-medium text-foreground">{s}</div>
              {JUMP_COLS.map((j) => {
                const possible = s + (j.k + 1) <= stages;
                if (possible) sum += r.up[j.k] ?? 0;
                return possible ? (
                  <input
                    key={j.k}
                    type="number"
                    step={0.5}
                    className={cell}
                    defaultValue={r.up[j.k] ?? 0}
                    onBlur={(e) => setUp(row, j.k, parseFloat(e.target.value) || 0)}
                  />
                ) : (
                  <div key={j.k} className="text-center text-[11px] text-muted-foreground/50">—</div>
                );
              })}
              <input
                type="number"
                step={0.5}
                className={cell}
                defaultValue={r.stay}
                onBlur={(e) => setStay(row, parseFloat(e.target.value) || 0)}
              />
              <div className={`text-center text-[10px] tabular-nums ${Math.abs(sum - 100) < 0.01 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {sum.toFixed(0)}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">
        每列＝目前階段，欄位＝升 N 階或不變的機率；「—」表示已無更高階段可升。
      </p>
    </div>
  );
}
