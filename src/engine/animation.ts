import type { AnimationProfile, AnimationType } from '@/types';

/**
 * Animation controller. Pure timing math — translates an AnimationProfile into
 * per-reel schedules the UI layer consumes. All animations can be globally
 * disabled (requirement #5): when disabled the controller reports zero-duration
 * schedules so results render instantly.
 */

export interface ReelSchedule {
  /** ms after spin start when this reel begins decelerating. */
  startDelay: number;
  /** total ms this reel spins. */
  duration: number;
  /** bounce settle duration. */
  bounce: number;
  bounceCurve: string;
}

export interface SpinSchedule {
  type: AnimationType;
  totalDuration: number;
  reels: ReelSchedule[];
}

export function buildSchedule(
  profile: AnimationProfile,
  cols: number,
  enabled: boolean,
  type: AnimationType,
): SpinSchedule {
  if (!enabled) {
    return {
      type,
      totalDuration: 0,
      reels: Array.from({ length: cols }, () => ({
        startDelay: 0,
        duration: 0,
        bounce: 0,
        bounceCurve: 'linear',
      })),
    };
  }

  const reels: ReelSchedule[] = Array.from({ length: cols }, (_, col) => {
    const startDelay =
      type === 'independent' ? 0 : col * profile.stopInterval;
    return {
      startDelay,
      duration: profile.totalSpinTime + startDelay,
      bounce: profile.bounceDuration,
      bounceCurve: profile.bounceCurve,
    };
  });

  const totalDuration = Math.max(...reels.map((r) => r.duration + r.bounce), 0);
  return { type, totalDuration, reels };
}
