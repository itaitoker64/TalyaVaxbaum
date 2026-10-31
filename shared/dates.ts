// Calendar dates are plain 'YYYY-MM-DD' strings in the client's local calendar.
// All arithmetic is done in UTC so it never shifts across DST changes.
export type ISODate = string;

const DAY = 86_400_000;

export function isISODate(s: unknown): s is ISODate {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
}

export function toISODate(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayISO(): ISODate {
  return toISODate(new Date());
}

function toUTC(s: ISODate): number {
  return Date.parse(s + 'T00:00:00Z');
}

function fromUTC(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(s: ISODate, n: number): ISODate {
  return fromUTC(toUTC(s) + n * DAY);
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b) - toUTC(a)) / DAY);
}

/** 0 = Sunday … 6 = Saturday */
export function dayOfWeek(s: ISODate): number {
  return new Date(toUTC(s)).getUTCDay();
}

/** First day of the week containing `s`. Israel's week starts on Sunday (0). */
export function weekStart(s: ISODate, startDay = 0): ISODate {
  const diff = (dayOfWeek(s) - startDay + 7) % 7;
  return addDays(s, -diff);
}

export function weekDates(start: ISODate): ISODate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function compareISO(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
