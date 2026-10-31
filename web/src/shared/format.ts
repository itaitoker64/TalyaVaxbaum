import type { Prescription, ActualData } from '../../../shared/types.ts';
import { formatDuration, formatPace, paceSecPerKm } from '../../../shared/pace.ts';

type T = (k: any, v?: Record<string, string | number>) => string;

/** Prescription in compact form, e.g. "3 × 8–10 · 12 kg · RPE 7 · rest 1:30". */
export function formatPrescription(p: Prescription, logType: string, t: T): string {
  return prescriptionParts(p, logType, t).join(' · ');
}

/** Prescription as separate parts, so each can be bidi-isolated when rendered in Hebrew. */
export function prescriptionParts(p: Prescription, logType: string, t: T): string[] {
  const parts: string[] = [];
  if (logType === 'strength') {
    if (p.sets || p.reps) parts.push(`${p.sets ?? '?'} × ${p.reps ?? '?'}${p.repsMax ? '–' + p.repsMax : ''}`);
    if (p.load != null) parts.push(`${p.load} ${p.loadUnit ?? 'kg'}`);
    if (p.loadNote) parts.push(p.loadNote);
    if (p.rpe) parts.push(`RPE ${p.rpe}`);
    if (p.restSec) parts.push(`${t('training.rest')} ${formatDuration(p.restSec)}`);
  } else if (logType === 'circuit') {
    if (p.rounds) parts.push(`${p.rounds} ${t('training.rounds')}`);
    if (p.reps) parts.push(`${p.reps} ${t('training.reps')}`);
    if (p.workSec) parts.push(`${formatDuration(p.workSec)} / ${formatDuration(p.restSec ?? 0)}`);
  } else if (logType === 'running') {
    if (p.distanceKm) parts.push(`${p.distanceKm} km`);
    if (p.durationMin) parts.push(`${p.durationMin} ${t('common.min')}`);
    if (p.rpe) parts.push(`RPE ${p.rpe}`);
  } else {
    if (p.durationMin) parts.push(`${p.durationMin} ${t('common.min')}`);
  }
  if (p.side) parts.push(p.side);
  return parts;
}

export function formatActual(d: ActualData | null | undefined, logType: string, t: T): string {
  return actualParts(d, logType, t).join(' · ');
}

export function actualParts(d: ActualData | null | undefined, logType: string, t: T): string[] {
  if (!d) return [];
  if (logType === 'strength') {
    const sets = (d.sets ?? []).filter((s) => s.reps != null || s.weight != null);
    return sets.map((s) => `${s.reps ?? '–'}${s.weight != null ? ' × ' + s.weight + ' ' + (s.unit ?? 'kg') : ''}`);
  }
  if (logType === 'circuit') return [d.rounds != null && `${d.rounds} ${t('training.rounds')}`, d.reps != null && `${d.reps} ${t('training.reps')}`].filter(Boolean) as string[];
  if (logType === 'running') {
    const pace = paceSecPerKm(d.distanceKm, d.durationSec);
    return [d.distanceKm != null && `${d.distanceKm} km`, d.durationSec != null && formatDuration(d.durationSec), pace != null && formatPace(pace)].filter(Boolean) as string[];
  }
  return [d.durationSec != null && `${Math.round(d.durationSec / 60)} ${t('common.min')}`, d.completed && '✓', d.difficulty && t('diff.' + d.difficulty)].filter(Boolean) as string[];
}

/** Heaviest completed set (for exercise history charts). */
export function topSet(d: ActualData | null | undefined): { weight: number; reps: number } | null {
  let best: { weight: number; reps: number } | null = null;
  for (const s of d?.sets ?? []) {
    if (s.weight == null || s.reps == null) continue;
    if (!best || s.weight > best.weight || (s.weight === best.weight && s.reps > best.reps)) best = { weight: s.weight, reps: s.reps };
  }
  return best;
}
