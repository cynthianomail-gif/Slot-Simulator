import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useGameStore } from '@/store/gameStore';
import { GeneralEditor } from './editors/GeneralEditor';
import { SymbolEditor } from './editors/SymbolEditor';
import { ReelEditor } from './editors/ReelEditor';
import { TriggerFeatureEditor } from './editors/TriggerFeatureEditor';
import { CheatBuyPanel } from './editors/CheatBuyPanel';
import { SystemEditor } from './editors/SystemEditor';
import { RotateCcw } from 'lucide-react';

export function ConfigPanel() {
  const resetConfig = useGameStore((s) => s.resetConfig);

  return (
    <div className="flex h-full flex-col border-r border-border bg-card/40">
      <div className="flex items-center justify-between border-b border-border p-3">
        <div className="text-sm font-semibold">遊戲設定 GameConfig</div>
        <Button size="sm" variant="ghost" onClick={resetConfig}>
          <RotateCcw className="h-3.5 w-3.5" /> 重置
        </Button>
      </div>

      <Tabs defaultValue="general" className="flex min-h-0 flex-1 flex-col">
        <div className="px-3 pt-2">
          <TabsList>
            <TabsTrigger value="general">一般</TabsTrigger>
            <TabsTrigger value="symbols">圖示</TabsTrigger>
            <TabsTrigger value="reels">假盤</TabsTrigger>
            <TabsTrigger value="features">觸發/功能</TabsTrigger>
            <TabsTrigger value="cheats">作弊/購買</TabsTrigger>
            <TabsTrigger value="system">亂數/動畫</TabsTrigger>
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
