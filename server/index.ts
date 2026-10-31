import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { readFileSync, existsSync } from 'node:fs';
import { openDb, get, insert, now, newId } from './db.ts';
import { hashPassword } from './auth.ts';
import { execFileSync } from 'node:child_process';
import { createApp } from './app.ts';
import { LocalStorage } from './storage.ts';

const DATA_DIR = process.env.DATA_DIR ?? './data';
const db = openDb(process.env.DB_FILE ?? `${DATA_DIR}/movement.db`);
const storage = new LocalStorage(process.env.UPLOAD_DIR ?? `${DATA_DIR}/uploads`);
const app = createApp(db, storage);

// First-run setup without a shell (e.g. hosts with no console access):
// COACH_EMAIL / COACH_PASSWORD / COACH_NAME create the coach account if no coach exists yet.
// SEED_DEMO=1 adds the labeled demo data (idempotent).
{
  const email = process.env.COACH_EMAIL, password = process.env.COACH_PASSWORD;
  if (email && password && !get(db, "SELECT 1 FROM users WHERE role = 'coach' AND is_demo = 0")) {
    if (password.length < 10) console.error('COACH_PASSWORD must be at least 10 characters; coach not created.');
    else if (!get(db, 'SELECT 1 FROM users WHERE email = ?', email)) {
      const id = newId();
      insert(db, 'users', { id, email, name: process.env.COACH_NAME || 'Talya', password_hash: await hashPassword(password), role: 'coach', locale: 'he', created_at: now() });
      insert(db, 'coach_settings', { coach_id: id, week_start_day: 0, updated_at: now() });
      console.log(`Coach account created for ${email}`);
    }
  }
  if (process.env.SEED_DEMO === '1') {
    try {
      execFileSync('npx', ['tsx', 'scripts/seed-demo.ts'], { stdio: 'inherit', env: process.env });
    } catch (e) {
      console.error('Demo seed failed', e);
    }
  }
}

// In production the built SPA is served from the same origin (cookies stay first-party).
if (process.env.NODE_ENV === 'production' && existsSync('./dist/web/index.html')) {
  const index = readFileSync('./dist/web/index.html', 'utf8');
  app.use('/assets/*', serveStatic({ root: './dist/web' }));
  app.use('/favicon.svg', serveStatic({ root: './dist/web' }));
  app.use('/placeholders/*', serveStatic({ root: './dist/web' }));
  app.use('/manifest.webmanifest', serveStatic({ root: './dist/web' }));
  app.get('*', (c) => c.html(index));
}

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => console.log(`Movement by Talya API on http://localhost:${port}`));
