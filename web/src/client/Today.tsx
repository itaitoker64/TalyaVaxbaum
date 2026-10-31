import { Link, useNavigate } from 'react-router';
import { useI18n } from '../i18n/index.tsx';
import { useAuth, useUser } from '../auth.tsx';
import { useApi, POST, PUT } from '../api.ts';
import { Async, StatusBadge, useDateLabel, Icon } from '../components/ui.tsx';
import { Cover, FlowLines } from '../components/imagery.tsx';
import { WorkoutCard, useLevelLabel } from '../components/cards.tsx';
import { todayISO, weekDates, dayOfWeek } from '../../../shared/dates.ts';
import { targetStatus } from '../../../shared/goals.ts';
import type { StringKey } from '../i18n/strings.ts';

export function WeekStrip({ weekStart, sessions, linkBase = '/training/session/' }: { weekStart: string; sessions: { id: string; date: string; status: string; log_status?: string | null }[]; linkBase?: string }) {
  const { t } = useI18n();
  const today = todayISO();
  return (
    <div className="weekstrip">
      {weekDates(weekStart).map((d) => {
        const s = sessions.filter((x) => x.date === d && x.status !== 'rescheduled');
        // Future days never show completion; a past planned session with nothing logged is "not logged".
        const st = s[0] ? (s[0].status === 'planned' && d < today ? 'missed' : s[0].status) : 'none';
        const cls = 'd' + (d === today ? ' today' : '');
        const label = `${t(('day.' + dayOfWeek(d)) as StringKey)} ${Number(d.slice(8))}${st !== 'none' ? ' · ' + t(('status.' + st) as StringKey) : ''}`;
        const content = (
          <>
            <span aria-hidden="true">{t(('day.' + dayOfWeek(d)) as StringKey).slice(0, 3)}</span>
            <span className="num" aria-hidden="true">{Number(d.slice(8))}</span>
            <span className={'mark ' + st} aria-hidden="true">{st === 'completed' || st === 'partial' ? <Icon name="check" size={14} /> : null}</span>
          </>
        );
        return s[0] ? <Link key={d} className={cls} to={linkBase + s[0].id} aria-label={label}>{content}</Link> : <div key={d} className={cls} aria-label={label}>{content}</div>;
      })}
    </div>
  );
}

/** Position of the latest value between baseline and target (pure arithmetic on measured data). */
function goalFraction(g: any): number | null {
  if (g.direction === 'range' || g.baseline_value == null || g.target_value == null || g.latest?.value == null) return null;
  const span = g.target_value - g.baseline_value;
  if (span === 0) return null;
  return Math.max(0, Math.min(1, (g.latest.value - g.baseline_value) / span));
}

export function Today() {
  const { t, fmtNum, fmtDate } = useI18n();
  const user = useUser();
  const { me } = useAuth();
  const nav = useNavigate();
  const dateLabel = useDateLabel();
  const levelLabel = useLevelLabel();
  const today = todayISO();
  const q = useApi<any>(`/clients/${user.id}/today?date=${today}`);

  const start = async (s: any) => {
    if (!s.log_id) await POST(`/sessions/${s.id}/start`);
    nav(`/training/session/${s.id}`);
  };

  return (
    <Async q={q}>
      {(d) => {
        const doneIds = new Set(d.practiceLogs.map((l: any) => l.media_id));
        return (
          <div className="today-page">
            <div style={{ marginBottom: '0.9rem' }}>
              <div className="eyebrow">{fmtDate(today, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
              <h1 style={{ margin: 0 }}>{t('today.hello', { name: user.name.split(' ')[0] })}</h1>
            </div>

            {d.draft && (
              <div className="card sage row between nowrap">
                <span><Icon name="timer" /> {d.draft.title}</span>
                <Link className="btn primary" to={`/training/session/${d.draft.session_id}`}>{t('today.resume')}</Link>
              </div>
            )}

            {d.feedback.length > 0 && (
              <Link to="/messages" className="card" style={{ display: 'block', textDecoration: 'none', color: 'inherit', borderInlineStart: '4px solid var(--accent)' }}>
                <div className="row between"><span className="eyebrow"><Icon name="chat" size={16} /> {t('today.feedback')} · {d.feedback[0].sender_name}</span><Icon name="chevron" size={18} /></div>
                <p className="pre" style={{ margin: '0.3rem 0 0' }}>{d.feedback[0].body}</p>
              </Link>
            )}

            {/* Main workout: one prominent image and one primary action */}
            {d.sessions.length > 0 ? d.sessions.map((s: any) => (
              <section key={s.id} className="hero" aria-label={s.title}>
                <Cover category={s.category} scrim />
                {s.status !== 'planned' && <div className="status"><StatusBadge status={s.status} /></div>}
                <div className="hero-body stack">
                  <div className="eyebrow">{t('today.mainWorkout')}{s.category ? ` · ${t(('cat.' + s.category) as StringKey)}` : ''}</div>
                  <h2 className="display">{s.title}</h2>
                  <div className="row" style={{ gap: '0.4rem' }}>
                    {s.est_minutes ? <span className="tag"><Icon name="clock" /><bdi>{s.est_minutes} {t('common.min')}</bdi></span> : null}
                    {s.level && <span className="tag"><Icon name="level" />{levelLabel(s.level)}</span>}
                    {s.equipment && <span className="tag"><Icon name="equipment" />{s.equipment.split(',')[0]}</span>}
                    <span className="tag">{t('today.items', { n: s.item_count })}</span>
                  </div>
                  {s.status === 'planned' ? (
                    <button className="btn accent big" onClick={() => start(s)}>
                      <Icon name="play" filled /> {s.log_id ? t('today.resume') : t('today.start')}
                    </button>
                  ) : (
                    <div className="row">
                      <span className="grow">{s.status === 'completed' ? t('today.done') : s.status === 'partial' ? t('today.partial') : t('today.skipped')}</span>
                      {s.log_id && <Link className="btn small" to={`/training/log/${s.log_id}`}>{t('training.view')}</Link>}
                      {s.log_id && s.status !== 'skipped' && <Link className="btn small accent" to={`/training/log/${s.log_id}/share`}><Icon name="share" size={18} />{t('share.open')}</Link>}
                    </div>
                  )}
                </div>
              </section>
            )) : (
              <section className="hero">
                <Cover category="sea" scrim showTag />
                <div className="hero-body stack">
                  <div className="eyebrow">{dateLabel(today)}</div>
                  <h2 className="display">{d.next || d.week.length ? t('today.restDay') : t('today.noProgram')}</h2>
                  {(d.next || d.week.length > 0) && <p style={{ margin: 0 }}>{t('today.restText')}</p>}
                  {d.next && <p className="small" style={{ margin: 0, opacity: 0.9 }}>{t('today.next', { title: d.next.title, date: dateLabel(d.next.date) })}</p>}
                </div>
              </section>
            )}

            {d.week.length > 0 && (
              <div className="card">
                <div className="card-title"><h3>{t('today.week')}</h3><Link to="/training" className="btn small ghost">{t('tab.training')}<Icon name="chevron" size={18} /></Link></div>
                <WeekStrip weekStart={d.weekStart} sessions={d.week} />
              </div>
            )}

            {d.practices.length > 0 && (
              <>
                <div className="section">
                  <h2>{t('today.complementary')}</h2>
                  <Link to="/training?tab=library" className="btn small ghost">{t('today.seeAll')}<Icon name="chevron" size={18} /></Link>
                </div>
                <div className="hscroll" style={{ marginBottom: '1rem' }}>
                  {d.practices.map((p: any) => (
                    <WorkoutCard key={p.id} to={`/training/practice/${p.id}`} title={p.title} category={p.category} coverMediaId={p.cover_media_id}
                      minutes={p.duration_sec ? Math.round(p.duration_sec / 60) : null} level={p.level} status={doneIds.has(p.id) ? 'done-today' : null} hasVideo={p.hasVideo} />
                  ))}
                </div>
              </>
            )}

            {d.checkinDue && (
              <div className="card sage row between nowrap">
                <span>{t('today.checkinDue')}</span>
                <Link className="btn primary small" to="/checkin">{t('today.checkinCta')}</Link>
              </div>
            )}

            {d.goals.length > 0 && (
              <div className="card">
                <div className="card-title"><h3><Icon name="target" size={18} /> {t('today.goals')}</h3><Link to="/progress" className="btn small ghost">{t('tab.progress')}<Icon name="chevron" size={18} /></Link></div>
                {d.goals.map((g: any, i: number) => {
                  const st = targetStatus({ direction: g.direction, baselineValue: g.baseline_value, targetValue: g.target_value, targetMin: g.target_min, targetMax: g.target_max }, g.latest?.value);
                  const f = goalFraction(g);
                  return (
                    <Link key={g.id} className="goalrow" to={`/progress/goal/${g.id}`} style={{ borderTop: i ? '1px solid var(--line)' : undefined }}>
                      <span className="bold">{g.title}</span>
                      <span className="small">
                        {st === 'reached' ? <span className="badge ok"><Icon name="check" />{t('progress.reached')}</span>
                          : g.latest ? <bdi className="bold">{fmtNum(g.latest.value)} {g.unit}</bdi> : <span className="muted">{t('progress.noData')}</span>}
                      </span>
                      {f != null && (
                        <>
                          <span className="goalbar" role="img" aria-label={`${t('progress.baseline')} ${fmtNum(g.baseline_value)}, ${t('progress.latest')} ${fmtNum(g.latest.value)}, ${t('progress.target')} ${fmtNum(g.target_value)} ${g.unit ?? ''}`}>
                            <i style={{ width: `${f * 100}%` }} />
                          </span>
                          <span className="goalends"><bdi>{t('progress.baseline')} {fmtNum(g.baseline_value)}</bdi><bdi>{t('progress.target')} {fmtNum(g.target_value)}</bdi></span>
                        </>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}

            {d.tasks.length > 0 && (
              <div className="card">
                <h3>{t('today.tasks')}</h3>
                <ul className="list">
                  {d.tasks.map((task: any) => (
                    <li key={task.id}>
                      <label className="check">
                        <input type="checkbox" onChange={async (e) => { await PUT(`/tasks/${task.id}`, { done: e.target.checked }); q.reload(); }} />
                        <span>{task.title}{task.due_date && <span className="tiny muted"> · {dateLabel(task.due_date)}</span>}{task.notes && <div className="tiny muted">{task.notes}</div>}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {d.nutrition && (
              <Link to="/nutrition" className="card" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
                <div className="card-title"><h3><Icon name="nutrition" size={18} /> {t('today.nutrition')}</h3><Icon name="chevron" size={18} /></div>
                <div className="grid3 small">
                  <MacroStat label={t('nutrition.kcal')} v={d.nutrition.totals.kcal} target={d.nutrition.config.mode === 'targets' ? d.nutrition.config.kcal : null} fmt={fmtNum} />
                  <MacroStat label={t('nutrition.protein')} v={d.nutrition.totals.protein} target={d.nutrition.config.mode === 'targets' ? d.nutrition.config.protein : null} fmt={fmtNum} unit="g" />
                </div>
                {d.nutrition.entryCount === 0 && <div className="tiny muted">{t('nutrition.empty')}</div>}
              </Link>
            )}

            <div className="card soft" style={{ position: 'relative', overflow: 'hidden' }}>
              <FlowLines color="#7e9471" opacity={0.35} />
              <div className="row small muted" style={{ justifyContent: 'center', position: 'relative', zIndex: 2 }}>
                {me?.responseExpectation && <span>{t('today.coachReply', { text: me.responseExpectation })}</span>}
                {me?.whatsappUrl && <a href={me.whatsappUrl} target="_blank" rel="noreferrer noopener">{t('today.whatsapp')} ↗</a>}
              </div>
            </div>
          </div>
        );
      }}
    </Async>
  );
}

export function MacroStat({ label, v, target, unit, fmt }: { label: string; v: number; target?: number | null; unit?: string; fmt: (n: number) => string }) {
  const { t } = useI18n();
  return (
    <div>
      <div className="label">{label}</div>
      <div className="value"><bdi>{fmt(v)}{unit ?? ''}</bdi></div>
      {target ? (
        <>
          <div className="macro" aria-hidden="true"><div style={{ width: Math.min(100, (v / target) * 100) + '%' }} /></div>
          <div className="tiny muted">{t('nutrition.target', { v: fmt(target) + (unit ?? '') })}</div>
        </>
      ) : null}
    </div>
  );
}
