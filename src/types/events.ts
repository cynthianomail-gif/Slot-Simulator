/** Event log system. Every meaningful action emits a GameEvent. */

export type GameEventType =
  | 'ROUND_START'
  | 'SPIN_START'
  | 'REEL_STOP'
  | 'EVALUATE'
  | 'CASCADE'
  | 'WIN'
  | 'FG_TRIGGER'
  | 'BG_TRIGGER'
  | 'BONUS_TRIGGER'
  | 'FEATURE_START'
  | 'FEATURE_END'
  | 'STATE_CHANGE'
  | 'CHEAT'
  | 'BUY'
  | 'ROUND_END';

export interface GameEvent {
  timestamp: number;
  type: GameEventType | string;

  roundId: number;
  spinId: number;
  cascadeId: number;

  /** Free-form structured payload specific to the event type. */
  payload: unknown;
}
