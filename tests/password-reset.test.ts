import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, makeCoach, login, Client } from './helpers.ts';
import { get, run } from '../server/db.ts';

test('password reset: generic response, hashed tokens, expiry, one use and session revocation', async () => {
 const { db, app } = setup();
 const user = await makeCoach(db);
 const session = await login(app, user.email, user.password);
 const anon = new Client(app);
 const old = { key: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM, url: process.env.APP_URL };
 const originalFetch = globalThis.fetch;
 let token = '';
 try {
  process.env.RESEND_API_KEY = 'test'; process.env.EMAIL_FROM = 'test@example.com'; process.env.APP_URL = 'https://example.com';
  globalThis.fetch = async (_url, opts) => { const body = JSON.parse(String(opts?.body)); token = body.text.match(/#([a-f0-9]{64})/)[1]; return new Response('{}', { status: 200 }); };
  const known = await anon.post('/auth/forgot-password', { email: user.email });
  const unknown = await anon.post('/auth/forgot-password', { email: 'absent@example.com' });
  assert.deepEqual(known.data, unknown.data);
  assert.equal(known.status, 200);
  assert.notEqual(get(db, 'SELECT token_hash FROM password_resets').token_hash, token);
  const expired = token; run(db, "UPDATE password_resets SET expires_at = '2000-01-01'");
  assert.equal((await anon.post('/auth/reset-password', { token: expired, password: 'new-password-123' })).status, 400);
  await anon.post('/auth/forgot-password', { email: user.email });
  assert.equal((await anon.post('/auth/reset-password', { token, password: 'new-password-123' })).status, 200);
  assert.equal((await session.get('/auth/me')).data.user, null);
  assert.equal((await anon.post('/auth/reset-password', { token, password: 'other-password-123' })).status, 400);
  await login(app, user.email, 'new-password-123');
 } finally {
  globalThis.fetch = originalFetch;
  for (const [k, v] of Object.entries({ RESEND_API_KEY: old.key, EMAIL_FROM: old.from, APP_URL: old.url })) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  db.close();
 }
});
