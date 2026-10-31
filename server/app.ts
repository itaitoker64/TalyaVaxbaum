import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import { ZodError } from 'zod';
import type { DB } from './db.ts';
import { sessionMiddleware, type Env } from './auth.ts';
import { LocalStorage } from './storage.ts';
import { authRoutes } from './routes/auth.ts';
import { coachRoutes } from './routes/coach.ts';
import { libraryRoutes } from './routes/library.ts';
import { trainingRoutes } from './routes/training.ts';
import { goalRoutes } from './routes/goals.ts';
import { engagementRoutes } from './routes/engagement.ts';
import { nutritionRoutes } from './routes/nutrition.ts';

export function createApp(db: DB, storage: LocalStorage) {
  const api = new Hono<Env>();
  api.use('*', sessionMiddleware(db));
  api.route('/', authRoutes);
  api.route('/', coachRoutes);
  api.route('/', libraryRoutes(storage));
  api.route('/', trainingRoutes);
  api.route('/', goalRoutes);
  api.route('/', engagementRoutes);
  api.route('/', nutritionRoutes);
  api.get('/health', (c) => c.json({ ok: true }));
  api.notFound((c) => c.json({ error: 'not_found' }, 404));
  api.onError((err, c) => {
    if (err instanceof ZodError) return c.json({ error: 'validation', issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }, 400);
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    if (err instanceof SyntaxError) return c.json({ error: 'invalid_json' }, 400);
    console.error(err);
    return c.json({ error: 'server_error' }, 500);
  });

  const app = new Hono();
  app.use('*', secureHeaders({ crossOriginResourcePolicy: 'same-origin', contentSecurityPolicy: undefined }));
  app.route('/api', api);
  return app;
}
