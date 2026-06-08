import { useGameStore } from '@/store/gameStore';
import { Section, parseList } from './fields';

/** Reel Strip editor — one textarea per reel column. */
export function ReelEditor() {
  const strips = useGameStore((s) => s.config.reels.strips);
  const update = useGameStore((s) => s.updateConfig);

  return (
    <Section
      title="滾輪帶"
      desc="以逗號分隔的圖示 ID，用於 reelstrip 數學模式"
    >
      {strips.map((strip, col) => (
        <div key={col} className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="grid h-5 min-w-5 place-items-center rounded bg-primary/15 px-1.5 text-[11px] font-semibold text-primary">
              {col + 1}
            </span>
            <span className="text-[13px] font-medium text-foreground">滾輪 {col + 1}</span>
            <span className="text-[11px] text-muted-foreground">· {strip.length} 格</span>
          </div>
          <textarea
            className="min-h-[64px] w-full rounded-md border border-input bg-background p-2 font-mono text-[11px] leading-relaxed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            defaultValue={strip.join(', ')}
            onBlur={(e) =>
              update((c) => {
                c.reels.strips[col] = parseList(e.target.value);
              })
            }
          />
        </div>
      ))}
    </Section>
  );
}
