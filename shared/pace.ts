/** Pace in seconds per km, or null when it can't be calculated honestly. */
export function paceSecPerKm(distanceKm: number | null | undefined, durationSec: number | null | undefined): number | null {
  if (!distanceKm || !durationSec || distanceKm <= 0 || durationSec <= 0) return null;
  return durationSec / distanceKm;
}

export function formatDuration(totalSec: number | null | undefined): string {
  if (totalSec == null || !Number.isFinite(totalSec) || totalSec < 0) return '–';
  const s = Math.round(totalSec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? h + ':' : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

export function formatPace(secPerKm: number | null): string {
  return secPerKm == null ? '–' : `${formatDuration(secPerKm)}/km`;
}

/** Parses "mm:ss", "h:mm:ss" or plain minutes into seconds. */
export function parseDuration(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(parseFloat(t) * 60);
  const parts = t.split(':').map((p) => Number(p));
  if (parts.some((p) => !Number.isFinite(p) || p < 0)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}
