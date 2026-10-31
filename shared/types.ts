// Domain types shared by the server and the web client.

export type Role = 'coach' | 'client';
export type Track = 'A' | 'B';

export const CATEGORIES = ['strength', 'functional', 'pilates', 'yoga', 'running', 'mobility', 'flexibility'] as const;
export type Category = (typeof CATEGORIES)[number];

/** How an activity is logged. Decides the logging form and the shape of prescriptions/actuals. */
export const LOG_TYPES = ['strength', 'circuit', 'running', 'practice'] as const;
export type LogType = (typeof LOG_TYPES)[number];

export type WeightUnit = 'kg' | 'lb';

/** What the coach prescribes. Immutable once a program version is saved. */
export interface Prescription {
  sets?: number;
  reps?: number;
  repsMax?: number;
  load?: number;
  loadUnit?: WeightUnit;
  loadNote?: string; // e.g. "bodyweight", "light band"
  rpe?: number; // target effort 1–10
  restSec?: number;
  rounds?: number;
  workSec?: number;
  durationMin?: number;
  distanceKm?: number;
  side?: string; // e.g. "each side"
  notes?: string;
}

/** What the client actually did. Stored separately from the prescription. */
export interface StrengthSet {
  reps?: number | null;
  weight?: number | null;
  unit?: WeightUnit;
  rpe?: number | null;
  done?: boolean;
}

export interface ActualData {
  sets?: StrengthSet[]; // strength
  rounds?: number | null; // circuit
  reps?: number | null; // circuit reps per round
  workSec?: number | null;
  restSec?: number | null;
  distanceKm?: number | null; // running
  durationSec?: number | null; // running / practice
  completed?: boolean; // practice
  difficulty?: 'easy' | 'ok' | 'hard' | null;
}

export type SessionStatus = 'planned' | 'completed' | 'partial' | 'skipped' | 'rescheduled';
export type LogStatus = 'draft' | 'completed' | 'partial' | 'skipped';

export type GoalKind = 'performance' | 'mobility' | 'adherence' | 'body' | 'quality' | 'other';
export type GoalDirection = 'increase' | 'decrease' | 'range';

export interface GoalConditions {
  exerciseId?: string;
  exerciseName?: string;
  variant?: string;
  load?: number;
  loadUnit?: WeightUnit;
  side?: string;
  other?: string;
}

export type QualityRating = 'not_yet' | 'developing' | 'consistent';

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type NutritionMode = 'off' | 'diary' | 'targets';
export interface NutritionConfig {
  mode: NutritionMode;
  kcal?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  guidance?: string;
}
