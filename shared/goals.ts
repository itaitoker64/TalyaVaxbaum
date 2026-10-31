import type { GoalDirection } from './types.ts';

export interface GoalTarget {
  direction: GoalDirection;
  baselineValue: number | null;
  targetValue: number | null;
  targetMin: number | null;
  targetMax: number | null;
}

export interface MeasurementPoint {
  id: string;
  date: string;
  value: number | null;
  methodVersion: number;
  /** true when measured under different conditions than the goal's current definition */
  conditionsDiffer?: boolean;
  notes?: string | null;
  hasMedia?: boolean;
}

export type TargetStatus = 'no_data' | 'not_reached' | 'reached';

/** Whether a measured value meets the goal target. Purely descriptive; never extrapolated. */
export function targetStatus(goal: GoalTarget, value: number | null | undefined): TargetStatus {
  if (value == null || !Number.isFinite(value)) return 'no_data';
  if (goal.direction === 'range') {
    if (goal.targetMin == null && goal.targetMax == null) return 'no_data';
    const okMin = goal.targetMin == null || value >= goal.targetMin;
    const okMax = goal.targetMax == null || value <= goal.targetMax;
    return okMin && okMax ? 'reached' : 'not_reached';
  }
  if (goal.targetValue == null) return 'no_data';
  return goal.direction === 'increase'
    ? value >= goal.targetValue ? 'reached' : 'not_reached'
    : value <= goal.targetValue ? 'reached' : 'not_reached';
}

/** Change from baseline in the direction of improvement (positive = improved). */
export function changeFromBaseline(goal: GoalTarget, value: number | null): number | null {
  if (value == null || goal.baselineValue == null) return null;
  const diff = value - goal.baselineValue;
  if (goal.direction === 'decrease') return -diff;
  if (goal.direction === 'increase') return diff;
  return null; // "improvement" isn't one-dimensional for range goals
}

/** Latest valid (numeric) measurement by date. */
export function latestMeasurement(points: MeasurementPoint[]): MeasurementPoint | null {
  const numeric = points.filter((p) => p.value != null).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return numeric.length ? numeric[numeric.length - 1] : null;
}

/**
 * Splits measurements into segments by measurement method version so charts don't draw a
 * continuous line across a change in how the metric is measured.
 */
export function segmentsByMethod(points: MeasurementPoint[]): MeasurementPoint[][] {
  const sorted = points.filter((p) => p.value != null).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const out: MeasurementPoint[][] = [];
  for (const p of sorted) {
    const last = out[out.length - 1];
    if (last && last[0].methodVersion === p.methodVersion) last.push(p);
    else out.push([p]);
  }
  return out;
}
