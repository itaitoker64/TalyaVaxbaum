import { useState } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../i18n/index.tsx';
import { useAuth, useUser } from '../auth.tsx';
import { useApi } from '../api.ts';
import { Async, Seg, Empty, Select, useDateLabel, N, Parts } from '../components/ui.tsx';
import { AdherenceBars, MiniLine } from '../components/charts.tsx';
import { targetStatus } from '../../../shared/goals.ts';
import { weeklyAdherence } from '../../../shared/schedule.ts';
import { todayISO, addDays, weekStart } from '../../../shared/dates.ts';
import { topSet, actualParts } from '../shared/format.ts';
import { CheckinList } from './Checkin.tsx';
import type { StringKey } from '../i18n/strings.ts';

export function GoalList({ clientId, linkBase }: { clientId: string; linkBase: string }) {
  const { t, fmtNum } = useI18n();
  const q = useApi<any[]>(`/clients/${clientId}/goals`);
  return (
    <Async q={q}>
      {(goals) => goals.length === 0 ? <Empty>{t('progress.noGoals')}</Empty> : (
        <div className="grid2">
          {goals.map((g) => {
            const st = targetStatus({ direction: g.direction, baselineValue: g.baseline_value, targetValue: g.target_value, targetMin: g.target_min, targetMax: g.target_max }, g.latest?.value);
            return (
              <Link key={g.id} to={linkBase + g.id} className="card" style={{ textDecoration: 'none', color: 'inherit', opacity: g.status === 'active' ? 1 : 0.65 }}>
                <div className="row between"><strong>{g.title}</strong><span className="badge">{t(('kind.' + g.kind) as StringKey)}</span></div>
                {g.kind === 'quality' ? <div className="small muted">{t('progress.qualityNote')}</div> : g.kind === 'adherence' ? <div className="small muted">{t('progress.calculated')}</div> : (
                  <div className="row small" style={{ marginTop: 6 }}>
                    <span className="muted">{t('progress.baseline')}: <N>{fmtNum(g.baseline_value)}</N></span>
                    <span className="muted">{t('progress.target')}: <N>{g.direction === 'range' ? `${fmtNum(g.target_min)}–${fmtNum(g.target_max)}` : fmtNum(g.target_value)}</N> {g.unit}</span>
                    {g.latest && <span className="bold">{t('progress.latest')}: <N>{fmtNum(g.latest.value)}</N></span>}
                  </div>
                )}
                {st === 'reached' && <span className="badge ok" style={{ marginTop: 6 }}>{t('progress.reached')}</span>}
                {g.status !== 'active' && <span className="badge">{g.status}</span>}
              </Link>
            );
          })}
        </div>
      )}
    </Async>
  );
}

export function AdherenceCard({ clientId }: { clientId: string }) {
  const { t } = useI18n();
  const { me } = useAuth();
  const today = todayISO();
  const from = weekStart(addDays(today, -7 * 7), me?.weekStartDay ?? 0);
  const q = useApi<any[]>(`/clients/${clientId}/schedule?from=${from}&to=${addDays(weekStart(today, me?.weekStartDay ?? 0), 6)}`);
  return (
    <div className="card">
      <h3>{t('progress.adherence')}</h3>
      <Async q={q}>{(s) => <AdherenceBars weeks={weeklyAdherence(s, today, me?.weekStartDay ?? 0)} />}</Async>
    </div>
  );
}

export function ExerciseHistory({ clientId }: { clientId: string }) {
  const { t, fmtNum } = useI18n();
  const dateLabel = useDateLabel();
  const list = useApi<any[]>(`/clients/${clientId}/exercise-history`);
  const [ex, setEx] = useState<string>('');
  const hist = useApi<any[]>(ex ? `/clients/${clientId}/exercise-history?exerciseId=${ex}` : null);
  return (
    <Async q={list}>
      {(exercises) => exercises.length === 0 ? <Empty>{t('common.none')}</Empty> : (
        <div className="card stack">
          <Select value={ex} onChange={(e) => setEx(e.target.value)}>
            <option value="">{t('training.exerciseHistory')}…</option>
            {exercises.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.n})</option>)}
          </Select>
          {ex && (
            <Async q={hist}>
              {(rows) => {
                const lt = exercises.find((e) => e.id === ex)?.log_type;
                const pts = lt === 'strength'
                  ? rows.map((r) => ({ r, top: topSet(r.data) })).filter((x) => x.top).map(({ r, top }) => ({ date: r.date, value: top!.weight, label: `${top!.reps}` }))
                  : lt === 'running' ? rows.filter((r) => r.data.distanceKm).map((r) => ({ date: r.date, value: r.data.distanceKm })) : [];
                return (
                  <>
                    {pts.length > 0 && <MiniLine points={pts} unit={lt === 'strength' ? 'kg' : 'km'} />}
                    <table className="table">
                      <tbody>
                        {[...rows].reverse().map((r) => (
                          <tr key={r.id}>
                            <td className="small">{dateLabel(r.date)}</td>
                            <td className="small"><Parts parts={actualParts(r.data, lt, t)} sep=", " /></td>
                            <td className="tiny muted">{r.substituted ? t('training.swap') : ''}{r.notes ? ' 💬' : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="tiny muted">{t('progress.best')}: <N>{fmtNum(Math.max(...pts.map((p) => p.value), 0))}</N></div>
                  </>
                );
              }}
            </Async>
          )}
        </div>
      )}
    </Async>
  );
}

export function Progress() {
  const { t } = useI18n();
  const user = useUser();
  const [tab, setTab] = useState<'goals' | 'performance' | 'checkins'>('goals');
  return (
    <div>
      <div className="row between" style={{ marginBottom: '0.75rem' }}>
        <h1 style={{ margin: 0 }}>{t('tab.progress')}</h1>
        <Seg value={tab} onChange={setTab} options={[{ value: 'goals', label: t('progress.goals') }, { value: 'performance', label: t('progress.exercises') }, { value: 'checkins', label: t('progress.checkins') }]} />
      </div>
      {tab === 'goals' && <><GoalList clientId={user.id} linkBase="/progress/goal/" /><AdherenceCard clientId={user.id} /></>}
      {tab === 'performance' && <ExerciseHistory clientId={user.id} />}
      {tab === 'checkins' && <><Link to="/checkin" className="btn primary" style={{ marginBottom: '0.75rem' }}>{t('checkin.title')}</Link><CheckinList clientId={user.id} /></>}
    </div>
  );
}
