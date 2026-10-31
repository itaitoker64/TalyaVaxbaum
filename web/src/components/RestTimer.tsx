import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/index.tsx';
import { formatDuration } from '../../../shared/pace.ts';

/** Rest timer based on an end timestamp, so it stays correct if the phone sleeps. */
export function RestTimer({ endsAt, onClose, onAdd }: { endsAt: number; onClose: () => void; onAdd: (sec: number) => void }) {
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
  return (
    <div className={'timer' + (done ? ' done' : '')} role="timer" aria-live="polite">
      <span className="small">{done ? t('training.restDone') : t('training.restTimer')}</span>
      <span className="t">{formatDuration(left)}</span>
      <span className="grow" />
      {!done && <button className="btn small" onClick={() => onAdd(15)}>+15</button>}
      <button className="btn small" onClick={onClose}>{t('common.close')}</button>
    </div>
  );
}
