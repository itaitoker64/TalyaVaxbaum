import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.tsx';
import { useAuth, useUser } from '../auth.tsx';
import { useApi, POST } from '../api.ts';
import { Async, Empty, TextArea, ErrorBox, useDateLabel } from '../components/ui.tsx';
import type { StringKey } from '../i18n/strings.ts';

export function Messages({ clientId: cidProp }: { clientId?: string }) {
  const { t } = useI18n();
  const user = useUser();
  const { me } = useAuth();
  const clientId = cidProp ?? user.id;
  const q = useApi<any[]>(`/clients/${clientId}/messages`);
  const [body, setBody] = useState('');
  const [err, setErr] = useState<unknown>(null);
  const dateLabel = useDateLabel();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (q.data) {
      POST(`/clients/${clientId}/messages/read`).catch(() => undefined);
      end.current?.scrollIntoView({ block: 'end' });
    }
  }, [q.data, clientId]);
  const send = async () => {
    if (!body.trim()) return;
    try {
      await POST(`/clients/${clientId}/messages`, { body });
      setBody('');
      q.reload();
    } catch (e) {
      setErr(e);
    }
  };
  return (
    <div>
      {!cidProp && <header className="page-intro"><h1>{t('messages.title', { name: me?.coachName ?? '' })}</h1></header>}
      {user.role === 'client' && me?.responseExpectation && <div className="card soft small">{t('today.coachReply', { text: me.responseExpectation })}</div>}
      <Async q={q}>
        {(msgs) => msgs.length === 0 ? <Empty>{t('messages.empty')}</Empty> : (
          <div className="chatlist card" role="log" aria-label={t('client.messages')} style={{ marginBottom: '1rem' }}>
            {msgs.map((m) => (
              <div key={m.id} className={'bubble' + (m.sender_id === user.id ? ' mine' : '')}>
                {m.ref_type && <div className="tiny muted">{t('messages.about', { what: t(('ref.' + m.ref_type) as StringKey) })}</div>}
                {m.body}
                <div className="tiny muted">{m.sender_name} · {dateLabel(m.created_at.slice(0, 10))} <bdi>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</bdi></div>
              </div>
            ))}
            <div ref={end} />
          </div>
        )}
      </Async>
      <div className="card stack">
        <TextArea aria-label={t('messages.placeholder')} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t('messages.placeholder')} />
        {!!err && <ErrorBox error={err} />}
        <button className="btn primary" onClick={send} disabled={!body.trim()}>{t('common.send')}</button>
      </div>
    </div>
  );
}
