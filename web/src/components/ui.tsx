import { useEffect, type ReactNode, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes } from 'react';
import { useI18n } from '../i18n/index.tsx';
import type { StringKey } from '../i18n/strings.ts';
import { ApiError } from '../api.ts';
import { todayISO, addDays } from '../../../shared/dates.ts';

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

export function Icon({ name }: { name: 'today' | 'training' | 'nutrition' | 'progress' | 'chat' | 'play' | 'check' | 'video' | 'timer' }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const paths: Record<string, ReactNode> = {
    today: <><circle cx="12" cy="12" r="4" {...p} /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" {...p} /></>,
    training: <path d="M6 7v10M18 7v10M3 9v6M21 9v6M6 12h12" {...p} />,
    nutrition: <><path d="M12 21c-4 0-7-3.5-7-8 0-3 2-5 4.5-5 1.2 0 1.9.5 2.5.5s1.3-.5 2.5-.5C17 8 19 10 19 13c0 4.5-3 8-7 8z" {...p} /><path d="M12 8c0-2 1-4 3-5" {...p} /></>,
    progress: <path d="M4 19h16M6 16l4-5 3 3 5-7" {...p} />,
    chat: <path d="M4 5h16v11H8l-4 4z" {...p} />,
    play: <path d="M8 5l11 7-11 7z" fill="currentColor" />,
    check: <path d="M5 12l5 5 9-10" {...p} strokeWidth={2.4} />,
    video: <><rect x="3" y="6" width="13" height="12" rx="2" {...p} /><path d="M16 10l5-3v10l-5-3" {...p} /></>,
    timer: <><circle cx="12" cy="13" r="8" {...p} /><path d="M12 9v4l2 2M9 2h6" {...p} /></>,
  };
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}
