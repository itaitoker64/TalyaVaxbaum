import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/index.tsx';
import { formatDuration } from '../../../shared/pace.ts';
import { Icon } from './ui.tsx';

/** Rest timer based on an end timestamp, so it stays correct if the phone sleeps. */
export function RestTimer({ endsAt, total, onClose, onAdd }: { endsAt: number; total: number; onClose: () => void; onAdd: (sec: number) => void }) {
  const { t } = useI18n();
  const [nowMs, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(i);
  }, []);
  const left = Math.max(0, Math.round((endsAt - nowMs) / 1000));
  const done = left === 0;
  useEffect(() => {
    if (done && 'vibrate' in navigator) navigator.vibrate?.([200, 100, 200]);
  }, [done]);
  const r = 26;
  const c = 2 * Math.PI * r;
  const frac = total > 0 ? left / total : 0;
  return (
    <div className={'timer' + (done ? ' done' : '')} role="timer" aria-live={done ? 'assertive' : 'off'} aria-label={done ? t('training.restDone') : t('training.restTimer')}>
      <svg className="ring" viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="6" />
        <circle cx="32" cy="32" r={r} fill="none" stroke="#a6d86e" strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} transform="rotate(-90 32 32)" />
      </svg>
      <div className="grow">
        <div className="tiny" style={{ opacity: 0.85 }}>{done ? t('training.restDone') : t('training.restTimer')}</div>
        <div className="t">{formatDuration(left)}</div>
      </div>
      {!done && <button className="btn small" onClick={() => onAdd(15)} aria-label="+15"><bdi>+15</bdi></button>}
      <button className="btn small" onClick={onClose}>{done ? t('common.close') : <><Icon name="close" size={16} />{t('common.close')}</>}</button>
    </div>
  );
}
