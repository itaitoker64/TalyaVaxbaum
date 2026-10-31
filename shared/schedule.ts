import { addDays, compareISO, weekStart, type ISODate } from './dates.ts';
import type { SessionStatus } from './types.ts';

export interface WorkoutSlot {
  id: string;
  weekIndex: number; // 1-based week of the program block
  dayOfWeek: number; // 0 = Sunday
}

/**
 * Dates for each program workout. Week 1 is the week containing `startDate`; workouts that would
 * fall before the start date in week 1 are not scheduled (never back-filled into the past).
 */
export function scheduleDates(
  slots: WorkoutSlot[],
  startDate: ISODate,
  lengthWeeks: number,
  weekStartDay = 0,
): { workoutId: string; date: ISODate }[] {
  const firstWeek = weekStart(startDate, weekStartDay);
  const out: { workoutId: string; date: ISODate }[] = [];
  for (const s of slots) {
    if (s.weekIndex < 1 || s.weekIndex > lengthWeeks) continue;
    const offset = (s.dayOfWeek - weekStartDay + 7) % 7;
    const date = addDays(firstWeek, (s.weekIndex - 1) * 7 + offset);
    if (compareISO(date, startDate) < 0) continue;
    out.push({ workoutId: s.id, date });
  }
  return out.sort((a, b) => compareISO(a.date, b.date));
}

export interface AdherenceSession {
  date: ISODate;
  status: SessionStatus;
}

export interface WeekAdherence {
  weekStart: ISODate;
  planned: number;
  completed: number;
  partial: number;
  skipped: number;
  /** planned sessions in the past with nothing logged */
  missed: number;
  upcoming: number;
}

/**
 * Plain counts relative to the plan, per week. A rescheduled original is not counted (its
 * replacement is counted on its new date). No combined score is produced on purpose.
 */
export function weeklyAdherence(sessions: AdherenceSession[], today: ISODate, weekStartDay = 0): WeekAdherence[] {
  const weeks = new Map<string, WeekAdherence>();
  for (const s of sessions) {
    if (s.status === 'rescheduled') continue;
    const ws = weekStart(s.date, weekStartDay);
    let w = weeks.get(ws);
    if (!w) {
      w = { weekStart: ws, planned: 0, completed: 0, partial: 0, skipped: 0, missed: 0, upcoming: 0 };
      weeks.set(ws, w);
    }
    w.planned++;
    if (s.status === 'completed') w.completed++;
    else if (s.status === 'partial') w.partial++;
    else if (s.status === 'skipped') w.skipped++;
    else if (compareISO(s.date, today) < 0) w.missed++;
    else w.upcoming++;
  }
  return [...weeks.values()].sort((a, b) => compareISO(a.weekStart, b.weekStart));
}
