import type { GameEvent, GameEventType } from '@/types';

/**
 * Event log system. A lightweight, ring-buffered collector that every engine
 * writes through. The UI subscribes to render the Event Viewer; the simulation
 * engine can disable it for max throughput.
 */
export class EventLog {
  private events: GameEvent[] = [];
  private cap: number;
  enabled = true;

  // lifecycle counters maintained by the engine
  roundId = 0;
  spinId = 0;
  cascadeId = 0;

  constructor(cap = 5000) {
    this.cap = cap;
  }

  emit(type: GameEventType | string, payload: unknown = {}): GameEvent | null {
    if (!this.enabled) return null;
    const ev: GameEvent = {
      timestamp: Date.now(),
      type,
      roundId: this.roundId,
      spinId: this.spinId,
      cascadeId: this.cascadeId,
      payload,
    };
    this.events.push(ev);
    if (this.events.length > this.cap) {
      this.events.splice(0, this.events.length - this.cap);
    }
    return ev;
  }

  list(): readonly GameEvent[] {
    return this.events;
  }

  filter(types: string[]): GameEvent[] {
    const set = new Set(types);
    return this.events.filter((e) => set.has(e.type));
  }

  clear(): void {
    this.events = [];
  }
}
