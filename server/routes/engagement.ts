import { Hono } from 'hono';
import { z } from 'zod';
import { all, get, insert, run, update, now, newId, json, parse, tx } from '../db.ts';
import type { Env } from '../auth.ts';
import { requireCoach, requireClientAccess, notFound, forbidden, badRequest, coachIdsOf } from '../access.ts';
import { isISODate, todayISO, weekStart, addDays } from '../../shared/dates.ts';
import { sumMacros } from '../../shared/nutrition.ts';
import { sessionsBetween } from './training.ts';
import { goalOut } from './goals.ts';

export const engagementRoutes = new Hono<Env>();

// ---------- Weekly check-ins ----------
const Scale = z.number().int().min(1).max(5).nullable().optional();
const CheckinAnswers = z.object({
  energy: Scale, sleep: Scale, stress: Scale, soreness: Scale, enjoyment: Scale,
  wins: z.string().max(4000).optional(),
  struggles: z.string().max(4000).optional(),
  questions: z.string().max(4000).optional(),
  bodyNotes: z.string().max(4000).optional(),
});

engagementRoutes.get('/clients/:cid/checkins', (c) => {
  const cid = c.req.param('cid');
  requireClientAccess(c, cid);
  const db = c.get('db');
  return c.json(
    all(db, 'SELECT * FROM checkins WHERE client_id = ? ORDER BY week_start DESC LIMIT 52', cid).map((r) => ({
      ...r, answers: parse(r.answers_json, {}), answers_json: undefined,
      feedback: all(db, "SELECT m.id, m.body, m.created_at, u.name AS sender_name FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.ref_type = 'checkin' AND m.ref_id = ? ORDER BY m.created_at", r.id),
    })),
  );
});

engagementRoutes.put('/clients/:cid/checkins/:week', async (c) => {
  const cid = c.req.param('cid');
  const u = requireClientAccess(c, cid);
  if (u.role !== 'client') throw forbidden();
  const week = c.req.param('week');
  if (!isISODate(week)) throw badRequest('week');
  const answers = CheckinAnswers.parse(await c.req.json());
  const db = c.get('db');
  const existing = get(db, 'SELECT id FROM checkins WHERE client_id = ? AND week_start = ?', cid, week);
  if (existing) update(db, 'checkins', existing.id, { answers_json: json(answers), updated_at: now(), coach_reviewed_at: null });
  else insert(db, 'checkins', { id: newId(), client_id: cid, week_start: week, answers_json: json(answers), submitted_at: now(), updated_at: now() });
  return c.json({ ok: true });
});

engagementRoutes.post('/checkins/:id/review', async (c) => {
  const coach = requireCoach(c);
  const db = c.get('db');
  const ci = get(db, 'SELECT * FROM checkins WHERE id = ?', c.req.param('id'));
  if (!ci) throw notFound();
  requireClientAccess(c, ci.client_id);
  const b = z.object({ feedback: z.string().max(8000).optional() }).parse(await c.req.json());
  tx(db, () => {
    update(db, 'checkins', ci.id, { coach_reviewed_at: now() });
    if (b.feedback?.trim()) insert(db, 'messages', { id: newId(), client_id: ci.client_id, sender_id: coach.id, body: b.feedback.trim(), ref_type: 'checkin', ref_id: ci.id, created_at: now() });
  });
  return c.json({ ok: true });
});

// ---------- Messages (one thread per client; feedback items reference their subject) ----------
engagementRoutes.get('/clients/:cid/messages', (c) => {
  const cid = c.req.param('cid');
  requireClientAccess(c, cid);
  return c.json(all(c.get('db'), 'SELECT m.*, u.name AS sender_name, u.role AS sender_role FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.client_id = ? ORDER BY m.created_at DESC LIMIT 200', cid).reverse());
});

engagementRoutes.post('/clients/:cid/messages', async (c) => {
  const cid = c.req.param('cid');
  const u = requireClientAccess(c, cid);
  const b = z.object({ body: z.string().trim().min(1).max(8000) }).parse(await c.req.json());
  const id = newId();
  insert(c.get('db'), 'messages', { id, client_id: cid, sender_id: u.id, body: b.body, created_at: now() });
  return c.json({ id });
});

/** Marks messages from the other party as read. */
engagementRoutes.post('/clients/:cid/messages/read', (c) => {
  const cid = c.req.param('cid');
  const u = requireClientAccess(c, cid);
  run(c.get('db'), 'UPDATE messages SET read_at = ? WHERE client_id = ? AND sender_id != ? AND read_at IS NULL', now(), cid, u.id);
  return c.json({ ok: true });
});

// ---------- Tasks ----------
engagementRoutes.get('/clients/:cid/tasks', (c) => {
  const cid = c.req.param('cid');
  requireClientAccess(c, cid);
  return c.json(all(c.get('db'), 'SELECT * FROM tasks WHERE client_id = ? ORDER BY done_at IS NOT NULL, due_date IS NULL, due_date, created_at DESC LIMIT 100', cid));
});

engagementRoutes.post('/clients/:cid/tasks', async (c) => {
  const cid = c.req.param('cid');
  const coach = requireCoach(c);
  requireClientAccess(c, cid);
  const b = z.object({ title: z.string().min(1).max(200), notes: z.string().max(2000).optional(), due_date: z.string().refine(isISODate).nullable().optional() }).parse(await c.req.json());
  const id = newId();
  insert(c.get('db'), 'tasks', { id, client_id: cid, created_by: coach.id, title: b.title, notes: b.notes ?? null, due_date: b.due_date ?? null, created_at: now() });
  return c.json({ id });
});

engagementRoutes.put('/tasks/:id', async (c) => {
  const db = c.get('db');
  const t = get(db, 'SELECT * FROM tasks WHERE id = ?', c.req.param('id'));
  if (!t) throw notFound();
  requireClientAccess(c, t.client_id);
  const b = z.object({ done: z.boolean() }).parse(await c.req.json());
  update(db, 'tasks', t.id, { done_at: b.done ? now() : null });
  return c.json({ ok: true });
});

// ---------- Today (one request for the client home screen) ----------
engagementRoutes.get('/clients/:cid/today', (c) => {
  const cid = c.req.param('cid');
  const u = requireClientAccess(c, cid);
  const db = c.get('db');
  const date = isISODate(c.req.query('date')) ? c.req.query('date')! : todayISO();
  const coachId = coachIdsOf(db, cid)[0];
  const wsd = get(db, 'SELECT week_start_day FROM coach_settings WHERE coach_id = ?', coachId)?.week_start_day ?? 0;
  const ws = weekStart(date, wsd);
  const week = sessionsBetween(db, cid, ws, addDays(ws, 6));
  const sessions = week.filter((s: any) => s.date === date && s.status !== 'rescheduled');
  const next = sessions.length ? null : get(
    db,
    `SELECT s.id, s.date, w.title FROM scheduled_sessions s JOIN program_workouts w ON w.id = s.workout_id
     WHERE s.client_id = ? AND s.date > ? AND s.status = 'planned' ORDER BY s.date LIMIT 1`,
    cid, date,
  );
  const draft = get(db, "SELECT l.id, l.title, l.session_id FROM workout_logs l WHERE l.client_id = ? AND l.status = 'draft' ORDER BY l.updated_at DESC LIMIT 1", cid);
  const otherId = u.id;
  const feedback = all(
    db,
    'SELECT m.id, m.body, m.ref_type, m.ref_id, m.created_at, u.name AS sender_name FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.client_id = ? AND m.sender_id != ? AND m.read_at IS NULL ORDER BY m.created_at DESC LIMIT 3',
    cid, otherId,
  );
  const tasks = all(db, 'SELECT * FROM tasks WHERE client_id = ? AND done_at IS NULL AND (due_date IS NULL OR due_date <= ?) ORDER BY due_date LIMIT 5', cid, addDays(date, 3));
  const goals = all(db, "SELECT * FROM goals WHERE client_id = ? AND status = 'active' AND show_on_today = 1 ORDER BY created_at LIMIT 3", cid).map((g) => goalOut(db, g));
  const profile = get(db, 'SELECT nutrition_json FROM client_profiles WHERE client_id = ?', cid);
  const nutritionConfig = parse<any>(profile?.nutrition_json, { mode: 'diary' });
  const entries = all(db, 'SELECT kcal, protein, carbs, fat FROM food_entries WHERE client_id = ? AND date = ?', cid, date);
  const checkin = get(db, 'SELECT id, submitted_at FROM checkins WHERE client_id = ? AND week_start = ?', cid, ws);
  // Complementary guided practices from the coach's library (shortest first, non-strength).
  const practices = all(
    db,
    `SELECT id, title, category, duration_sec, level, equipment, cover_media_id, file_key IS NOT NULL OR external_url IS NOT NULL AS hasVideo, is_demo
     FROM media WHERE scope = 'library' AND coach_id = ? AND kind = 'follow_along' AND status = 'ready'
     AND IFNULL(category, '') NOT IN ('strength', 'running') ORDER BY duration_sec IS NULL, duration_sec LIMIT 6`,
    coachId ?? '',
  ).map((p) => ({ ...p, hasVideo: !!p.hasVideo, is_demo: !!p.is_demo }));
  const practiceLogs = all(db, "SELECT id, media_id, status FROM workout_logs WHERE client_id = ? AND date = ? AND media_id IS NOT NULL", cid, date);
  return c.json({
    date,
    weekStart: ws,
    sessions,
    week: week.map((s: any) => ({ id: s.id, date: s.date, status: s.status, log_status: s.log_status, title: s.title })),
    next: next ?? null,
    draft: draft ?? null,
    feedback,
    tasks,
    goals,
    nutrition: nutritionConfig.mode === 'off' ? null : { config: nutritionConfig, totals: sumMacros(entries as any), entryCount: entries.length },
    practices,
    practiceLogs,
    checkinDue: !checkin && (addDays(ws, 6) <= addDays(date, 2)),
    checkinDone: !!checkin,
  });
});
