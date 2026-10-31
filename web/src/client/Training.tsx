import { useState } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../i18n/index.tsx';
import { useAuth, useUser } from '../auth.tsx';
import { useApi } from '../api.ts';
import { Async, StatusBadge, Seg, Empty, useDateLabel, N } from '../components/ui.tsx';
import { todayISO, weekStart, addDays, weekDates, dayOfWeek } from '../../../shared/dates.ts';
import type { StringKey } from '../i18n/strings.ts';

export function ScheduleWeek({ clientId, linkFor }: { clientId: string; linkFor: (s: any) => string }) {
  const { t, dir } = useI18n();
  const { me } = useAuth();
  const dateLabel = useDateLabel();
  const [ws, setWs] = useState(() => weekStart(todayISO(), me?.weekStartDay ?? 0));
  const q = useApi<any[]>(`/clients/${clientId}/schedule?from=${ws}&to=${addDays(ws, 6)}`);
  const today = todayISO();
  return (
    <div>
      <div className="row between nowrap card soft" style={{ padding: '0.4rem' }}>
        <button className="iconbtn" aria-label={t('training.prevWeek')} onClick={() => setWs(addDays(ws, -7))}>{dir === 'rtl' ? '›' : '‹'}</button>
        <strong>{dateLabel(ws)} – {dateLabel(addDays(ws, 6))}</strong>
        <button className="iconbtn" aria-label={t('training.nextWeek')} onClick={() => setWs(addDays(ws, 7))}>{dir === 'rtl' ? '‹' : '›'}</button>
      </div>
      <Async q={q}>
        {(sessions) =>
          sessions.length === 0 ? (
            <Empty>{t('training.noSessions')}</Empty>
          ) : (
            <div className="card">
              <ul className="list">
                {weekDates(ws).map((d) => {
                  const day = sessions.filter((s) => s.date === d);
                  if (!day.length) return null;
                  return day.map((s) => {
                    const missed = s.status === 'planned' && d < today && !s.log_id;
                    return (
                      <li key={s.id}>
                        <Link className="listlink" to={linkFor(s)}>
                          <div style={{ width: 64 }} className={'small ' + (d === today ? 'bold' : 'muted')}>
                            {t(('day.' + dayOfWeek(d)) as StringKey)}<div className="num tiny">{d.slice(8)}/{d.slice(5, 7)}</div>
                          </div>
                          <div className="grow">
                            <div style={{ textDecoration: s.status === 'rescheduled' ? 'line-through' : undefined }}>{s.title}</div>
                            <div className="tiny muted">
                              {s.category && t(('cat.' + s.category) as StringKey)}
                              {s.est_minutes ? <> · <N>{s.est_minutes}</N> {t('common.min')}</> : null}
                              {s.status === 'rescheduled' && s.moved_to_date && <> · → {dateLabel(s.moved_to_date)}</>}
                            </div>
                          </div>
                          {s.log_status === 'draft' ? <StatusBadge status="draft" /> : missed ? <StatusBadge status="missed" /> : s.status !== 'planned' ? <StatusBadge status={s.status} /> : null}
                        </Link>
                      </li>
                    );
                  });
                })}
              </ul>
            </div>
          )
        }
      </Async>
    </div>
  );
}

export function LogHistory({ clientId, linkBase }: { clientId: string; linkBase: string }) {
  const { t } = useI18n();
  const dateLabel = useDateLabel();
  const q = useApi<any[]>(`/clients/${clientId}/logs?limit=60`);
  return (
    <Async q={q}>
      {(logs) =>
        logs.length === 0 ? <Empty>{t('common.none')}</Empty> : (
          <div className="card">
            <ul className="list">
              {logs.map((l) => (
                <li key={l.id}>
                  <Link className="listlink" to={linkBase + l.id}>
                    <div className="grow">
                      <div>{l.title}</div>
                      <div className="tiny muted">{dateLabel(l.date)}{l.session_rpe ? <> · RPE <N>{l.session_rpe}</N></> : null}{l.notes ? ' · 💬' : ''}</div>
                    </div>
                    {l.feedback_count > 0 && <span className="badge ok">{t('training.feedback')}</span>}
                    <StatusBadge status={l.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )
      }
    </Async>
  );
}

export function Training() {
  const { t } = useI18n();
  const user = useUser();
  const [tab, setTab] = useState<'week' | 'history'>('week');
  return (
    <div>
      <div className="row between" style={{ marginBottom: '0.75rem' }}>
        <h1 style={{ margin: 0 }}>{t('tab.training')}</h1>
        <Seg value={tab} onChange={setTab} options={[{ value: 'week', label: t('training.schedule') }, { value: 'history', label: t('training.history') }]} />
      </div>
      {tab === 'week' ? <ScheduleWeek clientId={user.id} linkFor={(s) => (s.log_id && s.log_status !== 'draft' ? `/training/log/${s.log_id}` : `/training/session/${s.id}`)} /> : <LogHistory clientId={user.id} linkBase="/training/log/" />}
    </div>
  );
}
