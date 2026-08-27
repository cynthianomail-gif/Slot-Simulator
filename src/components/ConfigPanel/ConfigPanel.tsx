import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useGameStore } from '@/store/gameStore';
import { GeneralEditor } from './editors/GeneralEditor';
import { SymbolEditor } from './editors/SymbolEditor';
import { ReelEditor } from './editors/ReelEditor';
import { TriggerFeatureEditor } from './editors/TriggerFeatureEditor';
import { CheatBuyPanel } from './editors/CheatBuyPanel';
import { SystemEditor } from './editors/SystemEditor';
import { ImportButton } from './ImportButton';
import { RotateCcw, Settings2, Palette, Layers, Zap, Crosshair, Timer } from 'lucide-react';

export function ConfigPanel() {
  const resetConfig = useGameStore((s) => s.resetConfig);
  const saveState = useGameStore((s) => s.configSaveState);

  return (
    <div className="flex h-full flex-col border-r border-border bg-card/40">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm font-bold tracking-wide">遊戲設定</div>
        </div>
        <div className="flex items-center gap-1">
          <ImportButton />
          <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={resetConfig}>
            <RotateCcw className="h-3.5 w-3.5" /> 重置
          </Button>
        </div>
      </div>

      {saveState !== 'saved' && (
        <div className="border-b border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11px] leading-tight text-amber-300">
          {saveState === 'quota'
            ? '瀏覽器儲存空間滿了，這一次的修改沒存起來 — 上傳的圖片太多或太大。請改用尺寸小一點的圖。'
            : '這個瀏覽器不允許保存設定（可能是無痕視窗），重新整理後會回到預設值。'}
        </div>
      )}

      <Tabs defaultValue="general" className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-border/60 px-3 pt-2 pb-1">
          <TabsList>
            <TabsTrigger value="general"><Settings2 className="mr-1 h-3 w-3" />一般</TabsTrigger>
            <TabsTrigger value="symbols"><Palette className="mr-1 h-3 w-3" />圖示</TabsTrigger>
            <TabsTrigger value="reels"><Layers className="mr-1 h-3 w-3" />假盤</TabsTrigger>
            <TabsTrigger value="features"><Zap className="mr-1 h-3 w-3" />機制</TabsTrigger>
            <TabsTrigger value="cheats"><Crosshair className="mr-1 h-3 w-3" />強開</TabsTrigger>
            <TabsTrigger value="system"><Timer className="mr-1 h-3 w-3" />節奏</TabsTrigger>
          </TabsList>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <TabsContent value="general"><GeneralEditor /></TabsContent>
          <TabsContent value="symbols"><SymbolEditor /></TabsContent>
          <TabsContent value="reels"><ReelEditor /></TabsContent>
          <TabsContent value="features"><TriggerFeatureEditor /></TabsContent>
          <TabsContent value="cheats"><CheatBuyPanel /></TabsContent>
          <TabsContent value="system"><SystemEditor /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
