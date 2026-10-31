// Hand-made SVG charts. They plot only recorded data: no smoothing, no projections.
import { useI18n } from '../i18n/index.tsx';
import { type MeasurementPoint } from '../../../shared/goals.ts';
import { Icon } from './ui.tsx';
import { daysBetween } from '../../../shared/dates.ts';

const W = 640;
const H = 240;
const PAD = { l: 40, r: 40, t: 16, b: 34 };
const GAP_DAYS = 28;

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

/**
 * Goal chart. Measured results are solid points joined by a line; the baseline and target are
 * labeled reference lines (or a shaded range); the line breaks at a change of measurement method
 * and across long gaps, which are marked rather than interpolated. Hebrew labels are HTML overlays
 * so bidi text is never reordered inside SVG.
 */
export function GoalChart({ points, baseline, target, targetMin, targetMax, unit, selectedId, onSelect }: GoalChartProps) {
  const { t, fmtDate, fmtNum, dir } = useI18n();
  const CW = 680, CH = 330, P = { x: 46, t: 34, b: 52 };
  const valid = points.filter((p) => p.value != null).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!valid.length) return <div className="empty">{t('progress.noData')}</div>;
  const vals = valid.map((p) => p.value as number);
  [baseline, target, targetMin, targetMax].forEach((v) => v != null && vals.push(v));
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.15;
  lo -= pad; hi += pad;
  const d0 = valid[0].date, d1 = valid[valid.length - 1].date;
  const span = Math.max(1, daysBetween(d0, d1));
  const rtl = dir === 'rtl';
  const w = CW - 2 * P.x;
  // Time runs in reading direction: right-to-left in Hebrew.
  const x = (d: string) => { const f = valid.length === 1 ? 0.5 : daysBetween(d0, d) / span; return rtl ? CW - P.x - f * w : P.x + f * w; };
  const y = (v: number) => P.t + (1 - (v - lo) / (hi - lo)) * (CH - P.t - P.b);
  const ticks = [0, 1, 2, 3].map((i) => lo + pad + ((hi - lo - 2 * pad) * i) / 3);
  // Segments: break on method change and on long gaps (no interpolation across missing data).
  const segs: typeof valid[] = [];
  const gaps: [typeof valid[0], typeof valid[0]][] = [];
  for (const p of valid) {
    const last = segs[segs.length - 1];
    const prev = last?.[last.length - 1];
    if (prev && prev.methodVersion === p.methodVersion && daysBetween(prev.date, p.date) <= GAP_DAYS) last.push(p);
    else {
      if (prev && daysBetween(prev.date, p.date) > GAP_DAYS) gaps.push([prev, p]);
      segs.push([p]);
    }
  }
  const methodBreaks = valid.filter((p, i) => i > 0 && p.methodVersion !== valid[i - 1].methodVersion);
  const showAllDates = valid.length <= 6;
  const pct = (px: number, total: number) => `${(px / total) * 100}%`;
  return (
    <div>
      <div style={{ position: 'relative' }}>
        <svg className="chart" viewBox={`0 0 ${CW} ${CH}`} role="img" aria-label={`${t('progress.history')}: ${valid.map((p) => `${fmtDate(p.date, { day: 'numeric', month: 'short' })} ${fmtNum(p.value)}`).join(', ')}`}>
          {ticks.map((v, i) => (
            <g key={i}>
              <line x1={P.x} x2={CW - P.x} y1={y(v)} y2={y(v)} stroke="#eee5d8" />
              <text x={rtl ? CW - 4 : 4} y={y(v) + 5} textAnchor={rtl ? 'end' : 'start'}>{fmtNum(v)}</text>
            </g>
          ))}
          {targetMin != null && targetMax != null && <rect x={P.x} width={w} y={y(targetMax)} height={Math.max(2, y(targetMin) - y(targetMax))} fill="#e5ebdd" />}
          {target != null && <line x1={P.x} x2={CW - P.x} y1={y(target)} y2={y(target)} stroke="#4d6143" strokeDasharray="10 7" strokeWidth="2.5" />}
          {baseline != null && <line x1={P.x} x2={CW - P.x} y1={y(baseline)} y2={y(baseline)} stroke="#b9a68a" strokeDasharray="2 6" strokeWidth="2.5" strokeLinecap="round" />}
          {methodBreaks.map((p) => <line key={'m' + p.id} x1={x(p.date)} x2={x(p.date)} y1={P.t - 10} y2={CH - P.b} stroke="#8a5d12" strokeDasharray="4 4" strokeWidth="1.5" />)}
          {gaps.map(([a, b], i) => <line key={'g' + i} x1={x(a.date)} x2={x(b.date)} y1={y(a.value as number)} y2={y(b.value as number)} stroke="#cbbca5" strokeWidth="2" strokeDasharray="1 7" strokeLinecap="round" />)}
          {segs.map((sg, i) => sg.length > 1 && <polyline key={i} fill="none" stroke="#7e9471" strokeWidth="3.5" strokeLinejoin="round" points={sg.map((p) => `${x(p.date)},${y(p.value as number)}`).join(' ')} />)}
          {valid.map((p) => (
            <g key={p.id} onClick={() => onSelect?.(p.id)} style={{ cursor: onSelect ? 'pointer' : undefined }}>
              <circle cx={x(p.date)} cy={y(p.value as number)} r={selectedId === p.id ? 10 : 8}
                fill={p.conditionsDiffer ? '#fff' : p.isBaseline ? '#b9a68a' : '#4d6143'} stroke={p.isBaseline ? '#8a7558' : '#4d6143'} strokeWidth="3" />
              <text className="lbl" x={x(p.date)} y={y(p.value as number) - 15} textAnchor="middle" style={{ fill: '#26241f' }}>{fmtNum(p.value)}</text>
              {(p.notes || p.hasMedia) && <circle cx={x(p.date) + 10} cy={y(p.value as number) + 10} r="4" fill="#8a5d12" />}
              <circle cx={x(p.date)} cy={y(p.value as number)} r="20" fill="transparent" />
            </g>
          ))}
          <line x1={P.x} x2={CW - P.x} y1={CH - P.b + 6} y2={CH - P.b + 6} stroke="#e9e0d2" />
          {(showAllDates ? valid : [valid[0], valid[valid.length - 1]]).map((p) => (
            <text key={'d' + p.id} x={x(p.date)} y={CH - P.b + 28} textAnchor="middle">{fmtDate(p.date, { day: 'numeric', month: 'numeric' })}</text>
          ))}
        </svg>
        {/* Direct labels on reference lines (HTML, bidi-safe) */}
        {target != null && <span className="badge" style={{ position: 'absolute', top: `calc(${pct(y(target), CH)} - 1.45rem)`, [rtl ? 'right' : 'left']: pct(P.x, CW), background: '#4d6143', color: '#fff' }}><Icon name="target" />{t('progress.target')} <bdi>{fmtNum(target)} {unit}</bdi></span>}
        {targetMin != null && targetMax != null && <span className="badge" style={{ position: 'absolute', top: `calc(${pct(y(targetMax), CH)} - 1.45rem)`, [rtl ? 'right' : 'left']: pct(P.x, CW), background: '#4d6143', color: '#fff' }}><Icon name="target" />{t('progress.targetRange')} <bdi>{fmtNum(targetMin)}–{fmtNum(targetMax)} {unit}</bdi></span>}
        {baseline != null && <span className="badge" style={{ position: 'absolute', top: `calc(${pct(y(baseline), CH)} + 0.25rem)`, [rtl ? 'left' : 'right']: pct(P.x, CW), background: '#f3ece1', color: '#6b6358' }}>{t('progress.baseline')} <bdi>{fmtNum(baseline)}</bdi></span>}
        {unit && <span className="tiny muted" style={{ position: 'absolute', top: 0, [rtl ? 'right' : 'left']: 0 }}>{unit}</span>}
      </div>
      <div className="legend">
        <span><i style={{ borderColor: '#7e9471', borderTopWidth: 4 }} />● {t('progress.measured')}</span>
        {baseline != null && <span><i style={{ borderColor: '#b9a68a', borderTopStyle: 'dotted' }} />{t('progress.baseline')}</span>}
        {target != null && <span><i style={{ borderColor: '#4d6143', borderTopStyle: 'dashed' }} />{t('progress.target')}</span>}
        {targetMin != null && targetMax != null && <span><i style={{ borderColor: '#e5ebdd', borderTopWidth: 10 }} />{t('progress.targetRange')}</span>}
        {gaps.length > 0 && <span><i style={{ borderColor: '#cbbca5', borderTopStyle: 'dotted' }} />{t('progress.gap')}</span>}
        {methodBreaks.length > 0 && <span><i style={{ borderColor: '#8a5d12', borderTopStyle: 'dashed' }} />{t('progress.methodChanged')}</span>}
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
