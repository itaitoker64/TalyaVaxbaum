import { Link, useSearchParams } from 'react-router';
import { useState } from 'react';
import { useI18n } from '../i18n/index.tsx';
import { useAuth, useUser } from '../auth.tsx';
import { PUT, POST } from '../api.ts';
import { Field, Input, Seg, ErrorBox } from '../components/ui.tsx';

export function Account() {
  const { t, locale, setLocale } = useI18n();
  const user = useUser();
  const [params] = useSearchParams();
  const { logout, reload } = useAuth();
  const [name, setName] = useState(user.name);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  return (
    <div className="main" style={{ padding: 0 }}>
      <h1>{t('settings.profile')}</h1>
      {params.get('questionnaire') === 'saved' && <p role="status" className="alert ok">{t('onb.saved')}</p>}
      {user.role === 'client' && <section className="card stack">
        <h2>{t('onb.settingsTitle')}</h2><p className="muted">{t('onb.editIntro')}</p>
        <Link className="btn" to="/onboarding">{t('onb.open')}</Link>
      </section>}
      <div className="card stack">
        <Field label={t('common.name')}><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label={t('common.language')}>
          <Seg value={locale} onChange={(l) => { setLocale(l); PUT('/auth/me', { locale: l }); }} options={[{ value: 'he', label: 'עברית' }, { value: 'en', label: 'English' }]} />
        </Field>
        <button className="btn primary" onClick={async () => { await PUT('/auth/me', { name }); await reload(); setMsg(t('common.saved')); }}>{t('common.save')}</button>
      </div>
      <div className="card stack">
        <Field label={t('auth.password')}><Input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
        <Field label={t('auth.password') + ' (new)'} hint={t('auth.passwordHint')}><Input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
        <button className="btn" disabled={pw.next.length < 8} onClick={async () => { try { await POST('/auth/password', pw); setPw({ current: '', next: '' }); setMsg(t('common.saved')); } catch (e) { setErr(e); } }}>{t('common.save')}</button>
      </div>
      {msg && <div className="alert ok">{msg}</div>}
      {!!err && <ErrorBox error={err} />}
      <button className="btn danger" onClick={logout}>{t('common.logout')}</button>
      <p className="tiny muted" style={{ marginTop: '1rem' }}>{user.email} · {user.role}</p>
    </div>
  );
}
