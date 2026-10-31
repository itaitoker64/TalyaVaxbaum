import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, makeCoach } from './helpers.ts';
import { notifyUser } from '../server/email.ts';
import { run } from '../server/db.ts';
test('notifications are generic, skip demo accounts and preserve saves on delivery failure', async () => {
 const { db } = setup(); const u = await makeCoach(db);
 const keys = ['RESEND_API_KEY','EMAIL_FROM','APP_URL','EMAIL_NOTIFICATIONS'];
 const previous = keys.map(k => process.env[k]); const original = globalThis.fetch; let calls = 0;
 try {
  process.env.RESEND_API_KEY='test'; process.env.EMAIL_FROM='test@example.com'; process.env.APP_URL='https://example.com'; process.env.EMAIL_NOTIFICATIONS='1';
  globalThis.fetch = async (_url, options) => { calls++; const b=JSON.parse(String(options?.body)); assert.deepEqual(b.to,[u.email]); assert.ok(b.text.includes('https://example.com/')); assert.ok(!b.text.includes(u.password)); return new Response('{}'); };
  await notifyUser(db,u.id); assert.equal(calls,1);
  run(db,'UPDATE users SET is_demo = 1 WHERE id = ?',u.id); await notifyUser(db,u.id); assert.equal(calls,1);
  run(db,'UPDATE users SET is_demo = 0 WHERE id = ?',u.id);
  globalThis.fetch = async () => new Response('',{status:503});
  await assert.doesNotReject(()=>notifyUser(db,u.id));
 } finally { globalThis.fetch=original; keys.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];}); db.close(); }
});
