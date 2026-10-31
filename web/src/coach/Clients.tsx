import { useState } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../i18n/index.tsx';
import { useApi, POST } from '../api.ts';
import { Async, Empty, Field, Input, Seg, ErrorBox, DemoBadge, useDateLabel } from '../components/ui.tsx';

export function Clients() {
  const { t } = useI18n();
  const dateLabel = useDateLabel();
  const q = useApi<any[]>('/clients');
  const [inviteOpen, setInviteOpen] = useState(false);
  return (
    <div>
      <div className="row between"><h1>{t('coach.clients')}</h1><button className="btn primary" onClick={() => setInviteOpen(!inviteOpen)}>{t('coach.invite')}</button></div>
      {inviteOpen && <Invite />}
      <Async q={q}>
        {(list) => list.length === 0 ? <Empty>{t('common.none')}</Empty> : (
          <div className="grid2">
            {list.map((c) => (
              <Link key={c.id} to={`/coach/clients/${c.id}`} className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="row between"><strong>{c.name}</strong><span className="row"><DemoBadge show={c.is_demo} /><span className="badge">{c.track}</span></span></div>
                <div className="small muted">{t('coach.last7', { done: c.last7.done, planned: c.last7.planned })}</div>
                <div className="small muted">{c.lastWorkout ? t('coach.lastWorkout', { date: dateLabel(c.lastWorkout) }) : '—'}</div>
                {!c.onboarding_completed_at && <span className="badge warn">{t('coach.onboardingPending')}</span>}
                {c.status === 'paused' && <span className="badge">paused</span>}
              </Link>
            ))}
          </div>
        )}
      </Async>
    </div>
  );
}

function Invite() {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [track, setTrack] = useState<'A' | 'B'>('A');
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  return (
    <div className="card stack">
      <Field label={t('common.name')}><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label={t('coach.track')}><Seg value={track} onChange={setTrack} options={[{ value: 'A', label: t('track.A') }, { value: 'B', label: t('track.B') }]} /></Field>
      <button className="btn primary" onClick={async () => { try { const r = await POST('/invites', { name: name || undefined, track }); setLink(`${location.origin}/join/${r.code}`); } catch (e) { setErr(e); } }}>{t('coach.invite')}</button>
      {link && (
        <div className="alert ok">
          <div className="small">{t('coach.inviteLink')}</div>
          <div className="row nowrap"><code className="grow num" style={{ overflowWrap: 'anywhere' }}>{link}</code><button className="btn small" onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); }}>{copied ? t('coach.copied') : t('coach.copy')}</button></div>
        </div>
      )}
      {!!err && <ErrorBox error={err} />}
    </div>
  );
}
