import { useGameStore } from '@/store/gameStore';
import { Switch } from '@/components/ui/misc';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select } from './GeneralEditor';
import { NumField, Section, ItemCard, Mini, Field } from './fields';
import { X } from 'lucide-react';
import type { AnimationType, AnimationProfile } from '@/types';

/** RNG + Animation system controls. */
export function SystemEditor() {
  const s = useGameStore();
  const update = s.updateConfig;

  return (
    <div className="space-y-4">
      <Section title="亂數產生器" desc="相同種子＋相同設定可重現完全一致的旋轉序列">
        <Switch
          checked={s.useFixedSeed}
          onCheckedChange={(v) => s.setSeedMode(v, s.seed)}
          label="固定種子模式"
        />
        {s.useFixedSeed && (
          <>
            <div className="flex items-end gap-2">
              <Mini label="種子" className="flex-1">
                <Input
                  key={s.seed}
                  type="number"
                  defaultValue={s.seed}
                  onBlur={(e) => s.setSeedMode(true, parseInt(e.target.value, 10) || 0)}
                />
              </Mini>
              <Button size="sm" variant="secondary" onClick={() => s.setSeedMode(true, s.seed)}>重新設種</Button>
            </div>
            <div className="flex items-end gap-2">
              <Mini label="種子名稱" className="flex-1">
                <Input value={s.seedName} placeholder="例：GameXXX_專案名稱" onChange={(e) => s.setSeedName(e.target.value)} />
              </Mini>
              <Button size="sm" onClick={s.saveSeed}>儲存</Button>
            </div>
            {s.savedSeeds.length > 0 && (
              <div className="space-y-1">
                <div className="text-[11px] font-medium text-muted-foreground">已存種子</div>
                <div className="flex flex-wrap gap-1.5">
                  {s.savedSeeds.map((sv) => (
                    <div key={sv.name} className="flex items-center gap-1 rounded-md border border-border bg-background/40 px-1.5 py-1">
                      <button
                        className="text-[11px] text-foreground hover:text-primary"
                        title={`種子 ${sv.seed}`}
                        onClick={() => s.loadSeed(sv.seed, sv.name)}
                      >
                        {sv.name}
                      </button>
                      <button
                        className="text-muted-foreground hover:text-destructive"
                        title="刪除"
                        onClick={() => s.deleteSeed(sv.name)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </Section>

      <Section title="動畫" desc="演出方式與速度參數（以秒為單位）">
        <Switch checked={s.animationEnabled} onCheckedChange={s.toggleAnimation} label="啟用動畫" />
        <Field label="動畫類型">
          <Select
            value={s.config.animation.type}
            options={['rolling', 'independent', 'cascading', 'flipping']}
            labels={{ rolling: '滾動 (rolling)', independent: '單格 (single)', cascading: '掉落 (cascading)', flipping: '翻轉 (flipping)' }}
            onChange={(v) => update((c) => { c.animation.type = v as AnimationType; })}
          />
        </Field>

        <ProfileEditor title="一般參數" which="normal" />
        <ProfileEditor title="極速參數" which="turbo" />
      </Section>
    </div>
  );
}

function ProfileEditor({ title, which }: { title: string; which: 'normal' | 'turbo' }) {
  const profile = useGameStore((s) => s.config.animation[which]);
  const update = useGameStore((s) => s.updateConfig);
  const set = (k: keyof AnimationProfile, v: number) =>
    update((c) => { (c.animation[which][k] as number) = v; });

  return (
    <ItemCard>
      <div className="text-[12px] font-semibold text-foreground">{title}</div>
      <div className="grid grid-cols-2 gap-2">
        <SecField label="總旋轉時間" ms={profile.totalSpinTime} onChange={(v) => set('totalSpinTime', v)} />
        <NumField label="旋轉速度倍率" value={profile.spinSpeed} step={0.1} onChange={(v) => set('spinSpeed', v)} />
        <SecField label="每輪停止間隔" ms={profile.stopInterval} onChange={(v) => set('stopInterval', v)} />
        <SecField label="回彈時間" ms={profile.bounceDuration} onChange={(v) => set('bounceDuration', v)} />
        <SecField label="局間間隔" ms={profile.roundGap ?? 500} onChange={(v) => set('roundGap', v)} />
      </div>
    </ItemCard>
  );
}

/** Edits a millisecond value but displays/accepts seconds (1 dp). */
function SecField({ label, ms, onChange }: { label: string; ms: number; onChange: (ms: number) => void }) {
  return (
    <NumField
      label={`${label}（秒）`}
      value={Math.round(ms) / 1000}
      step={0.05}
      min={0}
      onChange={(sec) => onChange(Math.round((Number.isFinite(sec) ? sec : 0) * 1000))}
    />
  );
}
