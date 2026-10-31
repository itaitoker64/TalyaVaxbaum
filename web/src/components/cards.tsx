import { Link } from 'react-router';
import { useI18n } from '../i18n/index.tsx';
import { Cover } from './imagery.tsx';
import { Icon } from './ui.tsx';
import type { StringKey } from '../i18n/strings.ts';
import { STRINGS } from '../i18n/strings.ts';

/** Translates known level keys (beginner/intermediate/advanced); free text is shown as written. */
export function useLevelLabel() {
  const { t } = useI18n();
  return (level?: string | null) => {
    if (!level) return null;
    const key = ('level.' + level.toLowerCase()) as StringKey;
    return key in STRINGS ? t(key) : level;
  };
}

export interface WorkoutCardProps {
  to: string;
  title: string;
  category?: string | null;
  coverMediaId?: string | null;
  minutes?: number | null;
  level?: string | null;
  equipment?: string | null;
  status?: 'completed' | 'partial' | 'done-today' | null;
  hasVideo?: boolean;
  demo?: boolean;
}

/**
 * Image-led card with a fixed structure (image → title → duration · level · equipment → status)
 * so workouts and practices can be scanned and compared quickly.
 */
export function WorkoutCard({ to, title, category, coverMediaId, minutes, level, equipment, status, hasVideo, demo }: WorkoutCardProps) {
  const { t } = useI18n();
  const levelLabel = useLevelLabel();
  return (
    <Link to={to} className="wcard">
      <Cover category={category} mediaId={coverMediaId} />
      <span className="play" aria-hidden="true"><Icon name="play" size={18} filled /></span>
      <div className="wbody">
        <div className="wtitle">{title}</div>
        <div className="meta">
          {minutes ? <span><Icon name="clock" /><bdi>{minutes} {t('common.min')}</bdi></span> : null}
          {level && <span><Icon name="level" />{levelLabel(level)}</span>}
          {equipment ? <span><Icon name="equipment" />{equipment}</span> : category && <span>{t(('cat.' + category) as StringKey)}</span>}
        </div>
        <div className="row" style={{ gap: '0.35rem', marginTop: 'auto' }}>
          {status === 'completed' || status === 'done-today' ? (
            <span className="badge ok"><Icon name="check" />{status === 'done-today' ? t('practice.doneToday') : t('status.completed')}</span>
          ) : status === 'partial' ? <span className="badge"><Icon name="check" />{t('status.partial')}</span> : null}
          {hasVideo === false && <span className="badge"><Icon name="video" />{t('practice.videoSoon').split(' — ')[0]}</span>}
          {demo && <span className="badge demo">{t('common.demo')}</span>}
        </div>
      </div>
      <span className="sr-only">{t('practice.play')}</span>
    </Link>
  );
}
