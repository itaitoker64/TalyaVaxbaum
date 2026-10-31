import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router';
import { useI18n } from '../i18n/index.tsx';
import { useUser } from '../auth.tsx';
import { useApi, POST, PUT, ApiError } from '../api.ts';
import { Async, NumInput, Modal, Field, TextArea, Input, StatusBadge, Seg, ErrorBox, useDateLabel, Icon, N, Parts } from '../components/ui.tsx';
import { VideoButton, VideoModal, Uploader } from '../components/media.tsx';
import { Cover } from '../components/imagery.tsx';
import { RestTimer } from '../components/RestTimer.tsx';
import { prescriptionParts, actualParts } from '../shared/format.ts';
import { formatPace, paceSecPerKm, parseDuration, formatDuration } from '../../../shared/pace.ts';
import { todayISO, addDays } from '../../../shared/dates.ts';
import type { ActualData, StrengthSet } from '../../../shared/types.ts';
import type { StringKey } from '../i18n/strings.ts';

interface Entry {
  program_item_id: string | null;
  exercise_id: string;
  data: ActualData;
  notes: string | null;
}

const LOCAL_KEY = 'drafts';
function localDrafts(): Record<string, { savedAt: number; body: unknown }> {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '{}');
  } catch {
    return {};
  }
}
function setLocalDraft(logId: string, body: unknown | null) {
  const all = localDrafts();
  if (body == null) delete all[logId];
  else all[logId] = { savedAt: Date.now(), body };
  localStorage.setItem(LOCAL_KEY, JSON.stringify(all));
}

export function SessionScreen() {
  const { sid } = useParams();
  const q = useApi<any>(`/sessions/${sid}`);
  return <Async q={q}>{(d) => <SessionInner d={d} reload={q.reload} />}</Async>;
}

function SessionInner({ d, reload }: { d: any; reload: () => void }) {
  const { t } = useI18n();
  const user = useUser();
  const nav = useNavigate();
  const dateLabel = useDateLabel();
  const [skipOpen, setSkipOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const isOwner = user.role === 'client' && user.id === d.session.client_id;
  const s = d.session;

  if (d.log && d.log.status !== 'draft') {
    return (
      <div>
        <Header d={d} />
        <div className="card row between">
          <StatusBadge status={d.log.status} />
          <Link className="btn primary" to={user.role === 'coach' ? `/coach/logs/${d.log.id}` : `/training/log/${d.log.id}`}>{t('training.view')}</Link>
        </div>
      </div>
    );
  }
  if (d.log && isOwner) return <Logger d={d} />;

  const start = async () => {
    await POST(`/sessions/${sid(d)}/start`);
    reload();
  };
  return (
    <div>
      <Header d={d} />
      {s.status === 'rescheduled' && <div className="alert">{t('status.rescheduled')} → {dateLabel(s.moved_to_date)}</div>}
      <div className="stack">
        {d.items.map((it: any) => {
          const ex = d.exercises[it.exercise_id];
          return (
            <div key={it.id} className="exercise">
              <div className="row between"><strong>{it.exercise_name}</strong><span className="small muted"><Parts parts={prescriptionParts(it.prescription, it.log_type, t)} /></span></div>
              {it.notes && <div className="small muted">{it.notes}</div>}
              <div className="row" style={{ marginTop: 6 }}>
                <VideoButton media={ex?.demo} label={t('training.watchDemo')} />
                <VideoButton media={ex?.practice} label={t('training.followAlong')} />
              </div>
            </div>
          );
        })}
      </div>
      {isOwner && s.status === 'planned' && (
        <div className="stack savebar">
          <button className="btn primary big" onClick={start}><Icon name="play" /> {t('today.start')}</button>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn small ghost" onClick={() => setMoveOpen(true)}>{t('training.reschedule')}</button>
            <button className="btn small ghost" onClick={() => setSkipOpen(true)}>{t('training.skip')}</button>
          </div>
        </div>
      )}
      {skipOpen && <SkipModal sid={s.id} onClose={() => setSkipOpen(false)} onDone={() => nav('/')} />}
      {moveOpen && <MoveModal sid={s.id} from={s.date} onClose={() => setMoveOpen(false)} onDone={() => nav('/training')} />}
    </div>
  );
}
const sid = (d: any) => d.session.id;

function Header({ d }: { d: any }) {
  const { t } = useI18n();
  const dateLabel = useDateLabel();
  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <h1>{d.workout.title}</h1>
      <div className="row small muted">
        <span>{dateLabel(d.session.date)}</span>
        {d.workout.est_minutes && <span><N>{d.workout.est_minutes}</N> {t('common.min')}</span>}
        {d.versionNo && <span>{t('common.version')} <N>{d.versionNo}</N></span>}
      </div>
      {d.workout.notes && <p className="pre small" style={{ marginTop: 6 }}>{d.workout.notes}</p>}
    </div>
  );
}

function SkipModal({ sid, onClose, onDone }: { sid: string; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<unknown>(null);
  return (
    <Modal title={t('training.skip')} onClose={onClose}>
      <div className="stack">
        <p className="muted">{t('today.skipped')}</p>
        <Field label={t('training.skipReason')}><TextArea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        {!!err && <ErrorBox error={err} />}
        <button className="btn primary big" onClick={async () => { try { await POST(`/sessions/${sid}/skip`, { reason: reason || undefined }); onDone(); } catch (e) { setErr(e); } }}>{t('training.skip')}</button>
      </div>
    </Modal>
  );
}

function MoveModal({ sid, from, onClose, onDone }: { sid: string; from: string; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const dateLabel = useDateLabel();
  const base = from < todayISO() ? todayISO() : from;
  const options = [0, 1, 2, 3, 4, 5, 6].map((n) => addDays(base, n)).filter((x) => x !== from);
  const [date, setDate] = useState(options[0]);
  const [err, setErr] = useState<unknown>(null);
  return (
    <Modal title={t('training.reschedule')} onClose={onClose}>
      <div className="stack">
        <div className="seg">
          {options.slice(0, 5).map((o) => <button key={o} type="button" className={o === date ? 'on' : ''} onClick={() => setDate(o)}>{dateLabel(o)}</button>)}
        </div>
        <Field label={t('training.rescheduleTo')}><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        {!!err && <ErrorBox error={err} />}
        <button className="btn primary big" onClick={async () => { try { await POST(`/sessions/${sid}/reschedule`, { date }); onDone(); } catch (e) { setErr(e); } }}>{t('training.reschedule')}</button>
      </div>
    </Modal>
  );
}

/** The live logger: calm, readable, one exercise in focus; autosave, last-time hints, rest timer, approved swaps. */
function Logger({ d }: { d: any }) {
  const { t } = useI18n();
  const user = useUser();
  const nav = useNavigate();
  const logId: string = d.log.id;
  const itemsById = new Map<string, any>(d.items.map((i: any) => [i.id, i]));

  const initial = (): { entries: Entry[]; notes: string; session_rpe: number | null } => {
    const server = {
      entries: d.entries.map((e: any) => ({ program_item_id: e.program_item_id, exercise_id: e.exercise_id, data: e.data ?? {}, notes: e.notes })),
      notes: d.log.notes ?? '',
      session_rpe: d.log.session_rpe ?? null,
    };
    const local = localDrafts()[logId];
    // A newer on-device copy (saved while offline) wins over the server draft.
    if (local && local.savedAt > Date.parse(d.log.updated_at)) return local.body as any;
    return server;
  };
  const [state, setState] = useState(initial);
  const [saveState, setSaveState] = useState<{ kind: 'idle' | 'saving' | 'saved' | 'local' | 'error'; at?: Date }>({ kind: 'idle' });
  const [timer, setTimer] = useState<{ endsAt: number; total: number } | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishErr, setFinishErr] = useState<unknown>(null);
  const [video, setVideo] = useState<any>(null);
  const tm = useRef<ReturnType<typeof setTimeout>>(undefined);

  const isDone = (e: Entry, logType: string) =>
    logType === 'strength' ? (e.data.sets ?? []).length > 0 && (e.data.sets ?? []).every((x) => x.done)
      : logType === 'practice' ? !!e.data.completed
      : logType === 'running' ? e.data.distanceKm != null && e.data.durationSec != null
      : e.data.rounds != null;
  const logTypeOf = (e: Entry) => d.exercises[e.exercise_id]?.log_type ?? (e.program_item_id ? itemsById.get(e.program_item_id)?.log_type : 'strength') ?? 'strength';
  const doneFlags = state.entries.map((e) => isDone(e, logTypeOf(e)));
  const doneCount = doneFlags.filter(Boolean).length;
  const [open, setOpen] = useState<number>(() => Math.max(0, doneFlags.findIndex((x) => !x)));

  const save = useCallback(async (body: typeof state) => {
    setSaveState({ kind: 'saving' });
    try {
      await PUT(`/logs/${logId}`, body);
      setLocalDraft(logId, null);
      setSaveState({ kind: 'saved', at: new Date() });
    } catch (e) {
      setLocalDraft(logId, body);
      setSaveState({ kind: (e as ApiError).status === 0 ? 'local' : 'error' });
    }
  }, [logId]);

  const update = (fn: (s: typeof state) => typeof state) => {
    setState((prev) => {
      const next = fn(prev);
      setLocalDraft(logId, next);
      clearTimeout(tm.current);
      tm.current = setTimeout(() => save(next), 1200);
      return next;
    });
  };
  // Every change is mirrored to localStorage immediately, so closing the app mid-workout loses
  // nothing; pending server saves are retried when the screen is reopened.
  useEffect(() => {
    if (localDrafts()[logId]) save(state);
    return () => clearTimeout(tm.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setEntry = (idx: number, patch: Partial<Entry>) => update((s) => ({ ...s, entries: s.entries.map((e, i) => (i === idx ? { ...e, ...patch } : e)) }));
  const setData = (idx: number, patch: Partial<ActualData>) => update((s) => ({ ...s, entries: s.entries.map((e, i) => (i === idx ? { ...e, data: { ...e.data, ...patch } } : e)) }));

  const finish = async (status: 'completed' | 'partial') => {
    clearTimeout(tm.current);
    try {
      await POST(`/logs/${logId}/finish`, { ...state, status });
      setLocalDraft(logId, null);
      nav(`/training/log/${logId}?done=1`, { replace: true });
    } catch (e) {
      setFinishErr(e);
    }
  };
  const n = state.entries.length;

  return (
    <div>
      <div className="logtop">
        <div className="row between nowrap">
          <h2 style={{ margin: 0, fontSize: '1.15rem' }}>{d.workout.title}</h2>
          <span className="tiny muted" aria-live="polite">
            {saveState.kind === 'saving' && t('common.saving')}
            {saveState.kind === 'saved' && t('training.draftSaved', { time: saveState.at!.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })}
            {saveState.kind === 'local' && t('training.draftLocal')}
            {saveState.kind === 'error' && <span style={{ color: 'var(--danger)' }}>{t('common.error')}</span>}
          </span>
        </div>
        <div className="row between small" style={{ margin: '0.3rem 0' }}>
          <span className="bold">{t('log.done', { d: doneCount, n })}</span>
          {d.versionNo && <span className="tiny muted">{t('common.version')} <N>{d.versionNo}</N></span>}
        </div>
        <div className="progressbar" role="progressbar" aria-valuemin={0} aria-valuemax={n} aria-valuenow={doneCount} aria-label={t('log.done', { d: doneCount, n })}><i style={{ width: `${n ? (doneCount / n) * 100 : 0}%` }} /></div>
      </div>
      {d.workout.notes && <p className="pre small muted" style={{ margin: '0.6rem 0' }}>{d.workout.notes}</p>}
      <p className="tiny muted" style={{ margin: '0.5rem 0 0.75rem' }}>{t('log.tapHint')}</p>

      {state.entries.map((e, idx) => {
        const item = e.program_item_id ? itemsById.get(e.program_item_id) : null;
        const prescribedId = item?.exercise_id ?? e.exercise_id;
        const ex = d.exercises[e.exercise_id];
        const prescribedEx = d.exercises[prescribedId];
        const prev = d.previous[e.exercise_id];
        const logType = logTypeOf(e);
        const alts = prescribedEx?.alternatives ?? [];
        const done = doneFlags[idx];
        const expanded = open === idx;
        const demo = ex?.demo && (ex.demo.hasFile || ex.demo.external_url) ? ex.demo : null;
        const sets = e.data.sets ?? [];
        const summary = done ? actualParts(e.data, logType, t) : item ? prescriptionParts(item.prescription, item.log_type, t) : [];
        const goNext = () => {
          const nxt = doneFlags.findIndex((x, j) => j > idx && !x);
          if (nxt >= 0) setOpen(nxt);
        };
        return (
          <section key={idx} className={'exercise' + (done ? ' done' : '')} aria-label={ex?.name}>
            <div className="row nowrap" style={{ paddingInlineEnd: '0.85rem' }}>
              <button type="button" className="ex-head" aria-expanded={expanded} onClick={() => setOpen(expanded ? -1 : idx)}>
                <span className={'ex-num' + (done ? ' on' : '')} aria-hidden="true">{done ? <Icon name="check" size={15} /> : idx + 1}</span>
                <span className="grow">
                  <span className="tiny muted" style={{ display: 'block' }}>{t('log.exerciseOf', { i: idx + 1, n })}{done ? ` · ${t('status.completed')}` : ''}</span>
                  <span className="bold" style={{ display: 'block', fontSize: '1.05rem' }}>{ex?.name ?? item?.exercise_name}</span>
                  {!expanded && summary.length > 0 && <span className="small muted"><Parts parts={summary} /></span>}
                </span>
              </button>
              {demo ? (
                <button type="button" className="ex-thumb" onClick={() => setVideo(demo)} aria-label={`${t('training.watchDemo')}: ${ex?.name}`}>
                  <Cover category={ex?.category} showTag={false} /><span className="play-mini"><Icon name="play" size={22} filled /></span>
                </button>
              ) : (
                <span className="ex-thumb" aria-hidden="true"><Cover category={ex?.category} showTag={false} /></span>
              )}
            </div>
            {expanded && (
              <div className="ex-body stack">
                {e.exercise_id !== prescribedId && <div className="small muted">{t('training.swapped', { name: prescribedEx?.name ?? '' })}</div>}
                {item && (
                  <div>
                    <div className="label" style={{ marginBottom: 4 }}>{t('training.prescribed')}</div>
                    <div className="presc-chips">{prescriptionParts(item.prescription, item.log_type, t).map((p, i) => <span key={i} className="tag"><bdi>{p}</bdi></span>)}</div>
                  </div>
                )}
                {item?.notes && <div className="small">{item.notes}</div>}
                <div className="prevbox"><Icon name="history" size={18} />
                  {prev ? <span><span className="muted">{t('training.lastTime', { date: prev.date })}: </span><span className="bold"><Parts parts={actualParts(prev.data, logType, t)} sep=", " /></span></span> : <span className="muted">{t('training.noPrevious')}</span>}
                </div>
                {ex?.cues && <details className="small"><summary className="bold" style={{ cursor: 'pointer' }}>{t('training.cues')}</summary><p className="pre" style={{ marginTop: 4 }}>{ex.cues}</p></details>}
                <div className="row">
                  <VideoButton media={ex?.demo} label={t('training.watchDemo')} />
                  <VideoButton media={ex?.practice} label={t('training.followAlong')} />
                  {alts.length > 0 && (
                    <select className="input" style={{ width: 'auto', minHeight: '2.25rem' }} aria-label={t('training.swap')} value={e.exercise_id}
                      onChange={(ev) => setEntry(idx, { exercise_id: ev.target.value, data: d.exercises[ev.target.value]?.log_type === 'strength' ? { sets: (sets.length ? sets : [{}]).map(() => ({ reps: null, weight: null, unit: 'kg', done: false })) } : {} })}>
                      <option value={prescribedId}>{prescribedEx?.name}</option>
                      {alts.map((a: any) => <option key={a.id} value={a.id}>{t('training.swap')}: {a.name}</option>)}
                    </select>
                  )}
                </div>

                {logType === 'strength' && (
                  <StrengthSets sets={sets} presc={item?.prescription ?? {}} prev={prev?.data?.sets}
                    onChange={(next) => {
                      setData(idx, { sets: next });
                      if (next.length && next.every((x) => x.done)) goNext();
                    }}
                    onDone={() => item?.prescription?.restSec && setTimer({ endsAt: Date.now() + item.prescription.restSec * 1000, total: item.prescription.restSec })} />
                )}
                {logType === 'circuit' && (
                  <div className="grid3">
                    <Field label={t('training.rounds')}><NumInput value={e.data.rounds} onChange={(v) => setData(idx, { rounds: v })} /></Field>
                    <Field label={t('training.reps')}><NumInput value={e.data.reps} onChange={(v) => setData(idx, { reps: v })} /></Field>
                    <Field label={t('training.workSec')}><NumInput value={e.data.workSec} onChange={(v) => setData(idx, { workSec: v })} /></Field>
                    <Field label={t('training.restSec')}><NumInput value={e.data.restSec} onChange={(v) => setData(idx, { restSec: v })} /></Field>
                  </div>
                )}
                {logType === 'running' && <RunFields data={e.data} onChange={(p) => setData(idx, p)} />}
                {logType === 'practice' && (
                  <div className="stack">
                    <label className="check"><input type="checkbox" checked={!!e.data.completed} onChange={(ev) => setData(idx, { completed: ev.target.checked, durationSec: e.data.durationSec ?? (item?.prescription?.durationMin ? item.prescription.durationMin * 60 : null) })} /><span>{t('training.completedPractice')}</span></label>
                    <div className="row">
                      <Field label={t('training.duration')}><NumInput value={e.data.durationSec != null ? Math.round(e.data.durationSec / 60) : null} onChange={(v) => setData(idx, { durationSec: v == null ? null : v * 60 })} /></Field>
                      <div>
                        <div className="label">{t('training.difficulty')}</div>
                        <Seg value={(e.data.difficulty ?? '') as any} onChange={(v) => setData(idx, { difficulty: v as any })} options={(['easy', 'ok', 'hard'] as const).map((k) => ({ value: k, label: t(('diff.' + k) as StringKey) }))} />
                      </div>
                    </div>
                  </div>
                )}
                <details>
                  <summary className="small muted" style={{ cursor: 'pointer', minHeight: '2rem' }}>{t('common.notes')} · {t('training.uploadVideo')}</summary>
                  <div className="stack" style={{ marginTop: 6 }}>
                    <TextArea value={e.notes ?? ''} onChange={(ev) => setEntry(idx, { notes: ev.target.value })} placeholder={t('common.notes')} />
                    <Uploader createPath={`/clients/${user.id}/media`} meta={{ kind: 'submission', title: ex?.name ?? 'video', context: { logId, exerciseId: e.exercise_id } }} accept="video/*" label={t('training.uploadVideo')} onDone={() => undefined} />
                  </div>
                </details>
              </div>
            )}
          </section>
        );
      })}

      <div className="savebar">
        <button className="btn primary big" onClick={() => setFinishOpen(true)}><Icon name="check" /> {t('training.finish')}</button>
      </div>

      {timer && <RestTimer endsAt={timer.endsAt} total={timer.total} onClose={() => setTimer(null)} onAdd={(sec) => setTimer((x) => (x ? { endsAt: x.endsAt + sec * 1000, total: x.total + sec } : x))} />}
      {video && <VideoModal media={video} onClose={() => setVideo(null)} />}

      {finishOpen && (
        <Modal title={t('training.finish')} onClose={() => setFinishOpen(false)}>
          <div className="stack">
            <Field label={t('training.sessionRpe')}>
              <div className="seg">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((k) => (
                  <button key={k} type="button" className={state.session_rpe === k ? 'on' : ''} aria-pressed={state.session_rpe === k} onClick={() => update((s) => ({ ...s, session_rpe: k }))}><span className="num">{k}</span></button>
                ))}
              </div>
            </Field>
            <Field label={t('training.sessionNotes')}><TextArea value={state.notes ?? ''} onChange={(e) => update((s) => ({ ...s, notes: e.target.value }))} /></Field>
            {!!finishErr && <ErrorBox error={finishErr} />}
            <button className="btn primary big" onClick={() => finish('completed')}>{t('training.finishAll')}</button>
            <button className="btn big" onClick={() => finish('partial')}>{t('training.finishPartial')}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function StrengthSets({ sets, presc, prev, onChange, onDone }: { sets: StrengthSet[]; presc: any; prev?: StrengthSet[]; onChange: (s: StrengthSet[]) => void; onDone: () => void }) {
  const { t } = useI18n();
  const unit = presc.loadUnit ?? 'kg';
  const set = (i: number, patch: Partial<StrengthSet>) => onChange(sets.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  return (
    <div>
      <div className="setgrid">
        <span className="hdr">{t('training.set')}</span>
        <span className="hdr">{t('training.reps')}</span>
        <span className="hdr">{t('training.weight')} (<bdi>{unit}</bdi>)</span>
        <span className="hdr" aria-hidden="true">✓</span>
        {sets.map((s, i) => {
          const p = prev?.[i];
          return (
            <Fragment key={i}>
              <span className="setidx num">{i + 1}</span>
              <NumInput className={s.done ? 'done' : ''} ariaLabel={`${t('training.set')} ${i + 1} · ${t('training.reps')}`} value={s.reps} onChange={(v) => set(i, { reps: v })} placeholder={String(p?.reps ?? presc.reps ?? '')} step="1" />
              <NumInput className={s.done ? 'done' : ''} ariaLabel={`${t('training.set')} ${i + 1} · ${t('training.weight')}`} value={s.weight} onChange={(v) => set(i, { weight: v })} placeholder={String(p?.weight ?? presc.load ?? '')} />
              <button type="button" className={'setcheck' + (s.done ? ' on' : '')} aria-pressed={!!s.done} aria-label={`${t('training.set')} ${i + 1}: ${s.done ? t('status.completed') : t('common.save')}`}
                onClick={() => {
                  // Tapping ✓ on an empty set copies the placeholder (last time or prescription) — minimal typing.
                  const reps = s.reps ?? p?.reps ?? presc.reps ?? null;
                  const weight = s.weight ?? p?.weight ?? presc.load ?? null;
                  set(i, { done: !s.done, reps, weight, unit });
                  if (!s.done) onDone();
                }}>
                <Icon name="check" size={22} />
              </button>
            </Fragment>
          );
        })}
      </div>
      <button type="button" className="btn small ghost" style={{ marginTop: 6 }} onClick={() => onChange([...sets, { reps: null, weight: sets[sets.length - 1]?.weight ?? null, unit, done: false }])}><Icon name="plus" size={18} /> {t('training.addSet').replace('+ ', '')}</button>
    </div>
  );
}

function RunFields({ data, onChange }: { data: ActualData; onChange: (p: Partial<ActualData>) => void }) {
  const { t } = useI18n();
  const [timeText, setTimeText] = useState(data.durationSec != null ? formatDuration(data.durationSec) : '');
  const pace = paceSecPerKm(data.distanceKm, data.durationSec);
  return (
    <div className="grid3">
      <Field label={t('training.distance')}><NumInput value={data.distanceKm} onChange={(v) => onChange({ distanceKm: v })} /></Field>
      <Field label={t('training.time')}>
        <input className="input numeric" inputMode="numeric" value={timeText} placeholder="25:00"
          onChange={(e) => { setTimeText(e.target.value); onChange({ durationSec: parseDuration(e.target.value) }); }} />
      </Field>
      <div><div className="small muted">{t('training.pace')}</div><div className="bold num">{formatPace(pace)}</div></div>
    </div>
  );
}
