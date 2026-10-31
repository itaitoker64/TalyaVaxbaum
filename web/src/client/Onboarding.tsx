import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useI18n } from '../i18n/index.tsx';
import { useAuth, useUser } from '../auth.tsx';
import { PUT } from '../api.ts';
import { Field, TextArea, ErrorBox } from '../components/ui.tsx';

export function Onboarding() {
  const { t } = useI18n();
  const user = useUser();
  const { reload } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ goals: '', experience: '', availability: '', daysPerWeek: 3 as number | null, equipment: '', considerations: '', nutritionInterest: '', consent: false });
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  if (user.role !== 'client') return <Navigate to="/coach" replace />;
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await PUT(`/clients/${user.id}/onboarding`, { ...f, consent: true });
      await reload();
      nav('/', { replace: true });
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
        <p className="muted">{t('onb.intro')}</p>
        <Field label={t('onb.goals')}><TextArea value={f.goals} onChange={set('goals')} required /></Field>
        <Field label={t('onb.experience')}><TextArea value={f.experience} onChange={set('experience')} /></Field>
        <Field label={t('onb.availability')}><TextArea value={f.availability} onChange={set('availability')} /></Field>
        <Field label={t('onb.daysPerWeek')}>
          <div className="seg">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <button type="button" key={n} className={f.daysPerWeek === n ? 'on' : ''} onClick={() => setF({ ...f, daysPerWeek: n })}><span className="num">{n}</span></button>
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
        <button className="btn primary big" disabled={busy || !f.consent}>{t('onb.submit')}</button>
      </form>
    </div>
  );
}
