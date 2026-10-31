import { useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router';
import { useI18n } from '../i18n/index.tsx';
import { useUser } from '../auth.tsx';
import { useApi, POST } from '../api.ts';
import { Async, StatusBadge, TextArea, ErrorBox, useDateLabel, N, Parts, Icon } from '../components/ui.tsx';
import { MediaPlayer } from '../components/media.tsx';
import { prescriptionParts, actualParts } from './format.ts';

/** Prescribed vs actual, side by side. Used by clients (history) and the coach (review). */
export function LogView() {
  const { lid } = useParams();
  const q = useApi<any>(`/logs/${lid}`);
  return <Async q={q}>{(d) => <LogInner d={d} reload={q.reload} />}</Async>;
}

function LogInner({ d, reload }: { d: any; reload: () => void }) {
  const { t } = useI18n();
  const user = useUser();
  const dateLabel = useDateLabel();
  const [params] = useSearchParams();
  const [fb, setFb] = useState('');
  const [err, setErr] = useState<unknown>(null);
  const isCoach = user.role === 'coach';
  const items = new Map<string, any>(d.items.map((i: any) => [i.id, i]));
  const loggedItems = new Set(d.entries.map((e: any) => e.program_item_id));
  const notLogged = d.items.filter((i: any) => !loggedItems.has(i.id));

  const review = async () => {
    try {
      await POST(`/logs/${d.log.id}/review`, { feedback: fb });
      setFb('');
      reload();
    } catch (e) {
      setErr(e);
    }
  };

  return (
    <div>
      {params.get('done') && <div className="alert ok">{d.log.status === 'completed' ? t('today.done') : t('today.partial')}</div>}
      {!isCoach && d.log.status !== 'skipped' && d.log.status !== 'draft' && (
        <Link className="btn accent big" style={{ marginBottom: '1rem' }} to={`/training/log/${d.log.id}/share`}><Icon name="share" /> {t('share.open')}</Link>
      )}
      <div className="row between" style={{ marginBottom: '0.5rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>{d.log.title}</h1>
          <div className="small muted">{dateLabel(d.log.date)}{d.log.session_rpe ? <> · RPE <N>{d.log.session_rpe}</N></> : null}</div>
        </div>
        <StatusBadge status={d.log.status} />
      </div>
      {d.log.notes && <div className="card soft pre">{d.log.notes}</div>}

      <div className="card">
        <table className="table">
          <thead>
            <tr><th>{t('lib.exercises')}</th><th>{t('training.prescribed')}</th><th>{t('training.actual')}</th></tr>
          </thead>
          <tbody>
            {d.entries.map((e: any) => {
              const it = e.program_item_id ? items.get(e.program_item_id) : null;
              return (
                <tr key={e.id}>
                  <td>
                    <div className="bold">{e.exercise_name}</div>
                    {e.substituted_for_id && it && <div className="tiny muted">{t('training.swapped', { name: it.exercise_name })}</div>}
                    {e.notes && <div className="tiny pre">💬 {e.notes}</div>}
                  </td>
                  <td className="small">{it ? <Parts parts={prescriptionParts(it.prescription, it.log_type, t)} /> : '–'}</td>
                  <td className="small">{actualParts(e.data, e.log_type, t).length ? <Parts parts={actualParts(e.data, e.log_type, t)} sep=", " /> : '–'}</td>
                </tr>
              );
            })}
            {notLogged.map((i: any) => (
              <tr key={i.id}><td>{i.exercise_name}</td><td className="small"><Parts parts={prescriptionParts(i.prescription, i.log_type, t)} /></td><td className="muted small">–</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      {d.media.length > 0 && (
        <div className="card">
          <h3>{t('lib.videos')}</h3>
          <div className="grid2">{d.media.map((m: any) => <div key={m.id}><div className="small">{m.title}</div>{m.status === 'ready' ? <MediaPlayer media={m} /> : <span className="badge warn">{t('lib.statusFailed')}</span>}</div>)}</div>
        </div>
      )}

      <div className="card">
        <h3>{t('training.feedback')}</h3>
        {d.feedback.length === 0 && <p className="muted small">{t('common.none')}</p>}
        <div className="chatlist">
          {d.feedback.map((m: any) => <div key={m.id} className={'bubble' + (m.sender_id === user.id ? ' mine' : '')}>{m.body}<div className="tiny muted">{m.sender_name} · {dateLabel(m.created_at.slice(0, 10))}</div></div>)}
        </div>
        {isCoach && (
          <div className="stack" style={{ marginTop: '0.75rem' }}>
            <TextArea value={fb} onChange={(e) => setFb(e.target.value)} placeholder={t('client.feedbackPlaceholder')} />
            {!!err && <ErrorBox error={err} />}
            <div className="row">
              <button className="btn primary" onClick={review}>{fb.trim() ? t('client.reviewWithFeedback') : t('client.review')}</button>
              {d.log.coach_reviewed_at && <span className="badge ok">{t('client.reviewed')}</span>}
              <Link className="btn ghost small" to={`/coach/clients/${d.log.client_id}/schedule`}>{t('common.back')}</Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
