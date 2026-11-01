import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, Link } from 'react-router';
import { useI18n } from '../i18n/index.tsx';
import { useAuth, useUser } from '../auth.tsx';
import { PUT, useApi } from '../api.ts';
import { Field, TextArea, ErrorBox, Async } from '../components/ui.tsx';

export function Onboarding() {
  const user = useUser();
  const q = useApi<any>(user.role === 'client' ? `/clients/${user.id}` : null);
  if (user.role !== 'client') return <Navigate to="/coach" replace />;
  return <Async q={q}>{data => <Questionnaire initial={data.onboarding} editing={!!data.onboardingCompletedAt} />}</Async>;
}

function Questionnaire({ initial, editing }: { initial: any; editing: boolean }) {
  const { t } = useI18n();
  const user = useUser();
  const { reload } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ goals: '', experience: '', availability: '', daysPerWeek: 3 as number | null, equipment: '', considerations: '', nutritionInterest: '', consent: false, ...(initial ?? {}) });
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  if (user.role !== 'client') return <Navigate to="/coach" replace />;
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await PUT(`/clients/${user.id}/onboarding`, f);
      await reload();
      nav(editing ? '/account?questionnaire=saved' : '/', { replace: true });
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="main" style={{ maxWidth: 620 }}>
      <form className="card stack" onSubmit={submit}>
        <h1>{t('onb.title')}</h1>
        <p className="muted">{t(editing ? 'onb.editIntro' : 'onb.intro')}</p>
        <Field label={t('onb.goals')}><TextArea value={f.goals} onChange={set('goals')} required /></Field>
        <Field label={t('onb.experience')}><TextArea value={f.experience} onChange={set('experience')} /></Field>
        <Field label={t('onb.availability')}><TextArea value={f.availability} onChange={set('availability')} /></Field>
        <Field label={t('onb.daysPerWeek')}>
          <div className="seg">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <button type="button" key={n} aria-pressed={f.daysPerWeek === n} aria-label={`${t('onb.daysPerWeek')}: ${n}`} className={f.daysPerWeek === n ? 'on' : ''} onClick={() => setF({ ...f, daysPerWeek: n })}><span className="num">{n}</span></button>
            ))}
          </div>
        </Field>
        <Field label={t('onb.equipment')}><TextArea value={f.equipment} onChange={set('equipment')} /></Field>
        <Field label={t('onb.considerations')}><TextArea value={f.considerations} onChange={set('considerations')} /></Field>
        <Field label={t('onb.nutrition')}><TextArea value={f.nutritionInterest} onChange={set('nutritionInterest')} /></Field>
        <label className="check">
          <input type="checkbox" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} required />
          <span className="small">{t('onb.consent')}</span>
        </label>
        {!!err && <ErrorBox error={err} />}
        <button className="btn primary big" disabled={busy || !f.consent}>{t(editing ? 'common.save' : 'onb.submit')}</button>
        {editing && <Link className="btn ghost" to="/account">{t('common.cancel')}</Link>}
      </form>
    </div>
  );
}
