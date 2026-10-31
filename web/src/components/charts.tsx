// Hand-made SVG charts. They plot only recorded data: no smoothing, no projections.
import { useI18n } from '../i18n/index.tsx';
import { segmentsByMethod, type MeasurementPoint } from '../../../shared/goals.ts';
import { daysBetween } from '../../../shared/dates.ts';

const W = 640;
const H = 240;
const PAD = { l: 40, r: 40, t: 16, b: 34 };

export interface GoalChartProps {
  points: (MeasurementPoint & { isBaseline?: boolean })[];
  baseline: number | null;
  target: number | null;
  targetMin: number | null;
  targetMax: number | null;
  unit?: string | null;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}

export function GoalChart({ points, baseline, target, targetMin, targetMax, unit, selectedId, onSelect }: GoalChartProps) {
  const { t, fmtDate, dir } = useI18n();
  const valid = points.filter((p) => p.value != null).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!valid.length) return <div className="empty">{t('progress.noData')}</div>;
  const vals = valid.map((p) => p.value as number);
  [baseline, target, targetMin, targetMax].forEach((v) => v != null && vals.push(v));
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.12;
  lo -= pad; hi += pad;
  const d0 = valid[0].date;
  const d1 = valid[valid.length - 1].date;
  const span = Math.max(1, daysBetween(d0, d1));
  const rtl = dir === 'rtl';
  // Time runs in reading direction: right-to-left in Hebrew.
  const x = (d: string) => {
    const f = valid.length === 1 ? 0.5 : daysBetween(d0, d) / span;
    const w = W - PAD.l - PAD.r;
    return rtl ? W - PAD.r - f * w : PAD.l + f * w;
  };
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const ticks = [lo + pad, (lo + hi) / 2, hi - pad];
  const segs = segmentsByMethod(valid);
  const methodBreaks = segs.slice(1).map((s) => s[0]);
  const xl = Math.min(x(d0), x(d1)) - 6;
  const xr = Math.max(x(d0), x(d1)) + 6;

  return (
    <div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="goal chart">
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#eee5d8" />
            <text x={rtl ? W - 2 : 2} y={y(v) + 4} textAnchor={rtl ? 'end' : 'start'}>{Math.round(v * 10) / 10}</text>
          </g>
        ))}
        {targetMin != null && targetMax != null && (
          <rect x={PAD.l} width={W - PAD.l - PAD.r} y={y(targetMax)} height={Math.max(1, y(targetMin) - y(targetMax))} fill="#e3e8dc" opacity="0.8" />
        )}
        {target != null && <line x1={PAD.l} x2={W - PAD.r} y1={y(target)} y2={y(target)} stroke="#56664d" strokeDasharray="6 5" strokeWidth="2" />}
        {baseline != null && <line x1={PAD.l} x2={W - PAD.r} y1={y(baseline)} y2={y(baseline)} stroke="#b9a68a" strokeDasharray="2 4" strokeWidth="2" />}
        {methodBreaks.map((p) => (
          <line key={'m' + p.id} x1={x(p.date)} x2={x(p.date)} y1={PAD.t} y2={H - PAD.b} stroke="#9a6b1f" strokeDasharray="3 3" />
        ))}
        {segs.map((s, i) => (
          <polyline key={i} fill="none" stroke="#8a9a7b" strokeWidth="2.5" points={s.map((p) => `${x(p.date)},${y(p.value as number)}`).join(' ')} />
        ))}
        {valid.map((p) => (
          <g key={p.id} onClick={() => onSelect?.(p.id)} style={{ cursor: onSelect ? 'pointer' : undefined }}>
            <circle cx={x(p.date)} cy={y(p.value as number)} r={selectedId === p.id ? 8 : 6}
              fill={p.conditionsDiffer ? '#fff' : p.isBaseline ? '#b9a68a' : '#56664d'} stroke="#56664d" strokeWidth="2" />
            {(p.notes || p.hasMedia) && <circle cx={x(p.date) + 7} cy={y(p.value as number) - 7} r="3" fill="#9a6b1f" />}
            <circle cx={x(p.date)} cy={y(p.value as number)} r="16" fill="transparent" />
          </g>
        ))}
        <text x={x(d0)} y={H - 10} textAnchor="middle">{fmtDate(d0, { day: 'numeric', month: 'short' })}</text>
        {d1 !== d0 && <text x={x(d1)} y={H - 10} textAnchor="middle">{fmtDate(d1, { day: 'numeric', month: 'short' })}</text>}
        <line x1={xl} x2={xr} y1={H - PAD.b} y2={H - PAD.b} stroke="#e6dccd" />
      </svg>
      <div className="legend">
        <span><i style={{ background: '#8a9a7b' }} />{t('progress.latest')}{unit ? ` (${unit})` : ''}</span>
        {baseline != null && <span><i style={{ background: '#b9a68a' }} />{t('progress.baseline')}</span>}
        {target != null && <span><i style={{ background: '#56664d' }} />{t('progress.target')}</span>}
        {targetMin != null && targetMax != null && <span><i style={{ background: '#e3e8dc', height: 10 }} />{t('progress.targetRange')}</span>}
        {methodBreaks.length > 0 && <span><i style={{ background: '#9a6b1f' }} />{t('progress.methodChanged')}</span>}
        {valid.some((p) => p.conditionsDiffer) && <span>○ {t('progress.differentConditions')}</span>}
      </div>
      <div className="tiny muted" style={{ marginTop: 4 }}>{t('progress.noProjection')}</div>
    </div>
  );
}

export interface WeekBar { weekStart: string; planned: number; completed: number; partial: number; skipped: number; missed: number; upcoming: number }

/** Planned vs done per week as plain counts (stacked: completed, partial; outline = planned). */
export function AdherenceBars({ weeks, target }: { weeks: WeekBar[]; target?: number | null }) {
  const { t, fmtDate } = useI18n();
  if (!weeks.length) return <div className="empty">{t('progress.noData')}</div>;
  const max = Math.max(...weeks.map((w) => w.planned), target ?? 0, 1);
  const bw = Math.min(56, (W - PAD.l - PAD.r) / weeks.length - 10);
  const step = (W - PAD.l - PAD.r) / weeks.length;
  const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
  return (
    <div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="adherence chart">
        {weeks.map((w, i) => {
          const cx = PAD.l + step * i + step / 2;
          return (
            <g key={w.weekStart}>
              <rect x={cx - bw / 2} y={y(w.planned)} width={bw} height={H - PAD.b - y(w.planned)} fill="none" stroke="#d9c8ad" strokeWidth="2" rx="6" />
              <rect x={cx - bw / 2} y={y(w.completed)} width={bw} height={H - PAD.b - y(w.completed)} fill="#56664d" rx="6" />
              <rect x={cx - bw / 2} y={y(w.completed + w.partial)} width={bw} height={y(w.completed) - y(w.completed + w.partial)} fill="#8a9a7b" />
              <text x={cx} y={y(w.planned) - 5} textAnchor="middle">{w.completed + w.partial}/{w.planned}</text>
              <text x={cx} y={H - 12} textAnchor="middle">{fmtDate(w.weekStart, { day: 'numeric', month: 'numeric' })}</text>
            </g>
          );
        })}
        {target != null && <line x1={PAD.l} x2={W - PAD.r} y1={y(target)} y2={y(target)} stroke="#56664d" strokeDasharray="6 5" />}
      </svg>
      <div className="legend">
        <span><i style={{ background: '#56664d', height: 10 }} />{t('status.completed')}</span>
        <span><i style={{ background: '#8a9a7b', height: 10 }} />{t('status.partial')}</span>
        <span><i style={{ border: '2px solid #d9c8ad', height: 10 }} />{t('status.planned')}</span>
      </div>
    </div>
  );
}

/** Simple line for exercise history (e.g. top-set weight per session). */
export function MiniLine({ points, unit }: { points: { date: string; value: number; label?: string }[]; unit?: string }) {
  return (
    <GoalChart
      points={points.map((p, i) => ({ id: String(i), date: p.date, value: p.value, methodVersion: 1, notes: p.label }))}
      baseline={null} target={null} targetMin={null} targetMax={null} unit={unit}
    />
  );
}
