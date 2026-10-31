import { useEffect, type ReactNode, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes } from 'react';
import { useI18n } from '../i18n/index.tsx';
import type { StringKey } from '../i18n/strings.ts';
import { ApiError } from '../api.ts';
import { todayISO, addDays } from '../../../shared/dates.ts';
import {
  Sun, Dumbbell, Salad, TrendingUp, MessageCircle, Play, Check, Video, Timer, Share2, Pencil, Save, Clock, Gauge,
  SlidersHorizontal, Download, Image as ImageIcon, History, Target, LayoutGrid, ChevronLeft, Plus, Minus, X, Captions, Heart, Star, Leaf, Flame,
} from 'lucide-react';

export function Loading() {
  const { t } = useI18n();
  return (
    <div className="loading" role="status">
      <span className="spinner" /> {t('common.loading')}
    </div>
  );
}

export function errorText(t: ReturnType<typeof useI18n>['t'], e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 0) return t('common.network');
    if (e.status === 404) return t('common.notFound');
    if (e.code === 'validation') return t('common.validation');
    if (e.code === 'too_large') return t('lib.tooLarge');
    if (e.code === 'unsupported_type') return t('lib.badType');
    if (e.code === 'upload_interrupted') return t('lib.uploadFailed');
  }
  return t('common.error');
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="alert error" role="alert">
      <div className="row between">
        <span>{errorText(t, error)}</span>
        {onRetry && (
          <button className="btn small" onClick={onRetry}>
            {t('common.retry')}
          </button>
        )}
      </div>
    </div>
  );
}

/** Renders loading / error / content for a useApi result. */
export function Async<T>({ q, children }: { q: { data: T | null; loading: boolean; error: unknown; reload: () => void }; children: (d: T) => ReactNode }) {
  if (q.error && !q.data) return <ErrorBox error={q.error} onRetry={q.reload} />;
  if (q.data == null) return <Loading />;
  return <>{children(q.data)}</>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <div className="tiny muted">{hint}</div>}
    </label>
  );
}

export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={'input ' + (p.className ?? '')} />;
export const TextArea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={'input ' + (p.className ?? '')} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={'input ' + (p.className ?? '')} />;

/** Number input that stores numbers (or null) and opens a numeric keypad on phones. */
export function NumInput({ value, onChange, step = 'any', placeholder, ariaLabel, className }: { value: number | null | undefined; onChange: (v: number | null) => void; step?: string; placeholder?: string; ariaLabel?: string; className?: string }) {
  return (
    <input
      className={'input numeric ' + (className ?? '')}
      type="number"
      inputMode="decimal"
      step={step}
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
    />
  );
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useI18n();
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button className="iconbtn" onClick={onClose} aria-label={t('common.close')}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function DemoBadge({ show }: { show?: boolean | number }) {
  const { t } = useI18n();
  return show ? <span className="badge demo">{t('common.demo')}</span> : null;
}

const STATUS_CLASS: Record<string, string> = { completed: 'ok', partial: 'ok', skipped: 'warn', rescheduled: '', planned: '', draft: 'warn', missed: '' };
export function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  return <span className={'badge ' + (STATUS_CLASS[status] ?? '')}>{t(('status.' + status) as StringKey)}</span>;
}

/** Renders "a · b · c" with each part bidi-isolated: parts without Hebrew are forced LTR so
 *  "3 × 8" or "12 kg" never get reordered inside a right-to-left sentence. */
export function Parts({ parts, sep = ' · ' }: { parts: string[]; sep?: string }) {
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && sep}
          <bdi dir={/[\u0590-\u05FF]/.test(p) ? 'rtl' : 'ltr'}>{p}</bdi>
        </span>
      ))}
    </>
  );
}

export function N({ children }: { children: ReactNode }) {
  return <span className="num">{children}</span>;
}

/** Relative date label: today / yesterday / tomorrow / formatted. */
export function useDateLabel() {
  const { t, fmtDate } = useI18n();
  return (iso: string) => {
    const today = todayISO();
    if (iso === today) return t('common.today');
    if (iso === addDays(today, -1)) return t('common.yesterday');
    if (iso === addDays(today, 1)) return t('common.tomorrow');
    return fmtDate(iso);
  };
}

export function DateNav({ date, onChange }: { date: string; onChange: (d: string) => void }) {
  const label = useDateLabel();
  const { dir } = useI18n();
  const prev = dir === 'rtl' ? '›' : '‹';
  const next = dir === 'rtl' ? '‹' : '›';
  return (
    <div className="row between nowrap card soft" style={{ padding: '0.4rem' }}>
      <button className="iconbtn" aria-label="previous day" onClick={() => onChange(addDays(date, -1))}>{prev}</button>
      <strong>{label(date)}</strong>
      <button className="iconbtn" aria-label="next day" onClick={() => onChange(addDays(date, 1))}>{next}</button>
    </div>
  );
}

const ICONS = {
  today: Sun, training: Dumbbell, nutrition: Salad, progress: TrendingUp, chat: MessageCircle, play: Play, check: Check,
  video: Video, timer: Timer, share: Share2, edit: Pencil, save: Save, clock: Clock, level: Gauge, equipment: Dumbbell,
  filter: SlidersHorizontal, download: Download, image: ImageIcon, history: History, target: Target, library: LayoutGrid,
  chevron: ChevronLeft, plus: Plus, minus: Minus, close: X, captions: Captions, heart: Heart, star: Star, leaf: Leaf, flame: Flame,
} as const;
export type IconName = keyof typeof ICONS;
const DIRECTIONAL = new Set<IconName>(['chevron']);

/** One icon family (Lucide, 2px stroke). Decorative by default; pass `label` for icon-only meaning. */
export function Icon({ name, size = 22, label, filled }: { name: IconName; size?: number; label?: string; filled?: boolean }) {
  const C = ICONS[name];
  return (
    <C size={size} strokeWidth={2} aria-hidden={label ? undefined : true} aria-label={label} role={label ? 'img' : undefined}
      className={DIRECTIONAL.has(name) ? 'flip-rtl' : undefined} fill={filled ? 'currentColor' : 'none'} />
  );
}

/** Toggle chip with a visible selected state (fill + weight) and aria-pressed. */
export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" className="chip" aria-pressed={on} onClick={onClick}>{on && <Check size={16} strokeWidth={2.5} aria-hidden />}{children}</button>;
}
