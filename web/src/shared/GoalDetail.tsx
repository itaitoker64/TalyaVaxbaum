import { useState } from 'react';
import { useParams } from 'react-router';
import { useI18n } from '../i18n/index.tsx';
import { useUser } from '../auth.tsx';
import { useApi, POST } from '../api.ts';
import { Async, Field, Input, NumInput, TextArea, ErrorBox, Modal, Select, useDateLabel, N, Icon } from '../components/ui.tsx';
import { GoalChart, AdherenceBars } from '../components/charts.tsx';
import { MediaPlayer, Uploader } from '../components/media.tsx';
import { GoalForm } from '../coach/GoalForm.tsx';
import { targetStatus, changeFromBaseline, latestMeasurement } from '../../../shared/goals.ts';
import { todayISO, daysBetween } from '../../../shared/dates.ts';
import type { StringKey } from '../i18n/strings.ts';

export function GoalDetail() {
  const { gid } = useParams();
  const q = useApi<any>(`/goals/${gid}?today=${todayISO()}`);
  return <Async q={q}>{(d) => <Inner d={d} reload={q.reload} />}</Async>;
}

function sameConditions(a: any, b: any) {
  const keys = ['exerciseId', 'variant', 'load', 'loadUnit', 'side'];
  return keys.every((k) => (a?.[k] ?? null) === (b?.[k] ?? null));
}

function Inner({ d, reload }: { d: any; reload: () => void }) {
  const { t, fmtNum } = useI18n();
  const user = useUser();
  const dateLabel = useDateLabel();
  const g = d.goal;
  const isCoach = user.role === 'coach';
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [compare, setCompare] = useState<[string, string] | null>(null);
  const [reviewFor, setReviewFor] = useState<string | null | undefined>(undefined);
  const valid = d.measurements.filter((m: any) => !m.voided_at);
  const points = valid.map((m: any) => ({
    id: m.id, date: m.measured_on, value: m.value, methodVersion: m.method_version, notes: m.notes, hasMedia: !!m.media_id,
    conditionsDiffer: !!g.conditions && !sameConditions(m.conditions, g.conditions), isBaseline: m.is_baseline,
  }));
  const latest = latestMeasurement(points);
  const target = { direction: g.direction, baselineValue: g.baseline_value, targetValue: g.target_value, targetMin: g.target_min, targetMax: g.target_max };
  const st = targetStatus(target, latest?.value);
  const delta = changeFromBaseline(target, latest?.value ?? null);
  const withMedia = valid.filter((m: any) => m.media_id && m.media_status === 'ready');
  const canRecord = g.kind !== 'adherence' && (isCoach || g.client_can_record);

  const daysSinceLast = latest ? daysBetween(latest.date, todayISO()) : null;
  const firstMedia = withMedia[0];
  const lastMedia = withMedia[withMedia.length - 1];
  return (
    <div>
      <div className="row between nowrap">
        <div className="grow">
          <div className="eyebrow"><Icon name="target" size={16} /> {t(('kind.' + g.kind) as StringKey)}{g.kind !== 'quality' && g.kind !== 'adherence' && g.direction ? ` · ${t(('dir.' + g.direction) as StringKey)}` : ''}</div>
          <h1 style={{ margin: 0 }}>{g.title}</h1>
        </div>
        {isCoach && <button className="iconbtn" onClick={() => setEditing(true)} aria-label={t('common.edit')}><Icon name="edit" size={18} /></button>}
      </div>
      {(g.metric || g.unit) && <div className="small muted" style={{ marginTop: 4 }}>{t('progress.metricLine', { m: g.metric ?? '–', u: g.unit ?? '–' })}</div>}
      <div className="row small muted" style={{ margin: '4px 0 12px' }}>
        {g.review_date && <span>{t('progress.reviewDate')}: {dateLabel(g.review_date)}</span>}
        {g.method_version > 1 && <span className="badge warn">{t('progress.methodV', { v: g.method_version })}</span>}
      </div>
      {g.description && <p>{g.description}</p>}

      {g.kind === 'adherence' ? (
        <div className="card">
          <div className="small muted">{t('progress.calculated')}</div>
          <AdherenceBars weeks={d.adherence ?? []} target={g.target_value} />
        </div>
      ) : g.kind === 'quality' ? (
        <div className="card sage small"><strong>{t('progress.qualityTitle')}</strong><div>{t('progress.qualityNote')}</div>{g.criteria?.length ? <ul style={{ margin: '0.4rem 0 0' }}>{g.criteria.map((c: string) => <li key={c}>{c}</li>)}</ul> : null}</div>
      ) : (
        <>
          <div className="statgrid" style={{ marginBottom: '0.9rem' }}>
            <div className="stat"><div className="label">{t('progress.baseline')}</div><div className="value"><bdi>{fmtNum(g.baseline_value)}</bdi></div><div className="tiny muted">{g.unit} · {g.baseline_date ? dateLabel(g.baseline_date) : '–'}</div></div>
            <div className="stat hl"><div className="label">{t('progress.latest')}</div><div className="value"><bdi>{latest ? fmtNum(latest.value) : '–'}</bdi></div><div className="tiny muted">{latest ? `${g.unit ?? ''} · ${dateLabel(latest.date)}` : t('progress.noData')}</div></div>
            <div className="stat"><div className="label">{g.direction === 'range' ? t('progress.targetRange') : t('progress.target')}</div><div className="value"><bdi>{g.direction === 'range' ? `${fmtNum(g.target_min)}–${fmtNum(g.target_max)}` : fmtNum(g.target_value)}</bdi></div><div className="tiny muted">{g.unit}</div></div>
          </div>
          <div className="row" style={{ marginBottom: '0.6rem' }}>
            {st !== 'no_data' && <span className={'badge ' + (st === 'reached' ? 'ok' : '')}>{st === 'reached' ? <><Icon name="check" />{t('progress.reached')}</> : <><Icon name="progress" />{t('progress.notReached')}</>}</span>}
            {delta != null && <span className="badge"><bdi>{t('progress.fromBaseline', { v: (delta > 0 ? '+' : '') + fmtNum(delta) })}</bdi></span>}
            {daysSinceLast != null && daysSinceLast > 21 && <span className="badge warn">{t('progress.sinceLast', { date: dateLabel(latest!.date) })}</span>}
          </div>
          <div className="card">
            <GoalChart points={points} baseline={g.baseline_value} target={g.direction !== 'range' ? g.target_value : null} targetMin={g.target_min} targetMax={g.target_max} unit={g.unit} selectedId={selected} onSelect={setSelected} />
          </div>
        </>
      )}

      {withMedia.length >= 2 && (
        <div className="card">
          <div className="card-title"><h3><Icon name="video" size={18} /> {t('progress.compare')}</h3><button className="btn small ghost" onClick={() => setCompare([firstMedia.id, lastMedia.id])}>{t('common.edit')}</button></div>
          <div className="compare">
            {[firstMedia, lastMedia].map((m: any) => (
              <div key={m.id} className="stack">
                <MediaPlayer media={{ id: m.media_id, title: m.media_title, mime: m.media_mime }} />
                <div className="small"><bdi className="bold">{dateLabel(m.measured_on)}</bdi>{m.value != null && <> · <bdi>{fmtNum(m.value)} {g.unit}</bdi></>}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(g.procedure || g.conditions) && (
        <div className="card soft small">
          {g.procedure && <p><strong>{t('progress.procedure')}:</strong> <span className="pre">{g.procedure}</span></p>}
          {g.conditions && (
            <p><strong>{t('progress.conditions')}:</strong> {[g.conditions.exerciseName, g.conditions.variant, g.conditions.load != null && `${g.conditions.load} ${g.conditions.loadUnit ?? 'kg'}`, g.conditions.side].filter(Boolean).join(' · ')}</p>
          )}
        </div>
      )}

      {canRecord && <button className="btn primary big" onClick={() => setAdding(true)} style={{ marginBottom: '0.9rem' }}><Icon name="plus" /> {t('progress.addMeasurement')}</button>}

      {g.kind !== 'adherence' && (
        <div className="card">
          <h3>{t('progress.history')}</h3>
          <ul className="list">
            {[...d.measurements].reverse().map((m: any) => (
              <li key={m.id} style={{ opacity: m.voided_at ? 0.55 : 1, background: selected === m.id ? 'var(--sage-soft)' : undefined }}>
                <div className="row between nowrap">
                  <div className="grow">
                    <div>
                      <span className="bold num" style={{ textDecoration: m.voided_at ? 'line-through' : undefined }}>{m.value != null ? `${fmtNum(m.value)} ${g.unit ?? ''}` : '—'}</span>
                      <span className="small muted"> · {dateLabel(m.measured_on)}</span>
                      {m.is_baseline && <span className="badge" style={{ marginInlineStart: 6 }}>{t('progress.baseline')}</span>}
                      {m.method_version !== g.method_version && <span className="badge warn" style={{ marginInlineStart: 6 }}>{t('progress.methodV', { v: m.method_version })}</span>}
                      {g.conditions && !sameConditions(m.conditions, g.conditions) && <span className="badge" style={{ marginInlineStart: 6 }}>{t('progress.differentConditions')}</span>}
                    </div>
                    {m.notes && <div className="small pre">{m.notes}</div>}
                    <div className="tiny muted">{m.recorded_by_name}</div>
                    {m.voided_at && <div className="tiny">{t('progress.voided', { reason: m.void_reason })}</div>}
                    {d.reviews.filter((r: any) => r.measurement_id === m.id).map((r: any) => <Review key={r.id} r={r} />)}
                  </div>
                  {m.media_id && m.media_status === 'ready' && <MediaThumb id={m.media_id} title={m.media_title} mime={m.media_mime} />}
                </div>
                {!m.voided_at && !m.is_baseline && (isCoach || m.recorded_by === user.id) && (
                  <div className="row" style={{ marginTop: 4 }}>
                    <VoidButton id={m.id} onDone={reload} />
                    {isCoach && g.kind === 'quality' && <button className="btn small" onClick={() => setReviewFor(m.id)}>{t('goal.review')}</button>}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {d.reviews.filter((r: any) => !r.measurement_id).map((r: any) => <Review key={r.id} r={r} />)}
          {isCoach && g.kind === 'quality' && <button className="btn small" onClick={() => setReviewFor(null)}>{t('goal.review')}</button>}
        </div>
      )}

      {d.revisions.length > 0 && (
        <details className="card">
          <summary className="bold">{t('progress.revisions')} ({d.revisions.length})</summary>
          <ul className="list small">
            {d.revisions.map((r: any) => (
              <li key={r.id}>
                <div className="muted tiny">{dateLabel(r.revised_at.slice(0, 10))} · {r.revised_by_name}{r.method_changed ? ` · ${t('progress.methodChanged')}` : ''}</div>
                {Object.keys(r.after).map((k) => <div key={k}><span className="muted">{k}:</span> <s>{String(r.before[k] ?? '–')}</s> → {String(r.after[k] ?? '–')}</div>)}
                {r.reason && <div className="tiny">{r.reason}</div>}
              </li>
            ))}
          </ul>
        </details>
      )}

      {adding && <AddMeasurement goal={g} onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload(); }} />}
      {editing && <GoalForm clientId={g.client_id} goal={g} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); }} />}
      {reviewFor !== undefined && <QualityReview goal={g} measurementId={reviewFor} onClose={() => setReviewFor(undefined)} onDone={() => { setReviewFor(undefined); reload(); }} />}
      {compare && (
        <Modal title={t('progress.compare')} onClose={() => setCompare(null)}>
          <div className="compare">
            {compare.map((id, i) => {
              const m = withMedia.find((x: any) => x.id === id);
              return (
                <div key={i} className="stack">
                  <Select value={id} onChange={(e) => setCompare(i === 0 ? [e.target.value, compare[1]] : [compare[0], e.target.value])}>
                    {withMedia.map((x: any) => <option key={x.id} value={x.id}>{dateLabel(x.measured_on)}</option>)}
                  </Select>
                  {m && <MediaPlayer media={{ id: m.media_id, title: m.media_title, mime: m.media_mime }} />}
                  {m?.notes && <div className="tiny">{m.notes}</div>}
                </div>
              );
            })}
          </div>
        </Modal>
      )}
    </div>
  );
}

function Review({ r }: { r: any }) {
  const { t } = useI18n();
  return (
    <div className="card sage small" style={{ marginTop: 6 }}>
      {r.ratings.map((x: any) => <div key={x.criterion}>{x.criterion}: <strong>{t(('progress.rating.' + x.rating) as StringKey)}</strong>{x.comment ? ` — ${x.comment}` : ''}</div>)}
      {r.summary && <p className="pre" style={{ marginTop: 4 }}>{r.summary}</p>}
      <div className="tiny muted">{r.coach_name}</div>
    </div>
  );
}

function MediaThumb({ id, title, mime }: { id: string; title: string; mime: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn small" onClick={() => setOpen(true)}>{mime?.startsWith('image/') ? '🖼' : '▶'}</button>
      {open && <Modal title={title} onClose={() => setOpen(false)}><MediaPlayer media={{ id, title, mime }} /></Modal>}
    </>
  );
}

function VoidButton({ id, onDone }: { id: string; onDone: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  if (!open) return <button className="btn small ghost" onClick={() => setOpen(true)}>{t('progress.void')}</button>;
  return (
    <div className="row">
      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('progress.voidReason')} style={{ width: 200 }} />
      <button className="btn small danger" disabled={!reason} onClick={async () => { await POST(`/measurements/${id}/void`, { reason }); onDone(); }}>{t('progress.void')}</button>
    </div>
  );
}

function AddMeasurement({ goal, onClose, onDone }: { goal: any; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const [value, setValue] = useState<number | null>(null);
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const quality = goal.kind === 'quality';
  return (
    <Modal title={t('progress.addMeasurement')} onClose={onClose}>
      <div className="stack">
        {goal.procedure && <div className="card soft small"><strong>{t('progress.procedure')}:</strong> <span className="pre">{goal.procedure}</span></div>}
        {!quality && <Field label={`${t('progress.value')}${goal.unit ? ` (${goal.unit})` : ''}`}><NumInput value={value} onChange={setValue} /></Field>}
        <Field label={t('common.date')}><Input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label={t('common.notes')}><TextArea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        {mediaId ? <span className="badge ok">{t('lib.uploaded')}</span> : (
          <Uploader createPath={`/clients/${goal.client_id}/media`} meta={{ kind: 'progress', title: goal.title, context: { goalId: goal.id } }} label={t('progress.attachMedia')} onDone={setMediaId} />
        )}
        {!!err && <ErrorBox error={err} />}
        <button className="btn primary big" disabled={!quality && value == null} onClick={async () => {
          try {
            await POST(`/goals/${goal.id}/measurements`, { value: quality ? null : value, measured_on: date, notes: notes || null, media_id: mediaId });
            onDone();
          } catch (e) { setErr(e); }
        }}>{t('common.save')}</button>
      </div>
    </Modal>
  );
}

function QualityReview({ goal, measurementId, onClose, onDone }: { goal: any; measurementId: string | null; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const [ratings, setRatings] = useState<Record<string, { rating: string; comment: string }>>({});
  const [summary, setSummary] = useState('');
  const [err, setErr] = useState<unknown>(null);
  const criteria: string[] = goal.criteria ?? [];
  return (
    <Modal title={t('goal.review')} onClose={onClose}>
      <div className="stack">
        {criteria.map((c) => (
          <div key={c} className="card soft">
            <div className="bold small">{c}</div>
            <div className="seg" style={{ margin: '6px 0' }}>
              {(['not_yet', 'developing', 'consistent'] as const).map((r) => (
                <button key={r} type="button" className={ratings[c]?.rating === r ? 'on' : ''} onClick={() => setRatings({ ...ratings, [c]: { rating: r, comment: ratings[c]?.comment ?? '' } })}>{t(('progress.rating.' + r) as StringKey)}</button>
              ))}
            </div>
            <Input placeholder={t('common.notes')} value={ratings[c]?.comment ?? ''} onChange={(e) => setRatings({ ...ratings, [c]: { rating: ratings[c]?.rating ?? 'developing', comment: e.target.value } })} />
          </div>
        ))}
        <Field label={t('goal.summary')}><TextArea value={summary} onChange={(e) => setSummary(e.target.value)} /></Field>
        {!!err && <ErrorBox error={err} />}
        <button className="btn primary big" onClick={async () => {
          try {
            await POST(`/goals/${goal.id}/reviews`, { measurement_id: measurementId, ratings: Object.entries(ratings).map(([criterion, v]) => ({ criterion, rating: v.rating, comment: v.comment || undefined })), summary: summary || undefined });
            onDone();
          } catch (e) { setErr(e); }
        }}>{t('common.save')}</button>
        <div className="tiny muted"><N>{criteria.length}</N> {t('progress.criteria')}</div>
      </div>
    </Modal>
  );
}
