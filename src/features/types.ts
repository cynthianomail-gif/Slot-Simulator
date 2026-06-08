import type {
  GameConfig,
  FeatureConfigEntry,
  FeatureState,
  SpinResult,
} from '@/types';
import type { IRng } from '@/engine/rng';

/**
 * Feature Plugin System.
 *
 * Every Feature is a self-contained plugin that manages its own FeatureState
 * machine (INACTIVE -> TRIGGERED -> INITIALIZE -> RUNNING -> COMPLETE).
 *
 * Plugins are pure with respect to presentation: they produce SpinResults and
 * a win total. The host (GameEngine) supplies the spin primitive so a feature
 * can request additional spins of a given kind (e.g. free-game spins).
 */

export interface FeatureRunContext {
  config: GameConfig;
  rng: IRng;
  bet: number;
  /** Run one base spin of a given kind and return its result. */
  runSpin: (kind: string) => SpinResult;
  /** Emit a scoped game event. */
  emit: (type: string, payload?: unknown) => void;
}

export interface FeatureRunResult {
  /** Spins produced inside the feature session. */
  spins: SpinResult[];
  /** Total win contributed by the feature (sum of its spins). */
  win: number;
  /** How many times the feature retriggered/extended. */
  retriggered: number;
}

export interface FeaturePlugin {
  /** Plugin type key, matched against FeatureConfigEntry.type. */
  readonly type: string;
  /** Current lifecycle state (for the debug panel). */
  state: FeatureState;
  /**
   * Execute the whole feature session synchronously.
   * Implementations should advance `state` through the lifecycle.
   */
  run(entry: FeatureConfigEntry, ctx: FeatureRunContext): FeatureRunResult;
}

/** A factory creates a fresh plugin instance (so state is per-round). */
export type FeatureFactory = () => FeaturePlugin;
