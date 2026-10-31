import { Link } from 'react-router';
import { useI18n } from '../i18n/index.tsx';
import { useApi } from '../api.ts';
import { Async, Empty, useDateLabel, StatusBadge } from '../components/ui.tsx';
import type { StringKey } from '../i18n/strings.ts';

/** Everything that needs a coach decision, computed from the underlying records. */
export function Attention() {
  const { t } = useI18n();
  const dateLabel = useDateLabel();
  const q = useApi<any[]>('/coach/attention');
  const link = (i: any) => {
    switch (i.type) {
      case 'workout': return `/coach/logs/${i.id}`;
      case 'checkin': return `/coach/clients/${i.clientId}/checkins`;
      case 'video': return `/coach/clients/${i.clientId}/videos`;
      case 'message': return `/coach/clients/${i.clientId}/messages`;
      case 'goal_review': return `/coach/goals/${i.id}`;
      case 'missed': return `/coach/clients/${i.clientId}/schedule`;
      default: return `/coach/clients/${i.clientId}/program`;
    }
  };
  return (
    <div>
      <h1>{t('coach.attention')}</h1>
      <Async q={q}>
        {(items) => items.length === 0 ? <Empty>{t('coach.allClear')}</Empty> : (
          <div className="card">
            <ul className="list">
              {items.map((i) => (
                <li key={i.type + i.id}>
                  <Link className="listlink" to={link(i)}>
                    <div className="grow">
                      <div><strong>{i.clientName}</strong> · {t(('att.' + i.type) as StringKey, { n: i.detail.count ?? '' })}</div>
                      <div className="small muted">
                        {i.detail.title}{i.detail.weekStart ? dateLabel(i.detail.weekStart) : ''}
                        {i.detail.hasNotes ? ` · ${t('att.hasNotes')}` : ''}
                        {' · '}{dateLabel(String(i.date).slice(0, 10))}
                      </div>
                    </div>
                    {i.detail.status && <StatusBadge status={i.detail.status} />}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Async>
    </div>
  );
}
