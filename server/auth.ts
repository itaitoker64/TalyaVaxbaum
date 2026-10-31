import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { get, run, now, type DB } from './db.ts';
import type { Role } from '../shared/types.ts';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
export const SESSION_COOKIE = 'mbt_session';
const SESSION_DAYS = 30;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  locale: string;
  is_demo: number;
}

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [algo, saltB64, keyB64] = stored.split('$');
  if (algo !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(pw, Buffer.from(saltB64, 'base64'), expected.length);
  return timingSafeEqual(key, expected);
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export function createSession(db: DB, userId: string): string {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  run(db, 'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?,?,?,?)', sha(token), userId, now(), expires);
  return token;
}

export function destroySession(db: DB, token: string) {
  run(db, 'DELETE FROM sessions WHERE token_hash = ?', sha(token));
}

export function userForToken(db: DB, token: string | undefined): AuthUser | null {
  if (!token) return null;
  const row = get<AuthUser & { expires_at: string; disabled: number }>(
    db,
    `SELECT u.id, u.email, u.name, u.role, u.locale, u.is_demo, u.disabled, s.expires_at
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
    sha(token),
  );
  if (!row || row.disabled || row.expires_at < now()) return null;
  const { expires_at: _e, disabled: _d, ...user } = row;
  return user;
}

export function setSessionCookie(c: Context, token: string) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_DAYS * 86400,
  });
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

export type Env = { Variables: { user: AuthUser | null; db: DB } };

/** Loads the session user (if any). Mutating requests must carry the X-CSRF header, which
 *  cross-site forms cannot send; combined with SameSite=Lax cookies this blocks CSRF. */
export function sessionMiddleware(db: DB): MiddlewareHandler<Env> {
  return async (c, next) => {
    c.set('db', db);
    c.set('user', userForToken(db, getCookie(c, SESSION_COOKIE)));
    const m = c.req.method;
    if (m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS' && c.req.header('x-csrf') !== '1') {
      return c.json({ error: 'csrf' }, 403);
    }
    await next();
  };
}

/** Very small in-memory limiter for login attempts (per email+ip). */
const attempts = new Map<string, { n: number; until: number }>();
export function loginAllowed(key: string): boolean {
  const a = attempts.get(key);
  return !a || a.n < 8 || a.until < Date.now();
}
export function recordLoginFailure(key: string) {
  const a = attempts.get(key);
  if (!a || a.until < Date.now()) attempts.set(key, { n: 1, until: Date.now() + 15 * 60_000 });
  else a.n++;
}
export function clearLoginFailures(key: string) {
  attempts.delete(key);
}
