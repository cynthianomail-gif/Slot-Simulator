import { useEffect } from 'react';
import { useGameStore } from '@/store/gameStore';
import { ConfigPanel } from '@/components/ConfigPanel/ConfigPanel';
import { SlotCanvas } from '@/components/SlotCanvas/SlotCanvas';
import { FloatingWin } from '@/components/SlotCanvas/FloatingWin';
import { ControlBar } from '@/components/ControlBar/ControlBar';
import { StatsDashboard } from '@/components/Stats/StatsDashboard';
import { DebugPanel } from '@/components/Debug/DebugPanel';

export default function App() {
  const init = useGameStore((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-border bg-card/60 px-4 py-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-gradient-to-br from-primary to-accent font-black text-primary-foreground">
            S
          </div>
          <div className="text-sm font-semibold leading-none">Slot Simulator</div>
        </div>
      </header>

      {/* Main 3-column layout */}
      <div className="grid min-h-0 flex-1 grid-cols-[360px_1fr_340px] grid-rows-[minmax(0,1fr)]">
        {/* Left: config */}
        <ConfigPanel />

        {/* Center: canvas + control bar */}
        <div className="flex min-h-0 flex-col">
          <div className="relative min-h-0 flex-1">
            <SlotCanvas />
            <FloatingWin />
          </div>
          <ControlBar />
        </div>

        {/* Right: stats + debug */}
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto border-l border-border p-3">
          <StatsDashboard />
          <DebugPanel />
        </div>
      </div>
    </div>
  );
}
