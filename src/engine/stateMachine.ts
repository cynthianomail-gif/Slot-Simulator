import type { GameState } from '@/types';

/**
 * Declarative description of the game-wide state machine. The engine advances
 * through these states; the UI / debug panel reads `legalNext` for validation
 * and visualisation. Kept separate from the engine so the topology is testable
 * and documentable on its own.
 */
export const GAME_TRANSITIONS: Record<GameState, GameState[]> = {
  IDLE: ['ROUND_START'],
  ROUND_START: ['SPIN_START'],
  SPIN_START: ['SPINNING'],
  SPINNING: ['SPIN_STOP'],
  SPIN_STOP: ['EVALUATE'],
  EVALUATE: ['CASCADE_CHECK'],
  CASCADE_CHECK: ['CASCADE_RUNNING', 'FEATURE_TRIGGER', 'SPIN_START', 'ROUND_END'],
  CASCADE_RUNNING: ['EVALUATE'],
  FEATURE_TRIGGER: ['FEATURE_RUNNING'],
  FEATURE_RUNNING: ['SPIN_START', 'ROUND_END'],
  ROUND_END: ['IDLE'],
};

export function canTransition(from: GameState, to: GameState): boolean {
  return GAME_TRANSITIONS[from]?.includes(to) ?? false;
}

export const ALL_GAME_STATES: GameState[] = Object.keys(
  GAME_TRANSITIONS,
) as GameState[];
