import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/index.tsx';
import { useAuth } from '../auth.tsx';
import { useApi, PUT } from '../api.ts';
import { Async, Field, Input, Select, ErrorBox } from '../components/ui.tsx';
import type { StringKey } from '../i18n/strings.ts';
import { CATEGORIES } from '../../../shared/types.ts';
import { Cover } from '../components/imagery.tsx';
import { Uploader } from '../components/media.tsx';

export function CoachSettings() {
  const { t } = useI18n();
  const { reload } = useAuth();
  const q = useApi<any>('/coach/settings');
  const [s, setS] = useState({ response_expectation: '', whatsapp_url: '', week_start_day: 0 });
  const [msg, setMsg] = useState(false);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [err, setErr] = useState<unknown>(null);
  useEffect(() => {
    if (q.data) setCovers(q.data.covers ?? {});
    if (q.data) setS({ response_expectation: q.data.response_expectation ?? '', whatsapp_url: q.data.whatsapp_url ?? '', week_start_day: q.data.week_start_day ?? 0 });
  }, [q.data]);
  return (
    <Async q={q}>
      {() => (
        <div className="card stack" style={{ maxWidth: 620 }}>
          <h1>{t('coach.settings')}</h1>
          <Field label={t('settings.responseExpectation')}><Input value={s.response_expectation} onChange={(e) => setS({ ...s, response_expectation: e.target.value })} placeholder="e.g. Sun–Thu, within 24–48h" /></Field>
          <Field label={t('settings.whatsapp')}><Input type="url" value={s.whatsapp_url} onChange={(e) => setS({ ...s, whatsapp_url: e.target.value })} placeholder="https://chat.whatsapp.com/…" /></Field>
          <Field label={t('settings.weekStart')}><Select value={s.week_start_day} onChange={(e) => setS({ ...s, week_start_day: Number(e.target.value) })}>{[0, 1, 6].map((d) => <option key={d} value={d}>{t(('day.' + d) as StringKey)}</option>)}</Select></Field>
          <div className="divider" />
          <h3>{t('settings.covers')}</h3>
          <p className="tiny muted">{t('settings.coversHint')}</p>
          <div className="wgrid">
            {CATEGORIES.map((c) => (
              <div key={c} className="wcard" style={{ cursor: 'default' }}>
                <Cover category={c} mediaId={covers[c] ?? null} />
                <div className="wbody">
                  <div className="wtitle">{t(('cat.' + c) as StringKey)}</div>
                  <Uploader createPath="/media" meta={{ kind: 'other', title: `cover — ${c}` }} accept="image/*" label={t('recipe.photo')}
                    onDone={(id) => setCovers({ ...covers, [c]: id })} />
                </div>
              </div>
            ))}
          </div>
          {!!err && <ErrorBox error={err} />}
          {msg && <div className="alert ok">{t('common.saved')}</div>}
          <button className="btn primary" onClick={async () => { try { await PUT('/coach/settings', { ...s, covers, response_expectation: s.response_expectation || null, whatsapp_url: s.whatsapp_url || null }); setMsg(true); reload(); } catch (e) { setErr(e); } }}>{t('common.save')}</button>
        </div>
      )}
    </Async>
  );
}
