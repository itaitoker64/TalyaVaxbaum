import { useState, type FormEvent } from 'react';
import { useParams, Navigate } from 'react-router';
import { useI18n } from '../i18n/index.tsx';
import { useAuth } from '../auth.tsx';
import { POST, useApi, ApiError } from '../api.ts';
import { Field, Input, Loading, errorText } from '../components/ui.tsx';

function Shell({ children }: { children: React.ReactNode }) {
  const { t, locale, setLocale } = useI18n();
  return (
    <div className="main" style={{ maxWidth: 440, paddingTop: '3rem' }}>
      <div className="center" style={{ marginBottom: '1.5rem' }}>
        <div className="brand-mark" style={{ width: 56, height: 56, fontSize: '1.5rem', margin: '0 auto 0.75rem' }}>T</div>
        <h1>{t('app.name')}</h1>
        <p className="muted">{t('app.tagline')}</p>
      </div>
      {children}
      <div className="center" style={{ marginTop: '1rem' }}>
        <button className="btn ghost small" onClick={() => setLocale(locale === 'he' ? 'en' : 'he')}>{locale === 'he' ? 'English' : 'עברית'}</button>
      </div>
    </div>
  );
}

export function Login() {
  const { t } = useI18n();
  const { me, reload } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (me?.user) return <Navigate to={me.user.role === 'coach' ? '/coach' : '/'} replace />;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await POST('/auth/login', { email, password });
      await reload();
    } catch (e) {
      const a = e as ApiError;
      setErr(a.code === 'invalid_credentials' ? t('auth.invalid') : a.code === 'too_many_attempts' ? t('auth.tooMany') : errorText(t, e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell>
      <form className="card stack" onSubmit={submit}>
        <Field label={t('auth.email')}><Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label={t('auth.password')}><Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        {err && <div className="alert error">{err}</div>}
        <button className="btn primary big" disabled={busy}>{t('auth.login')}</button>
        <p className="tiny muted center">{t('auth.noAccount')}</p>
      </form>
    </Shell>
  );
}

export function Join() {
  const { code } = useParams();
  const { t, locale } = useI18n();
  const { reload } = useAuth();
  const inv = useApi<{ coachName: string; name: string | null }>(`/invites/${code}`);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  if (done) return <Navigate to="/onboarding" replace />;
  if (inv.loading) return <Shell><Loading /></Shell>;
  if (inv.error) return <Shell><div className="alert error">{t('auth.invalidInvite')}</div></Shell>;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await POST('/auth/register', { code, name: form.name || inv.data?.name, email: form.email, password: form.password, locale });
      await reload();
      setDone(true);
    } catch (e) {
      const a = e as ApiError;
      setErr(a.code === 'email_taken' ? t('auth.emailTaken') : a.code === 'invalid_invite' ? t('auth.invalidInvite') : errorText(t, e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell>
      <form className="card stack" onSubmit={submit}>
        <h2>{t('auth.joinTitle', { coach: inv.data!.coachName })}</h2>
        <Field label={t('common.name')}><Input required defaultValue={inv.data?.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" /></Field>
        <Field label={t('auth.email')}><Input type="email" required autoComplete="email" onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label={t('auth.password')} hint={t('auth.passwordHint')}><Input type="password" required minLength={8} autoComplete="new-password" onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        {err && <div className="alert error">{err}</div>}
        <button className="btn primary big" disabled={busy}>{t('auth.join')}</button>
      </form>
    </Shell>
  );
}
