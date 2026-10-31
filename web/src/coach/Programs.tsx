import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useI18n } from '../i18n/index.tsx';
import { useApi, POST, PUT } from '../api.ts';
import { Async, Field, Input, TextArea, Select, NumInput, ErrorBox, Empty, DemoBadge, useDateLabel, N, Parts } from '../components/ui.tsx';
import { prescriptionParts } from '../shared/format.ts';
import { CATEGORIES } from '../../../shared/types.ts';
import { todayISO } from '../../../shared/dates.ts';
import type { StringKey } from '../i18n/strings.ts';

export function Programs() {
  const { t } = useI18n();
  const nav = useNavigate();
  const q = useApi<any[]>('/programs');
  const [name, setName] = useState('');
  const [weeks, setWeeks] = useState<number | null>(4);
  return (
    <div>
      <h1>{t('prog.templates')}</h1>
      <div className="card row">
        <Input placeholder={t('common.name')} value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 2 }} />
        <div style={{ width: 120 }}><NumInput value={weeks} onChange={setWeeks} ariaLabel={t('prog.lengthWeeks')} /></div>
        <button className="btn primary" disabled={!name || !weeks} onClick={async () => { const r = await POST('/programs', { name, length_weeks: weeks }); nav(`/coach/programs/${r.id}`); }}>{t('prog.new')}</button>
      </div>
      <Async q={q}>
        {(list) => list.length === 0 ? <Empty>{t('common.none')}</Empty> : (
          <div className="grid2">
            {list.map((p) => (
              <Link key={p.id} to={`/coach/programs/${p.id}`} className="card" style={{ textDecoration: 'none', color: 'inherit', opacity: p.status === 'archived' ? 0.6 : 1 }}>
                <div className="row between"><strong>{p.name}</strong><DemoBadge show={p.is_demo} /></div>
                <div className="small muted">{t('prog.lengthWeeks')}: <N>{p.length_weeks}</N> · {t('common.version')} <N>{p.versionNo}</N>{p.status === 'archived' ? ` · ${t('lib.archived')}` : ''}</div>
                {p.description && <div className="small">{p.description}</div>}
              </Link>
            ))}
          </div>
        )}
      </Async>
    </div>
  );
}

/** Read-only program listing grouped by week. */
export function ProgramView({ workouts }: { workouts: any[] }) {
  const { t } = useI18n();
  const weeks = [...new Set(workouts.map((w) => w.week_index))].sort((a, b) => a - b);
  if (!workouts.length) return <Empty>{t('common.none')}</Empty>;
  return (
    <div>
      {weeks.map((wk) => (
        <div key={wk} className="card">
          <h3>{t('prog.week', { n: wk })}</h3>
          {workouts.filter((w) => w.week_index === wk).map((w) => (
            <div key={w.id} style={{ marginBottom: 10 }}>
              <div className="bold">{t(('day.' + w.day_of_week) as StringKey)} · {w.title}</div>
              <ul className="small" style={{ margin: '4px 0', paddingInlineStart: '1.2rem' }}>
                {w.items.map((i: any) => <li key={i.id}>{i.exercise_name} — <Parts parts={prescriptionParts(i.prescription, i.log_type, t)} />{i.notes ? ` · ${i.notes}` : ''}</li>)}
              </ul>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

type EditItem = { exercise_id: string; block: string | null; prescription: Record<string, any>; notes: string | null };
type EditWorkout = { week_index: number; day_of_week: number; title: string; category: string | null; notes: string | null; est_minutes: number | null; level?: string | null; items: EditItem[] };

const toEdit = (workouts: any[]): EditWorkout[] =>
  workouts.map((w) => ({
    week_index: w.week_index, day_of_week: w.day_of_week, title: w.title, category: w.category, notes: w.notes, est_minutes: w.est_minutes, level: w.level ?? null,
    items: w.items.map((i: any) => ({ exercise_id: i.exercise_id, block: i.block, prescription: i.prescription, notes: i.notes })),
  }));

export function ProgramEditor() {
  const { pid } = useParams();
  const [params] = useSearchParams();
  const version = params.get('version');
  const q = useApi<any>(`/programs/${pid}${version ? `?version=${version}` : ''}`);
  const ex = useApi<any[]>('/exercises');
  return <Async q={q}>{(p) => <Async q={ex}>{(exercises) => <Editor key={p.version.id} p={p} exercises={exercises} reload={q.reload} />}</Async>}</Async>;
}

function Editor({ p, exercises, reload }: { p: any; exercises: any[]; reload: () => void }) {
  const { t } = useI18n();
  const nav = useNavigate();
  const dateLabel = useDateLabel();
  const readOnly = p.version.id !== p.current_version_id;
  const [ws, setWs] = useState<EditWorkout[]>(() => toEdit(p.workouts));
  const [week, setWeek] = useState(1);
  const [note, setNote] = useState('');
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [meta, setMeta] = useState({ name: p.name, description: p.description ?? '', length_weeks: p.length_weeks });
  const clients = useApi<any[]>(p.client_id ? null : '/clients');
  const [assign, setAssign] = useState({ clientId: '', startDate: todayISO() });
  const exById = new Map(exercises.map((e) => [e.id, e]));
  const active = exercises.filter((e) => !e.archived);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const change = (fn: (w: EditWorkout[]) => EditWorkout[]) => { setWs(fn); setDirty(true); setMsg(null); };
  const setW = (idx: number, patch: Partial<EditWorkout>) => change((all) => all.map((w, i) => (i === idx ? { ...w, ...patch } : w)));
  const setI = (wi: number, ii: number, patch: Partial<EditItem>) => change((all) => all.map((w, i) => (i === wi ? { ...w, items: w.items.map((it, j) => (j === ii ? { ...it, ...patch } : it)) } : w)));

  const save = async () => {
    setErr(null);
    try {
      if (meta.name !== p.name || meta.description !== (p.description ?? '') || meta.length_weeks !== p.length_weeks) await PUT(`/programs/${p.id}`, meta);
      await POST(`/programs/${p.id}/versions?today=${todayISO()}`, { note: note || undefined, workouts: ws });
      setDirty(false);
      setNote('');
      setMsg(t('prog.savedVersion', { v: p.versions.length + 1 }));
      reload();
    } catch (e) { setErr(e); }
  };

  const weekIdx = ws.map((w, i) => [w, i] as const).filter(([w]) => w.week_index === week);

  return (
    <div>
      <div className="row between">
        <h1 style={{ margin: 0 }}>{p.name} <DemoBadge show={p.is_demo} /></h1>
        {p.client_id && <Link className="btn small" to={`/coach/clients/${p.client_id}/program`}>{t('common.back')}</Link>}
      </div>
      {readOnly && <div className="alert">{t('prog.viewing', { v: p.version.version_no })} · <Link to={`/coach/programs/${p.id}`}>{t('prog.current')}</Link></div>}
      {!readOnly && (
        <div className="card grid2">
          <Field label={t('common.name')}><Input value={meta.name} onChange={(e) => { setMeta({ ...meta, name: e.target.value }); setDirty(true); }} /></Field>
          <Field label={t('prog.lengthWeeks')}><NumInput value={meta.length_weeks} onChange={(v) => { setMeta({ ...meta, length_weeks: v ?? 1 }); setDirty(true); }} /></Field>
          <Field label={t('common.description')}><TextArea value={meta.description} onChange={(e) => { setMeta({ ...meta, description: e.target.value }); setDirty(true); }} /></Field>
        </div>
      )}

      <div className="seg" style={{ marginBottom: '0.75rem' }}>
        {Array.from({ length: meta.length_weeks }, (_, i) => i + 1).map((n) => <button key={n} className={week === n ? 'on' : ''} onClick={() => setWeek(n)}>{t('prog.week', { n })}</button>)}
      </div>

      {weekIdx.map(([w, wi]) => (
        <div key={wi} className="card">
          <div className="grid3">
            <Field label={t('prog.workoutTitle')}><Input value={w.title} disabled={readOnly} onChange={(e) => setW(wi, { title: e.target.value })} /></Field>
            <Field label={t('prog.day')}><Select value={w.day_of_week} disabled={readOnly} onChange={(e) => setW(wi, { day_of_week: Number(e.target.value) })}>{[0, 1, 2, 3, 4, 5, 6].map((d) => <option key={d} value={d}>{t(('day.' + d) as StringKey)}</option>)}</Select></Field>
            <Field label={t('lib.category')}><Select value={w.category ?? ''} disabled={readOnly} onChange={(e) => setW(wi, { category: e.target.value || null })}><option value="">—</option>{CATEGORIES.map((c) => <option key={c} value={c}>{t(('cat.' + c) as StringKey)}</option>)}</Select></Field>
            <Field label={t('prog.estMinutes')}><NumInput value={w.est_minutes} onChange={(v) => setW(wi, { est_minutes: v })} /></Field>
            <Field label={t('prog.level')}><Select value={w.level ?? ''} disabled={readOnly} onChange={(e) => setW(wi, { level: e.target.value || null })}><option value="">—</option>{['beginner', 'intermediate', 'advanced'].map((l) => <option key={l} value={l}>{t(('level.' + l) as StringKey)}</option>)}</Select></Field>
          </div>
          <Field label={t('common.notes')}><TextArea value={w.notes ?? ''} disabled={readOnly} onChange={(e) => setW(wi, { notes: e.target.value })} style={{ minHeight: 50 }} /></Field>
          <div className="stack" style={{ marginTop: 8 }}>
            {w.items.map((it, ii) => {
              const e = exById.get(it.exercise_id);
              return (
                <div key={ii} className="card soft" style={{ marginBottom: 0 }}>
                  <div className="row nowrap">
                    <Select value={it.exercise_id} disabled={readOnly} onChange={(ev) => setI(wi, ii, { exercise_id: ev.target.value })} style={{ flex: 1 }}>
                      {active.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </Select>
                    {!readOnly && (
                      <>
                        <button className="btn small ghost" disabled={ii === 0} onClick={() => change((all) => all.map((x, i) => i !== wi ? x : { ...x, items: swap(x.items, ii, ii - 1) }))}>↑</button>
                        <button className="btn small ghost" onClick={() => change((all) => all.map((x, i) => i !== wi ? x : { ...x, items: x.items.filter((_, j) => j !== ii) }))}>✕</button>
                      </>
                    )}
                  </div>
                  <PrescriptionFields logType={e?.log_type ?? 'strength'} value={it.prescription} disabled={readOnly} onChange={(pr) => setI(wi, ii, { prescription: pr })} />
                  <Input placeholder={t('prog.itemNotes')} value={it.notes ?? ''} disabled={readOnly} onChange={(ev) => setI(wi, ii, { notes: ev.target.value || null })} />
                  {e?.starting_prescription && <div className="tiny muted">{t('lib.startingPrescription')}: {e.starting_prescription}</div>}
                </div>
              );
            })}
          </div>
          {!readOnly && (
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn small" disabled={!active.length} onClick={() => setW(wi, { items: [...w.items, { exercise_id: active[0].id, block: null, prescription: {}, notes: null }] })}>{t('prog.addItem')}</button>
              {week < meta.length_weeks && <button className="btn small ghost" onClick={() => change((all) => [...all, { ...structuredClone(w), week_index: week + 1 }])}>{t('prog.copyWeek')}</button>}
              <button className="btn small danger" onClick={() => change((all) => all.filter((_, i) => i !== wi))}>{t('common.delete')}</button>
            </div>
          )}
        </div>
      ))}
      {!readOnly && <button className="btn" onClick={() => change((all) => [...all, { week_index: week, day_of_week: 0, title: t('prog.workoutTitle'), category: 'strength', notes: null, est_minutes: 45, items: [] }])}>{t('prog.addWorkout')}</button>}

      {!readOnly && (
        <div className="card stack" style={{ marginTop: '1rem' }}>
          {dirty && <div className="badge warn">{t('prog.unsaved')}</div>}
          <Field label={t('prog.versionNote')}><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          {!!err && <ErrorBox error={err} />}
          {msg && <div className="alert ok">{msg}</div>}
          <button className="btn primary big" onClick={save} disabled={!dirty}>{t('prog.saveVersion')}</button>
        </div>
      )}

      {!p.client_id && !readOnly && (
        <div className="card stack">
          <h3>{t('prog.assignTo')}</h3>
          <Async q={clients}>
            {(list) => (
              <div className="row">
                <Select value={assign.clientId} onChange={(e) => setAssign({ ...assign, clientId: e.target.value })} style={{ flex: 2 }}><option value="">—</option>{list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
                <Input type="date" value={assign.startDate} onChange={(e) => setAssign({ ...assign, startDate: e.target.value })} style={{ flex: 1 }} />
                <button className="btn primary" disabled={!assign.clientId || dirty} onClick={async () => { try { const r = await POST(`/programs/${p.id}/assign`, assign); nav(`/coach/programs/${r.id}`); } catch (e) { setErr(e); } }}>{t('prog.assignTo')}</button>
              </div>
            )}
          </Async>
        </div>
      )}

      <div className="card">
        <h3>{t('prog.versions')}</h3>
        <ul className="list small">
          {p.versions.map((v: any) => (
            <li key={v.id} className="row between">
              <Link to={`/coach/programs/${p.id}${v.id === p.current_version_id ? '' : `?version=${v.id}`}`}>{t('common.version')} <N>{v.version_no}</N>{v.id === p.current_version_id ? ` (${t('prog.current')})` : ''}</Link>
              <span className="muted">{v.note ?? ''} · {dateLabel(v.created_at.slice(0, 10))}</span>
            </li>
          ))}
        </ul>
        {!readOnly && p.status === 'active' && <button className="btn small ghost" onClick={async () => { await PUT(`/programs/${p.id}`, { status: 'archived' }); reload(); }}>{t('prog.archive')}</button>}
      </div>
    </div>
  );
}

function swap<T>(a: T[], i: number, j: number): T[] {
  const b = [...a];
  [b[i], b[j]] = [b[j], b[i]];
  return b;
}

function PrescriptionFields({ logType, value, onChange, disabled }: { logType: string; value: Record<string, any>; onChange: (v: Record<string, any>) => void; disabled?: boolean }) {
  const { t } = useI18n();
  const f = (k: string, label: string) => (
    <Field key={k} label={label}>
      <NumInput value={value[k] ?? null} onChange={(v) => { const n = { ...value }; if (v == null) delete n[k]; else n[k] = v; if (k === 'load' && v != null && !n.loadUnit) n.loadUnit = 'kg'; onChange(n); }} />
    </Field>
  );
  const fields: Record<string, [string, string][]> = {
    strength: [['sets', t('prog.sets')], ['reps', t('prog.reps')], ['repsMax', t('prog.repsMax')], ['load', t('prog.load') + ' (kg)'], ['rpe', t('prog.rpe')], ['restSec', t('prog.rest')]],
    circuit: [['rounds', t('prog.rounds')], ['reps', t('prog.reps')], ['workSec', t('prog.work')], ['restSec', t('prog.rest')]],
    running: [['distanceKm', t('prog.distanceKm')], ['durationMin', t('prog.durationMin')], ['rpe', t('prog.rpe')]],
    practice: [['durationMin', t('prog.durationMin')]],
  };
  return <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: '6px 0' }}><div className="grid3">{(fields[logType] ?? fields.strength).map(([k, l]) => f(k, l))}</div></fieldset>;
}
