import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { PracticeLibrary } from './Library.tsx';
import { useI18n } from '../i18n/index.tsx';
import { useAuth, useUser } from '../auth.tsx';
import { useApi, PUT } from '../api.ts';
import { Uploader } from '../components/media.tsx';
import { Async, StatusBadge, Seg, Empty, useDateLabel, N, TextArea, ErrorBox } from '../components/ui.tsx';
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
  const { me } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as 'week' | 'library' | 'history') || 'week';
  const setTab = (v: string) => setParams(v === 'week' ? {} : { tab: v }, { replace: true });
  return (
    <div>
      <h1>{t('tab.training')}</h1>
      <div style={{ marginBottom: '0.9rem' }}>
        <Seg value={tab} onChange={setTab} options={[{ value: 'week', label: t('training.schedule') }, { value: 'library', label: t('training.library') }, { value: 'history', label: t('training.history') }]} />
      </div>
      {tab === 'week' && me?.track === 'B' && <ExistingProgramCard />}
      {tab === 'week' && <ScheduleWeek clientId={user.id} linkFor={(s) => (s.log_id && s.log_status !== 'draft' ? `/training/log/${s.log_id}` : `/training/session/${s.id}`)} />}
      {tab === 'library' && <PracticeLibrary />}
      {tab === 'history' && <LogHistory clientId={user.id} linkBase="/training/log/" />}
    </div>
  );
}

/** Track B: the client shares the strength program they already follow. */
function ExistingProgramCard() {
  const { t, fmtDate } = useI18n();
  const user = useUser();
  const q = useApi<any>(`/clients/${user.id}`);
  const [text, setText] = useState<string | null>(null);
  const [files, setFiles] = useState<string[] | null>(null);
  const [msg, setMsg] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const ep = q.data?.existingProgram;
  // Open by default until something is shared; afterwards the user's own toggle wins.
  const [open, setOpen] = useState<boolean | null>(null);
  const isOpen = open ?? !ep;
  const curText = text ?? ep?.text ?? '';
  const curFiles = files ?? ep?.mediaIds ?? [];
  return (
    <details className="card" open={isOpen} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="row between" style={{ cursor: 'pointer' }}>
        <h3 style={{ margin: 0 }}>{t('trackB.title')}</h3>
        {ep?.updatedAt && <span className="tiny muted">{t('trackB.updated', { date: fmtDate(ep.updatedAt) })}</span>}
      </summary>
      <div className="stack" style={{ marginTop: '0.6rem' }}>
        <p className="small muted" style={{ margin: 0 }}>{t('trackB.intro')}</p>
        <TextArea aria-label={t('trackB.text')} placeholder={t('trackB.text')} value={curText} onChange={(e) => { setText(e.target.value); setMsg(false); }} style={{ minHeight: '8rem' }} />
        <div className="row">
          {curFiles.map((id: string, i: number) => (
            <span key={id} className="badge ok">📎 {i + 1}<button className="btn ghost small" style={{ minHeight: 0, padding: 0 }} aria-label={t('common.delete')} onClick={() => setFiles(curFiles.filter((x: string) => x !== id))}>✕</button></span>
          ))}
          <Uploader createPath={`/clients/${user.id}/media`} meta={{ kind: 'other', title: t('trackB.title') }} accept="image/*,application/pdf" label={t('trackB.files')} onDone={(id) => setFiles([...curFiles, id])} />
        </div>
        {!!err && <ErrorBox error={err} />}
        {msg && <div className="alert ok">{t('trackB.saved')}</div>}
        <button className="btn primary" disabled={!curText.trim() && !curFiles.length} onClick={async () => {
          try { await PUT(`/clients/${user.id}/existing-program`, { text: curText, mediaIds: curFiles }); setOpen(true); setMsg(true); q.reload(); } catch (e) { setErr(e); }
        }}>{t('common.save')}</button>
        <p className="tiny muted" style={{ margin: 0 }}>{t('trackB.later')}</p>
      </div>
    </details>
  );
}
