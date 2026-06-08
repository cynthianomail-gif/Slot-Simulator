/** Game-wide state machine states (the round/spin/cascade lifecycle). */
export type GameState =
  | 'IDLE'
  | 'ROUND_START'
  | 'SPIN_START'
  | 'SPINNING'
  | 'SPIN_STOP'
  | 'EVALUATE'
  | 'CASCADE_CHECK'
  | 'CASCADE_RUNNING'
  | 'FEATURE_TRIGGER'
  | 'FEATURE_RUNNING'
  | 'ROUND_END';

/** Per-feature lifecycle state. Each active feature manages its own. */
export type FeatureState =
  | 'INACTIVE'
  | 'TRIGGERED'
  | 'INITIALIZE'
  | 'RUNNING'
  | 'COMPLETE';

/** Identifies the lifecycle level a spin belongs to. */
export type SpinKind = 'normal' | 'freegame' | 'bonus' | 'respin';
