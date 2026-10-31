import { useState } from 'react';
import { Link, NavLink, Route, Routes, useNavigate, useParams } from 'react-router';
import { useI18n } from '../i18n/index.tsx';
import { useApi, POST, PUT } from '../api.ts';
import { Async, Field, Input, TextArea, Select, NumInput, Seg, ErrorBox, Empty, DemoBadge, useDateLabel, StatusBadge } from '../components/ui.tsx';
import { MediaPlayer } from '../components/media.tsx';
import { ScheduleWeek, LogHistory } from '../client/Training.tsx';
import { GoalList, AdherenceCard, ExerciseHistory } from '../client/Progress.tsx';
import { CheckinList } from '../client/Checkin.tsx';
import { Diary } from '../client/Nutrition.tsx';
import { Messages } from '../shared/Messages.tsx';
import { GoalForm } from './GoalForm.tsx';
import { ProgramView } from './Programs.tsx';
import { todayISO } from '../../../shared/dates.ts';
import type { NutritionConfig } from '../../../shared/types.ts';

export function ClientProfile() {
  const { cid } = useParams();
  const { t } = useI18n();
  const q = useApi<any>(`/clients/${cid}`);
  const tabs = [
    ['', t('client.overview')], ['program', t('client.program')], ['schedule', t('client.schedule')], ['goals', t('client.goals')],
    ['checkins', t('client.checkins')], ['videos', t('lib.videos')], ['nutrition', t('client.nutrition')], ['messages', t('client.messages')],
  ];
  return (
    <Async q={q}>
      {(c) => (
        <div>
          <div className="row between page-intro">
            <h1 style={{ margin: 0 }}>{c.name} <DemoBadge show={c.is_demo} /></h1>
            <span className="badge">{t('coach.track')} {c.track}</span>
          </div>
          <nav className="coachnav" style={{ margin: '0.5rem -1rem 1rem', background: 'transparent' }}>
            {tabs.map(([path, label]) => <NavLink key={path} end to={`/coach/clients/${cid}/${path}`} className={({ isActive }) => (isActive ? 'active' : '')}>{label}</NavLink>)}
          </nav>
          <Routes>
            <Route index element={<Overview c={c} reload={q.reload} />} />
            <Route path="program" element={<ClientProgram clientId={c.id} />} />
            <Route path="schedule" element={<div className="grid2"><div><ScheduleWeek clientId={c.id} linkFor={(s) => (s.log_id ? `/coach/logs/${s.log_id}` : `/coach/sessions/${s.id}`)} /></div><div><h3>{t('training.history')}</h3><LogHistory clientId={c.id} linkBase="/coach/logs/" /></div></div>} />
            <Route path="goals" element={<ClientGoals clientId={c.id} />} />
            <Route path="checkins" element={<CheckinList clientId={c.id} />} />
            <Route path="videos" element={<ClientVideos clientId={c.id} />} />
            <Route path="nutrition" element={<ClientNutrition c={c} reload={q.reload} />} />
            <Route path="messages" element={<Messages clientId={c.id} />} />
          </Routes>
        </div>
      )}
    </Async>
  );
}

function Overview({ c, reload }: { c: any; reload: () => void }) {
  const { t } = useI18n();
  const dateLabel = useDateLabel();
  const [notes, setNotes] = useState(c.coachNotes ?? '');
  const [saved, setSaved] = useState(false);
  const tasks = useApi<any[]>(`/clients/${c.id}/tasks`);
  const [task, setTask] = useState({ title: '', due_date: '' });
  const o = c.onboarding;
  const labels: [string, string][] = [['goals', 'onb.goals'], ['experience', 'onb.experience'], ['availability', 'onb.availability'], ['equipment', 'onb.equipment'], ['considerations', 'onb.considerations'], ['nutritionInterest', 'onb.nutrition']];
  return (
    <div className="grid2">
      <div>
        <div className="card">
          <h3>{t('client.onboarding')}</h3>
          {!o ? <p className="muted">{t('coach.onboardingPending')}</p> : (
            <dl className="small">
              {labels.map(([k, l]) => o[k] ? <div key={k} style={{ marginBottom: 8 }}><dt className="muted">{t(l as any)}</dt><dd className="pre" style={{ margin: 0 }}>{o[k]}</dd></div> : null)}
              {o.daysPerWeek != null && <div><dt className="muted">{t('onb.daysPerWeek')}</dt><dd className="num" style={{ margin: 0 }}>{o.daysPerWeek}</dd></div>}
            </dl>
          )}
        </div>
        <div className="card stack">
          <Field label={t('coach.track')}>
            <Seg value={c.track} onChange={async (v) => { await PUT(`/clients/${c.id}/settings`, { track: v }); reload(); }} options={[{ value: 'A', label: t('track.A') }, { value: 'B', label: t('track.B') }]} />
          </Field>
          <Field label={t('client.coachNotes')}><TextArea value={notes} onChange={(e) => { setNotes(e.target.value); setSaved(false); }} /></Field>
          <button className="btn small" onClick={async () => { await PUT(`/clients/${c.id}/settings`, { coachNotes: notes }); setSaved(true); }}>{saved ? t('common.saved') : t('common.save')}</button>
        </div>
      </div>
      <div>
        <AdherenceCard clientId={c.id} />
        <div className="card">
          <h3>{t('client.tasks')}</h3>
          <Async q={tasks}>
            {(list) => (
              <ul className="list">
                {list.map((x) => <li key={x.id} className="row between"><span style={{ textDecoration: x.done_at ? 'line-through' : undefined }}>{x.title}</span><span className="tiny muted">{x.due_date ? dateLabel(x.due_date) : ''}</span></li>)}
              </ul>
            )}
          </Async>
          <div className="row" style={{ marginTop: 8 }}>
            <Input className="grow" placeholder={t('client.newTask')} value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} style={{ flex: 1 }} />
            <Input type="date" value={task.due_date} onChange={(e) => setTask({ ...task, due_date: e.target.value })} style={{ width: 160 }} />
            <button className="btn" disabled={!task.title} onClick={async () => { await POST(`/clients/${c.id}/tasks`, { title: task.title, due_date: task.due_date || null }); setTask({ title: '', due_date: '' }); tasks.reload(); }}>{t('common.add')}</button>
          </div>
        </div>
        <div className="card"><h3>{t('progress.exercises')}</h3><ExerciseHistory clientId={c.id} /></div>
      </div>
    </div>
  );
}

function ClientProgram({ clientId }: { clientId: string }) {
  const { t } = useI18n();
  const nav = useNavigate();
  const prog = useApi<any>(`/clients/${clientId}/program`);
  const templates = useApi<any[]>('/programs');
  const [tpl, setTpl] = useState('');
  const [start, setStart] = useState(todayISO());
  const [err, setErr] = useState<unknown>(null);
  return (
    <div>
      <Async q={prog}>
        {(p) => p ? (
          <div>
            <div className="row between">
              <h2>{p.name} · {t('common.version')} <span className="num">{p.version?.version_no}</span></h2>
              <Link className="btn primary" to={`/coach/programs/${p.id}`}>{t('client.editProgram')}</Link>
            </div>
            <ProgramView workouts={p.workouts} />
          </div>
        ) : <Empty>{t('client.noProgram')}</Empty>}
      </Async>
      <div className="card stack">
        <h3>{t('client.assign')}</h3>
        <Async q={templates}>
          {(list) => (
            <div className="row">
              <Select value={tpl} onChange={(e) => setTpl(e.target.value)} style={{ flex: 2 }}>
                <option value="">—</option>
                {list.filter((x) => x.status === 'active').map((x) => <option key={x.id} value={x.id}>{x.name} (v{x.versionNo})</option>)}
              </Select>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} style={{ flex: 1 }} aria-label={t('client.startDate')} />
              <button className="btn primary" disabled={!tpl} onClick={async () => {
                try { const r = await POST(`/programs/${tpl}/assign`, { clientId, startDate: start }); nav(`/coach/programs/${r.id}`); } catch (e) { setErr(e); }
              }}>{t('prog.assignTo')}</button>
            </div>
          )}
        </Async>
        {!!err && <ErrorBox error={err} />}
      </div>
    </div>
  );
}

function ClientGoals({ clientId }: { clientId: string }) {
  const { t } = useI18n();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button className="btn primary" style={{ marginBottom: '0.75rem' }} onClick={() => setOpen(true)}>{t('goal.new')}</button>
      <GoalList clientId={clientId} linkBase="/coach/goals/" />
      {open && <GoalForm clientId={clientId} onClose={() => setOpen(false)} onSaved={(id) => nav(`/coach/goals/${id}`)} />}
    </div>
  );
}

function ClientVideos({ clientId }: { clientId: string }) {
  const { t } = useI18n();
  const dateLabel = useDateLabel();
  const q = useApi<any[]>(`/clients/${clientId}/media`);
  const [fb, setFb] = useState<Record<string, string>>({});
  return (
    <Async q={q}>
      {(list) => list.length === 0 ? <Empty>{t('common.none')}</Empty> : (
        <div className="grid2">
          {list.map((m) => (
            <div key={m.id} className="card stack">
              <div className="row between"><strong>{m.title}</strong><span className="badge">{t(('lib.kind.' + m.kind) as any)}</span></div>
              <div className="tiny muted">{dateLabel(m.created_at.slice(0, 10))}</div>
              {m.status === 'ready' ? <MediaPlayer media={m} /> : <StatusBadge status="draft" />}
              {m.context?.logId && <Link className="small" to={`/coach/logs/${m.context.logId}`}>{t('training.logged')}</Link>}
              {m.kind === 'submission' && (m.coach_reviewed_at ? <span className="badge ok">{t('client.reviewed')}</span> : (
                <>
                  <TextArea value={fb[m.id] ?? ''} onChange={(e) => setFb({ ...fb, [m.id]: e.target.value })} placeholder={t('client.feedbackPlaceholder')} />
                  <button className="btn primary small" onClick={async () => { await POST(`/media/${m.id}/review`, { feedback: fb[m.id] }); q.reload(); }}>{fb[m.id]?.trim() ? t('client.reviewWithFeedback') : t('client.review')}</button>
                </>
              ))}
            </div>
          ))}
        </div>
      )}
    </Async>
  );
}

function ClientNutrition({ c, reload }: { c: any; reload: () => void }) {
  const { t } = useI18n();
  const [cfg, setCfg] = useState<NutritionConfig>(c.nutrition);
  const [saved, setSaved] = useState(false);
  return (
    <div className="grid2">
      <div className="card stack">
        <h3>{t('client.nutritionSettings')}</h3>
        <Field label={t('client.nutritionMode')}><Seg value={cfg.mode} onChange={(mode) => setCfg({ ...cfg, mode })} options={(['off', 'diary', 'targets'] as const).map((m) => ({ value: m, label: t(('nmode.' + m) as any) }))} /></Field>
        {cfg.mode === 'targets' && (
          <div className="grid3">
            {(['kcal', 'protein', 'carbs', 'fat'] as const).map((k) => <Field key={k} label={t(('nutrition.' + k) as any)}><NumInput value={cfg[k] ?? null} onChange={(v) => setCfg({ ...cfg, [k]: v })} /></Field>)}
          </div>
        )}
        <Field label={t('nutrition.guidance')}><TextArea value={cfg.guidance ?? ''} onChange={(e) => setCfg({ ...cfg, guidance: e.target.value })} /></Field>
        <p className="tiny muted">{t('nutrition.trackingNote')}</p>
        <button className="btn primary" onClick={async () => { await PUT(`/clients/${c.id}/settings`, { nutrition: cfg }); setSaved(true); reload(); }}>{saved ? t('common.saved') : t('common.save')}</button>
      </div>
      <div>{c.nutrition.mode !== 'off' ? <Diary clientId={c.id} config={c.nutrition} readOnly /> : <Empty>{t('nmode.off')}</Empty>}</div>
    </div>
  );
}
