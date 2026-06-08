import { useGameStore } from '@/store/gameStore';
import { Label } from '@/components/ui/input';
import { parseList } from './fields';

/** Reel Strip editor — one textarea per reel column. */
export function ReelEditor() {
  const strips = useGameStore((s) => s.config.reels.strips);
  const update = useGameStore((s) => s.updateConfig);

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">
        以逗號分隔的圖示 ID 編輯各條滾輪帶，用於
        <span className="text-foreground"> reelstrip</span> 數學模式。
      </p>
      {strips.map((strip, col) => (
        <div key={col} className="space-y-1">
          <Label>滾輪 {col + 1} · {strip.length} 格</Label>
          <textarea
            className="min-h-[64px] w-full rounded-md border border-input bg-background p-2 font-mono text-[11px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            defaultValue={strip.join(', ')}
            onBlur={(e) =>
              update((c) => {
                c.reels.strips[col] = parseList(e.target.value);
              })
            }
          />
        </div>
      ))}
    </div>
  );
}
