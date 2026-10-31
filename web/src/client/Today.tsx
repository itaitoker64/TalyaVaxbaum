import { Link, useNavigate } from 'react-router';
import { useI18n } from '../i18n/index.tsx';
import { useAuth, useUser } from '../auth.tsx';
import { useApi, POST, PUT } from '../api.ts';
import { Async, StatusBadge, N, useDateLabel, Icon } from '../components/ui.tsx';
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
        const st = s[0]?.status ?? 'none';
        const cls = 'd' + (d === today ? ' today' : '');
        const content = (
          <>
            <div>{t(('day.' + dayOfWeek(d)) as StringKey).slice(0, 3)}</div>
            <div className="num">{Number(d.slice(8))}</div>
            {/* Future days never show completion; only real statuses are drawn. */}
            <div className={'dot ' + (st === 'planned' && d < today ? 'planned' : st)} title={st !== 'none' ? t(('status.' + st) as StringKey) : ''} />
          </>
        );
        return s[0] ? <Link key={d} className={cls} to={linkBase + s[0].id}>{content}</Link> : <div key={d} className={cls}>{content}</div>;
      })}
    </div>
  );
}

export function Today() {
  const { t, fmtNum } = useI18n();
  const user = useUser();
  const { me } = useAuth();
  const nav = useNavigate();
  const dateLabel = useDateLabel();
  const today = todayISO();
  const q = useApi<any>(`/clients/${user.id}/today?date=${today}`);

  const start = async (sid: string) => {
    const r = await POST(`/sessions/${sid}/start`);
    nav(`/training/session/${sid}?log=${r.logId}`);
  };

  return (
    <Async q={q}>
      {(d) => (
        <div>
          <h1>{t('today.hello', { name: user.name.split(' ')[0] })}</h1>

          {d.draft && (
            <div className="card sage row between">
              <span>{d.draft.title}</span>
              <Link className="btn primary" to={`/training/session/${d.draft.session_id}`}>{t('today.resume')}</Link>
            </div>
          )}

          {d.feedback.length > 0 && (
            <div className="card hero">
              <div className="card-title"><h3>{t('today.feedback')}</h3><Link to="/messages" className="btn small ghost">{t('common.open')}</Link></div>
              {d.feedback.slice(0, 2).map((f: any) => (
                <p key={f.id} className="pre">{f.body}</p>
              ))}
            </div>
          )}

          {/* Today's session(s) — the main action */}
          {d.sessions.length > 0 ? (
            d.sessions.map((s: any) => (
              <div key={s.id} className="card">
                <div className="card-title">
                  <h2>{s.title}</h2>
                  {s.status !== 'planned' && <StatusBadge status={s.status} />}
                </div>
                <div className="row small muted" style={{ marginBottom: '0.75rem' }}>
                  {s.category && <span>{t(('cat.' + s.category) as StringKey)}</span>}
                  {s.est_minutes && <span><N>{s.est_minutes}</N> {t('common.min')}</span>}
                  <span>{t('today.items', { n: s.item_count })}</span>
                </div>
                {s.status === 'planned' ? (
                  <button className="btn primary big" onClick={() => (s.log_id ? nav(`/training/session/${s.id}`) : start(s.id))}>
                    <Icon name="play" /> {s.log_id ? t('today.resume') : t('today.start')}
                  </button>
                ) : (
                  <div className="row between">
                    <span>{s.status === 'completed' ? t('today.done') : s.status === 'partial' ? t('today.partial') : t('today.skipped')}</span>
                    {s.log_id && <Link className="btn small" to={`/training/log/${s.log_id}`}>{t('training.view')}</Link>}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="card hero">
              <h2>{d.next || d.week.length ? t('today.restDay') : t('today.noProgram')}</h2>
              {(d.next || d.week.length > 0) && <p className="muted">{t('today.restText')}</p>}
              {d.next && <p className="small">{t('today.next', { title: d.next.title, date: dateLabel(d.next.date) })}</p>}
            </div>
          )}

          {d.week.length > 0 && (
            <div className="card">
              <div className="card-title"><h3>{t('today.week')}</h3><Link to="/training" className="btn small ghost">{t('tab.training')}</Link></div>
              <WeekStrip weekStart={d.weekStart} sessions={d.week} />
            </div>
          )}

          {d.checkinDue && (
            <div className="card sage row between">
              <span>{t('today.checkinDue')}</span>
              <Link className="btn primary small" to="/checkin">{t('today.checkinCta')}</Link>
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
                      <span>
                        {task.title}
                        {task.due_date && <span className="tiny muted"> · {dateLabel(task.due_date)}</span>}
                        {task.notes && <div className="tiny muted">{task.notes}</div>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {d.nutrition && (
            <Link to="/nutrition" className="card listlink" style={{ display: 'block' }}>
              <div className="card-title"><h3>{t('today.nutrition')}</h3></div>
              <div className="grid3 small">
                <MacroStat label={t('nutrition.kcal')} v={d.nutrition.totals.kcal} target={d.nutrition.config.mode === 'targets' ? d.nutrition.config.kcal : null} fmt={fmtNum} />
                <MacroStat label={t('nutrition.protein')} v={d.nutrition.totals.protein} target={d.nutrition.config.mode === 'targets' ? d.nutrition.config.protein : null} fmt={fmtNum} unit="g" />
              </div>
              {d.nutrition.entryCount === 0 && <div className="tiny muted">{t('nutrition.empty')}</div>}
            </Link>
          )}

          {d.goals.length > 0 && (
            <div className="card">
              <div className="card-title"><h3>{t('today.goals')}</h3><Link to="/progress" className="btn small ghost">{t('tab.progress')}</Link></div>
              <ul className="list">
                {d.goals.map((g: any) => {
                  const st = targetStatus({ direction: g.direction, baselineValue: g.baseline_value, targetValue: g.target_value, targetMin: g.target_min, targetMax: g.target_max }, g.latest?.value);
                  return (
                    <li key={g.id}>
                      <Link className="listlink" to={`/progress/goal/${g.id}`}>
                        <span className="grow">{g.title}</span>
                        {g.latest && <span className="num bold">{fmtNum(g.latest.value)} {g.unit}</span>}
                        {st === 'reached' && <span className="badge ok">{t('progress.reached')}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="row small muted" style={{ justifyContent: 'center' }}>
            {me?.responseExpectation && <span>{t('today.coachReply', { text: me.responseExpectation })}</span>}
            {me?.whatsappUrl && <a href={me.whatsappUrl} target="_blank" rel="noreferrer noopener">{t('today.whatsapp')} ↗</a>}
          </div>
        </div>
      )}
    </Async>
  );
}

export function MacroStat({ label, v, target, unit, fmt }: { label: string; v: number; target?: number | null; unit?: string; fmt: (n: number) => string }) {
  const { t } = useI18n();
  return (
    <div>
      <div className="muted tiny">{label}</div>
      <div className="bold"><span className="num">{fmt(v)}{unit ?? ''}</span></div>
      {target ? (
        <>
          <div className="macro" aria-hidden="true"><div style={{ width: Math.min(100, (v / target) * 100) + '%' }} /></div>
          <div className="tiny muted">{t('nutrition.target', { v: fmt(target) + (unit ?? '') })}</div>
        </>
      ) : null}
    </div>
  );
}
