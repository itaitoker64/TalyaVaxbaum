import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { readFileSync, existsSync } from 'node:fs';
import { openDb } from './db.ts';
import { createApp } from './app.ts';
import { LocalStorage } from './storage.ts';

const DATA_DIR = process.env.DATA_DIR ?? './data';
const db = openDb(process.env.DB_FILE ?? `${DATA_DIR}/movement.db`);
const storage = new LocalStorage(process.env.UPLOAD_DIR ?? `${DATA_DIR}/uploads`);
const app = createApp(db, storage);

// In production the built SPA is served from the same origin (cookies stay first-party).
if (process.env.NODE_ENV === 'production' && existsSync('./dist/web/index.html')) {
  const index = readFileSync('./dist/web/index.html', 'utf8');
  app.use('/assets/*', serveStatic({ root: './dist/web' }));
  app.use('/favicon.svg', serveStatic({ root: './dist/web' }));
  app.use('/manifest.webmanifest', serveStatic({ root: './dist/web' }));
  app.get('*', (c) => c.html(index));
}

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => console.log(`Movement by Talya API on http://localhost:${port}`));
