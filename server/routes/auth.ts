import { randomBytes, createHash } from 'node:crypto';
import { emailConfigured, sendEmail } from '../email.ts';
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { z } from 'zod';
import { get, insert, run, now, newId, tx } from '../db.ts';
import {
  type Env, hashPassword, verifyPassword, createSession, destroySession, setSessionCookie,
  clearSessionCookie, SESSION_COOKIE, loginAllowed, recordLoginFailure, clearLoginFailures,
} from '../auth.ts';
import { requireUser, badRequest, libraryCoachId } from '../access.ts';

export const authRoutes = new Hono<Env>();

const LoginBody = z.object({ email: z.string().email(), password: z.string().min(1) });

authRoutes.post('/auth/login', async (c) => {
  const db = c.get('db');
  const { email, password } = LoginBody.parse(await c.req.json());
  const key = `${email.toLowerCase()}|${c.req.header('x-forwarded-for') ?? ''}`;
  if (!loginAllowed(key)) return c.json({ error: 'too_many_attempts' }, 429);
  const user = get(db, 'SELECT id, password_hash, disabled FROM users WHERE email = ?', email);
  if (!user || user.disabled || !(await verifyPassword(password, user.password_hash))) {
    recordLoginFailure(key);
    return c.json({ error: 'invalid_credentials' }, 401);
  }
  clearLoginFailures(key);
  setSessionCookie(c, createSession(db, user.id));
  return c.json({ ok: true });
});

authRoutes.post('/auth/logout', (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) destroySession(c.get('db'), token);
  clearSessionCookie(c);
  return c.json({ ok: true });
});

authRoutes.get('/auth/me', (c) => {
  const u = c.get('user');
  if (!u) return c.json({ user: null });
  const db = c.get('db');
  let extra: Record<string, unknown> = {};
  const coachId = libraryCoachId(db, u);
  const settings = coachId ? get(db, 'SELECT response_expectation, whatsapp_url, week_start_day, covers_json FROM coach_settings WHERE coach_id = ?', coachId) : null;
  if (u.role === 'client') {
    const p = get(db, 'SELECT onboarding_completed_at, nutrition_json FROM client_profiles WHERE client_id = ?', u.id);
    const coach = coachId ? get(db, 'SELECT name FROM users WHERE id = ?', coachId) : null;
    extra = {
      onboardingDone: !!p?.onboarding_completed_at,
      nutrition: p ? JSON.parse(p.nutrition_json) : { mode: 'diary' },
      coachName: coach?.name ?? null,
    };
  }
  return c.json({
    user: { ...u, is_demo: !!u.is_demo },
    coachId,
    weekStartDay: settings?.week_start_day ?? 0,
    responseExpectation: settings?.response_expectation ?? null,
    whatsappUrl: settings?.whatsapp_url ?? null,
    covers: settings?.covers_json ? JSON.parse(settings.covers_json) : {},
    ...extra,
  });
});

authRoutes.put('/auth/me', async (c) => {
  const u = requireUser(c);
  const body = z.object({ name: z.string().min(1).max(80).optional(), locale: z.enum(['he', 'en']).optional() }).parse(await c.req.json());
  const db = c.get('db');
  if (body.name) run(db, 'UPDATE users SET name = ? WHERE id = ?', body.name, u.id);
  if (body.locale) run(db, 'UPDATE users SET locale = ? WHERE id = ?', body.locale, u.id);
  return c.json({ ok: true });
});

authRoutes.get('/invites/:code', (c) => {
  const db = c.get('db');
  const inv = get(db, 'SELECT i.code, i.name, i.role, i.expires_at, i.used_at, u.name AS coach_name FROM invites i JOIN users u ON u.id = i.coach_id WHERE i.code = ?', c.req.param('code'));
  if (!inv || inv.used_at || inv.expires_at < now()) return c.json({ error: 'invalid_invite' }, 404);
  return c.json({ coachName: inv.coach_name, name: inv.name, role: inv.role });
});

const RegisterBody = z.object({
  code: z.string().min(6),
  name: z.string().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(200),
  locale: z.enum(['he', 'en']).default('he'),
});

authRoutes.post('/auth/register', async (c) => {
  const db = c.get('db');
  const b = RegisterBody.parse(await c.req.json());
  const inv = get(db, 'SELECT * FROM invites WHERE code = ?', b.code);
  if (!inv || inv.used_at || inv.expires_at < now()) return c.json({ error: 'invalid_invite' }, 400);
  if (get(db, 'SELECT 1 FROM users WHERE email = ?', b.email)) return c.json({ error: 'email_taken' }, 409);
  const hash = await hashPassword(b.password);
  const id = newId();
  tx(db, () => {
    if (inv.role === 'coach') {
      // A new coach gets their own empty library and client list.
      insert(db, 'users', { id, email: b.email, password_hash: hash, name: b.name, role: 'coach', locale: b.locale, created_at: now() });
      insert(db, 'coach_settings', { coach_id: id, week_start_day: 0, updated_at: now() });
      run(db, 'UPDATE invites SET used_by = ?, used_at = ? WHERE code = ?', id, now(), b.code);
      return;
    }
    insert(db, 'users', { id, email: b.email, password_hash: hash, name: b.name, role: 'client', locale: b.locale, created_at: now() });
    insert(db, 'coach_clients', { coach_id: inv.coach_id, client_id: id, track: inv.track, status: 'active', created_at: now() });
    insert(db, 'client_profiles', { client_id: id, updated_at: now() });
    run(db, 'UPDATE invites SET used_by = ?, used_at = ? WHERE code = ?', id, now(), b.code);
  });
  setSessionCookie(c, createSession(db, id));
  return c.json({ ok: true });
});

authRoutes.post('/auth/password', async (c) => {
  const u = requireUser(c);
  const b = z.object({ current: z.string(), next: z.string().min(8).max(200) }).parse(await c.req.json());
  const db = c.get('db');
  const row = get(db, 'SELECT password_hash FROM users WHERE id = ?', u.id)!;
  if (!(await verifyPassword(b.current, row.password_hash))) throw badRequest('invalid_credentials');
  run(db, 'UPDATE users SET password_hash = ? WHERE id = ?', await hashPassword(b.next), u.id);
  return c.json({ ok: true });
});

const resetHash = (token: string) => createHash('sha256').update(token).digest('hex');
authRoutes.post('/auth/forgot-password', async c => {
  const { email } = z.object({ email: z.string().email().max(254) }).parse(await c.req.json());
  if (!emailConfigured()) return c.json({ error: 'email_unavailable' }, 503);
  const key = 'reset:' + email.toLowerCase();
  if (!loginAllowed(key)) return c.json({ error: 'too_many_attempts' }, 429);
  recordLoginFailure(key);
  const db = c.get('db');
  run(db, 'DELETE FROM password_resets WHERE expires_at < ?', now());
  const user = get(db, 'SELECT id, email, locale FROM users WHERE email = ? AND disabled = 0', email);
  if (user) {
    const token = randomBytes(32).toString('hex');
    const hash = resetHash(token);
    insert(db, 'password_resets', { token_hash: hash, user_id: user.id, expires_at: new Date(Date.now() + 30 * 60000).toISOString() });
    const link = new URL('/reset-password', process.env.APP_URL!); link.hash = token;
    try { await sendEmail(user.email, user.locale === 'he' ? 'איפוס סיסמה — Movement by Talya' : 'Reset your password — Movement by Talya', (user.locale === 'he' ? 'קישור לאיפוס סיסמה, בתוקף ל־30 דקות. אם לא ביקשת איפוס, אפשר להתעלם.\n' : 'Reset link, valid for 30 minutes. Ignore this if you did not request it.\n') + link.href); }
    catch { run(db, 'DELETE FROM password_resets WHERE token_hash = ?', hash); console.error('Password reset email delivery failed'); }
  }
  return c.json({ ok: true });
});
authRoutes.post('/auth/reset-password', async c => {
  const b = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: z.string().min(10).max(200) }).parse(await c.req.json());
  const db = c.get('db'), hash = resetHash(b.token);
  const passwordHash = await hashPassword(b.password);
  const ok = tx(db, () => {
    const row = get(db, 'SELECT p.user_id FROM password_resets p JOIN users u ON u.id = p.user_id WHERE p.token_hash = ? AND p.expires_at > ? AND u.disabled = 0', hash, now());
    if (!row) return false;
    run(db, 'UPDATE users SET password_hash = ? WHERE id = ?', passwordHash, row.user_id);
    run(db, 'DELETE FROM password_resets WHERE user_id = ?', row.user_id);
    run(db, 'DELETE FROM sessions WHERE user_id = ?', row.user_id);
    return true;
  });
  if (!ok) return c.json({ error: 'invalid_reset' }, 400);
  clearSessionCookie(c); return c.json({ ok: true });
});
