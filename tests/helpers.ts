import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, insert, now, newId, type DB } from '../server/db.ts';
import { createApp } from '../server/app.ts';
import { LocalStorage } from '../server/storage.ts';
import { hashPassword } from '../server/auth.ts';

export function setup() {
  const db = openDb(':memory:');
  const storage = new LocalStorage(mkdtempSync(join(tmpdir(), 'mbt-')));
  const app = createApp(db, storage);
  return { db, app };
}

export async function makeCoach(db: DB, email = 'coach@example.com', password = 'coach-password-1') {
  const id = newId();
  insert(db, 'users', { id, email, name: 'Coach ' + email, password_hash: await hashPassword(password), role: 'coach', locale: 'he', created_at: now() });
  insert(db, 'coach_settings', { coach_id: id, week_start_day: 0, updated_at: now() });
  return { id, email, password };
}

/** Minimal cookie-keeping client around app.request(). */
export class Client {
  cookie = '';
  constructor(private app: ReturnType<typeof createApp>) {}
  async req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const h: Record<string, string> = { 'x-csrf': '1', ...headers };
    if (this.cookie) h.cookie = this.cookie;
    let payload: BodyInit | undefined;
    if (body instanceof Uint8Array) payload = body as any;
    else if (body !== undefined) {
      h['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await this.app.request('/api' + path, { method, headers: h, body: payload });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    const text = await res.text();
    let data: any = text;
    try { data = JSON.parse(text); } catch { /* binary or empty */ }
    return { status: res.status, data, headers: res.headers };
  }
  get = (p: string) => this.req('GET', p);
  post = (p: string, b: unknown = {}) => this.req('POST', p, b);
  put = (p: string, b: unknown = {}) => this.req('PUT', p, b);
  del = (p: string) => this.req('DELETE', p);
}

export async function login(app: ReturnType<typeof createApp>, email: string, password: string) {
  const c = new Client(app);
  const r = await c.post('/auth/login', { email, password });
  if (r.status !== 200) throw new Error('login failed ' + JSON.stringify(r.data));
  return c;
}

export async function registerClient(app: ReturnType<typeof createApp>, coach: Client, email: string, name: string) {
  const inv = await coach.post('/invites', { name, track: 'A' });
  const c = new Client(app);
  const r = await c.post('/auth/register', { code: inv.data.code, name, email, password: 'client-password-1' });
  if (r.status !== 200) throw new Error('register failed ' + JSON.stringify(r.data));
  const me = await c.get('/auth/me');
  return { client: c, id: me.data.user.id as string };
}
