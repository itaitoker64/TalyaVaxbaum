import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router';
import { useI18n } from '../i18n/index.tsx';
import { useUser } from '../auth.tsx';
import { useApi, POST, PUT, ApiError } from '../api.ts';
import { Async, NumInput, Modal, Field, TextArea, Input, StatusBadge, Seg, ErrorBox, useDateLabel, Icon, N, Parts } from '../components/ui.tsx';
import { VideoButton, Uploader } from '../components/media.tsx';
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
          <Link className="btn primary" to={`/training/log/${d.log.id}`}>{t('training.view')}</Link>
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

/** The live logger: quick inputs, last-time hints, rest timer, approved swaps and autosave. */
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
  const [timer, setTimer] = useState<number | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishErr, setFinishErr] = useState<unknown>(null);
  const dirty = useRef(false);
  const tm = useRef<ReturnType<typeof setTimeout>>(undefined);

  const save = useCallback(async (body: typeof state) => {
    setSaveState({ kind: 'saving' });
    try {
      await PUT(`/logs/${logId}`, body);
      setLocalDraft(logId, null);
      dirty.current = false;
      setSaveState({ kind: 'saved', at: new Date() });
    } catch (e) {
      setLocalDraft(logId, body);
      setSaveState({ kind: (e as ApiError).status === 0 ? 'local' : 'error' });
    }
  }, [logId]);

  const update = (fn: (s: typeof state) => typeof state) => {
    setState((prev) => {
      const next = fn(prev);
      dirty.current = true;
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

  return (
    <div>
      <Header d={d} />
      <div className="tiny muted" aria-live="polite" style={{ marginBottom: 8 }}>
        {saveState.kind === 'saving' && t('common.saving')}
        {saveState.kind === 'saved' && t('training.draftSaved', { time: saveState.at!.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })}
        {saveState.kind === 'local' && t('training.draftLocal')}
        {saveState.kind === 'error' && <span style={{ color: 'var(--danger)' }}>{t('common.error')}</span>}
      </div>

      {state.entries.map((e, idx) => {
        const item = e.program_item_id ? itemsById.get(e.program_item_id) : null;
        const prescribedId = item?.exercise_id ?? e.exercise_id;
        const ex = d.exercises[e.exercise_id];
        const prescribedEx = d.exercises[prescribedId];
        const prev = d.previous[e.exercise_id];
        const logType = ex?.log_type ?? item?.log_type ?? 'strength';
        const alts = prescribedEx?.alternatives ?? [];
        const allDone = logType === 'strength' ? (e.data.sets ?? []).length > 0 && (e.data.sets ?? []).every((x) => x.done) : logType === 'practice' ? !!e.data.completed : false;
        return (
          <section key={idx} className={'exercise' + (allDone ? ' done' : '')} aria-label={ex?.name}>
            <div className="row between nowrap">
              <h3 style={{ margin: 0 }}>{ex?.name ?? item?.exercise_name}</h3>
              {allDone && <span className="badge ok"><Icon name="check" /></span>}
            </div>
            {e.exercise_id !== prescribedId && <div className="small muted">{t('training.swapped', { name: prescribedEx?.name ?? '' })}</div>}
            {item && <div className="presc" style={{ margin: '6px 0' }}>{t('training.prescribed')}: <Parts parts={prescriptionParts(item.prescription, item.log_type, t)} /></div>}
            {item?.notes && <div className="small">{item.notes}</div>}
            {ex?.cues && <details className="small"><summary>{t('training.cues')}</summary><p className="pre">{ex.cues}</p></details>}
            <div className="prev">{prev ? <>{t('training.lastTime', { date: prev.date })}: <Parts parts={actualParts(prev.data, logType, t)} sep=", " /></> : t('training.noPrevious')}</div>
            <div className="row" style={{ margin: '6px 0' }}>
              <VideoButton media={ex?.demo} label={t('training.watchDemo')} />
              <VideoButton media={ex?.practice} label={t('training.followAlong')} />
              {alts.length > 0 && (
                <select className="input" style={{ width: 'auto', minHeight: 36 }} aria-label={t('training.swap')} value={e.exercise_id}
                  onChange={(ev) => setEntry(idx, { exercise_id: ev.target.value, data: d.exercises[ev.target.value]?.log_type === 'strength' ? { sets: (e.data.sets ?? [{}]).map(() => ({ reps: null, weight: null, unit: 'kg', done: false })) } : {} })}>
                  <option value={prescribedId}>{prescribedEx?.name}</option>
                  {alts.map((a: any) => <option key={a.id} value={a.id}>{t('training.swap')}: {a.name}</option>)}
                </select>
              )}
            </div>

            {logType === 'strength' && (
              <StrengthSets sets={e.data.sets ?? []} presc={item?.prescription ?? {}} prev={prev?.data?.sets}
                onChange={(sets) => setData(idx, { sets })}
                onDone={() => item?.prescription?.restSec && setTimer(Date.now() + item.prescription.restSec * 1000)} />
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
                    <div className="small muted">{t('training.difficulty')}</div>
                    <Seg value={(e.data.difficulty ?? '') as any} onChange={(v) => setData(idx, { difficulty: v as any })} options={(['easy', 'ok', 'hard'] as const).map((k) => ({ value: k, label: t(('diff.' + k) as StringKey) }))} />
                  </div>
                </div>
              </div>
            )}
            <details style={{ marginTop: 6 }}>
              <summary className="small muted">{t('common.notes')} / {t('training.uploadVideo')}</summary>
              <div className="stack" style={{ marginTop: 6 }}>
                <TextArea value={e.notes ?? ''} onChange={(ev) => setEntry(idx, { notes: ev.target.value })} placeholder={t('common.notes')} />
                <Uploader createPath={`/clients/${user.id}/media`} meta={{ kind: 'submission', title: ex?.name ?? 'video', context: { logId, exerciseId: e.exercise_id } }} accept="video/*" label={t('training.uploadVideo')} onDone={() => undefined} />
              </div>
            </details>
          </section>
        );
      })}

      <div className="savebar">
        <button className="btn primary big" onClick={() => setFinishOpen(true)}>{t('training.finish')}</button>
      </div>

      {timer && <RestTimer endsAt={timer} onClose={() => setTimer(null)} onAdd={(sec) => setTimer((x) => (x ?? Date.now()) + sec * 1000)} />}

      {finishOpen && (
        <Modal title={t('training.finish')} onClose={() => setFinishOpen(false)}>
          <div className="stack">
            <Field label={t('training.sessionRpe')}>
              <div className="seg">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <button key={n} type="button" className={state.session_rpe === n ? 'on' : ''} onClick={() => update((s) => ({ ...s, session_rpe: n }))}><span className="num">{n}</span></button>
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
  const set = (i: number, patch: Partial<StrengthSet>) => onChange(sets.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  return (
    <div>
      <div className="setrow tiny muted">
        <span className="idx">{t('training.set')}</span>
        <span className="center">{t('training.reps')}</span>
        <span className="center">{t('training.weight')} ({presc.loadUnit ?? 'kg'})</span>
        <span />
      </div>
      {sets.map((s, i) => {
        const p = prev?.[i];
        return (
          <div className="setrow" key={i}>
            <span className="idx num">{i + 1}</span>
            <NumInput ariaLabel={`${t('training.reps')} ${i + 1}`} value={s.reps} onChange={(v) => set(i, { reps: v })} placeholder={String(p?.reps ?? presc.reps ?? '')} step="1" />
            <NumInput ariaLabel={`${t('training.weight')} ${i + 1}`} value={s.weight} onChange={(v) => set(i, { weight: v })} placeholder={String(p?.weight ?? presc.load ?? '')} />
            <button type="button" className={'setcheck' + (s.done ? ' on' : '')} aria-pressed={!!s.done} aria-label={`${t('training.set')} ${i + 1} ✓`}
              onClick={() => {
                // Tapping ✓ on an empty set copies the placeholder (last time or prescription) — minimal typing.
                const reps = s.reps ?? p?.reps ?? presc.reps ?? null;
                const weight = s.weight ?? p?.weight ?? presc.load ?? null;
                set(i, { done: !s.done, reps, weight, unit: presc.loadUnit ?? 'kg' });
                if (!s.done) onDone();
              }}>
              <Icon name="check" />
            </button>
          </div>
        );
      })}
      <button type="button" className="btn small ghost" onClick={() => onChange([...sets, { reps: null, weight: sets[sets.length - 1]?.weight ?? null, unit: presc.loadUnit ?? 'kg', done: false }])}>{t('training.addSet')}</button>
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
