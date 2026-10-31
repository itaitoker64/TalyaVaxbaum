import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/index.tsx';
import { useAuth, useUser } from '../auth.tsx';
import { useApi, PUT, POST } from '../api.ts';
import { Async, Field, TextArea, ErrorBox, Empty, useDateLabel, N } from '../components/ui.tsx';
import { todayISO, weekStart } from '../../../shared/dates.ts';
import type { StringKey } from '../i18n/strings.ts';

const SCALES = ['energy', 'sleep', 'stress', 'soreness', 'enjoyment'] as const;
const TEXTS = ['wins', 'struggles', 'questions', 'bodyNotes'] as const;

export function CheckinScreen() {
  const { t } = useI18n();
  const user = useUser();
  const { me } = useAuth();
  const ws = weekStart(todayISO(), me?.weekStartDay ?? 0);
  const list = useApi<any[]>(`/clients/${user.id}/checkins`);
  const [a, setA] = useState<Record<string, any>>({});
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const dateLabel = useDateLabel();
  useEffect(() => {
    const cur = list.data?.find((c) => c.week_start === ws);
    if (cur) setA(cur.answers);
  }, [list.data, ws]);
  return (
    <div>
      <header className="page-intro"><h1>{t('checkin.title')}</h1></header>
      <p className="muted">{t('checkin.week', { date: dateLabel(ws) })}</p>
      <div className="card stack">
        <div className="tiny muted">{t('checkin.scale')}</div>
        {SCALES.map((k) => (
          <div key={k} className="checkin-scale">
            <span>{t(('checkin.' + k) as StringKey)}</span>
            <div className="seg">
              {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" aria-label={`${t(('checkin.' + k) as StringKey)}: ${n}`} aria-pressed={a[k] === n} className={a[k] === n ? 'on' : ''} onClick={() => setA({ ...a, [k]: n })}><span className="num">{n}</span></button>)}
            </div>
          </div>
        ))}
        {TEXTS.map((k) => <Field key={k} label={t(('checkin.' + k) as StringKey)}><TextArea value={a[k] ?? ''} onChange={(e) => setA({ ...a, [k]: e.target.value })} /></Field>)}
        {!!err && <ErrorBox error={err} />}
        {done && <div className="alert ok">{t('checkin.submitted')}</div>}
        <button className="btn primary big" onClick={async () => { try { await PUT(`/clients/${user.id}/checkins/${ws}`, a); setDone(true); list.reload(); } catch (e) { setErr(e); } }}>{t('checkin.submit')}</button>
      </div>
    </div>
  );
}

/** Check-ins with their feedback. Coaches get a reply box that marks the check-in reviewed. */
export function CheckinList({ clientId }: { clientId: string }) {
  const { t } = useI18n();
  const user = useUser();
  const dateLabel = useDateLabel();
  const q = useApi<any[]>(`/clients/${clientId}/checkins`);
  const [reply, setReply] = useState<Record<string, string>>({});
  return (
    <Async q={q}>
      {(list) => list.length === 0 ? <Empty>{t('common.none')}</Empty> : (
        <div>
          {list.map((c) => (
            <div key={c.id} className="card">
              <div className="row between">
                <strong>{t('checkin.week', { date: dateLabel(c.week_start) })}</strong>
                {c.coach_reviewed_at ? <span className="badge ok">{t('client.reviewed')}</span> : user.role === 'coach' ? <span className="badge warn">{t('att.checkin')}</span> : null}
              </div>
              <div className="row small" style={{ margin: '6px 0' }}>
                {SCALES.filter((k) => c.answers[k]).map((k) => <span key={k} className="badge">{t(('checkin.' + k) as StringKey)} <N>{c.answers[k]}/5</N></span>)}
              </div>
              {TEXTS.filter((k) => c.answers[k]).map((k) => <div key={k} className="small"><span className="muted">{t(('checkin.' + k) as StringKey)}</span><p className="pre">{c.answers[k]}</p></div>)}
              {c.feedback.map((f: any) => <div key={f.id} className="bubble mine" style={{ maxWidth: '100%' }}>{f.body}<div className="tiny muted">{f.sender_name}</div></div>)}
              {user.role === 'coach' && (
                <div className="stack" style={{ marginTop: 8 }}>
                  <TextArea value={reply[c.id] ?? ''} onChange={(e) => setReply({ ...reply, [c.id]: e.target.value })} placeholder={t('client.feedbackPlaceholder')} />
                  <button className="btn primary small" onClick={async () => { await POST(`/checkins/${c.id}/review`, { feedback: reply[c.id] }); setReply({ ...reply, [c.id]: '' }); q.reload(); }}>
                    {reply[c.id]?.trim() ? t('client.reviewWithFeedback') : t('client.review')}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Async>
  );
}
