import { Hono } from 'hono';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { all, get, insert, run, now, json, parse, type DB } from '../db.ts';
import type { Env } from '../auth.ts';
import { requireCoach, requireClientAccess, notFound, forbidden, badRequest } from '../access.ts';
import { CATEGORIES } from '../../shared/types.ts';
import { todayISO, addDays } from '../../shared/dates.ts';

export const coachRoutes = new Hono<Env>();

coachRoutes.get('/clients', (c) => {
  const coach = requireCoach(c);
  const db = c.get('db');
  const today = c.req.query('today') ?? todayISO();
  const rows = all(
    db,
    `SELECT u.id, u.name, u.email, u.is_demo, cc.track, cc.status, p.onboarding_completed_at
     FROM coach_clients cc JOIN users u ON u.id = cc.client_id
     LEFT JOIN client_profiles p ON p.client_id = u.id
     WHERE cc.coach_id = ? AND cc.status != 'ended' ORDER BY u.name`,
    coach.id,
  );
  const from = addDays(today, -6);
  return c.json(
    rows.map((r) => {
      const s = get(
        db,
        `SELECT SUM(status IN ('completed','partial')) AS done, SUM(status != 'rescheduled') AS planned
         FROM scheduled_sessions WHERE client_id = ? AND date BETWEEN ? AND ?`,
        r.id, from, today,
      );
      const last = get(db, "SELECT MAX(date) AS d FROM workout_logs WHERE client_id = ? AND status != 'draft'", r.id);
      return { ...r, is_demo: !!r.is_demo, last7: { done: s?.done ?? 0, planned: s?.planned ?? 0 }, lastWorkout: last?.d ?? null };
    }),
  );
});

coachRoutes.get('/clients/:cid', (c) => {
  const cid = c.req.param('cid');
  requireClientAccess(c, cid);
  const db = c.get('db');
  const u = get(db, 'SELECT id, name, email, is_demo, created_at FROM users WHERE id = ?', cid);
  if (!u) throw notFound();
  const p = get(db, 'SELECT * FROM client_profiles WHERE client_id = ?', cid);
  const cc = get(db, "SELECT track, status FROM coach_clients WHERE client_id = ? AND status != 'ended'", cid);
  const viewer = c.get('user')!;
  return c.json({
    ...u,
    is_demo: !!u.is_demo,
    track: cc?.track ?? 'A',
    status: cc?.status ?? 'active',
    onboarding: parse(p?.onboarding_json, null),
    onboardingCompletedAt: p?.onboarding_completed_at ?? null,
    nutrition: parse(p?.nutrition_json, { mode: 'diary' }),
    // Private coach notes are never sent to the client.
    coachNotes: viewer.role === 'coach' ? p?.coach_notes ?? '' : undefined,
  });
});

const Onboarding = z.object({
  goals: z.string().max(4000).default(''),
  experience: z.string().max(4000).default(''),
  availability: z.string().max(2000).default(''),
  daysPerWeek: z.number().int().min(0).max(7).nullable().default(null),
  equipment: z.string().max(2000).default(''),
  considerations: z.string().max(4000).default(''),
  nutritionInterest: z.string().max(2000).default(''),
  consent: z.literal(true),
});

coachRoutes.put('/clients/:cid/onboarding', async (c) => {
  const cid = c.req.param('cid');
  const u = requireClientAccess(c, cid);
  if (u.role !== 'client') throw forbidden();
  const answers = Onboarding.parse(await c.req.json());
  run(c.get('db'), 'UPDATE client_profiles SET onboarding_json = ?, onboarding_completed_at = COALESCE(onboarding_completed_at, ?), updated_at = ? WHERE client_id = ?', json(answers), now(), now(), cid);
  return c.json({ ok: true });
});

const ClientSettings = z.object({
  track: z.enum(['A', 'B']).optional(),
  status: z.enum(['active', 'paused']).optional(),
  coachNotes: z.string().max(10000).optional(),
  nutrition: z
    .object({
      mode: z.enum(['off', 'diary', 'targets']),
      kcal: z.number().positive().nullable().optional(),
      protein: z.number().nonnegative().nullable().optional(),
      carbs: z.number().nonnegative().nullable().optional(),
      fat: z.number().nonnegative().nullable().optional(),
      guidance: z.string().max(10000).optional(),
    })
    .optional(),
});

coachRoutes.put('/clients/:cid/settings', async (c) => {
  const cid = c.req.param('cid');
  const coach = requireCoach(c);
  requireClientAccess(c, cid);
  const b = ClientSettings.parse(await c.req.json());
  const db = c.get('db');
  if (b.track) run(db, 'UPDATE coach_clients SET track = ? WHERE coach_id = ? AND client_id = ?', b.track, coach.id, cid);
  if (b.status) run(db, 'UPDATE coach_clients SET status = ? WHERE coach_id = ? AND client_id = ?', b.status, coach.id, cid);
  if (b.coachNotes != null) run(db, 'UPDATE client_profiles SET coach_notes = ?, updated_at = ? WHERE client_id = ?', b.coachNotes, now(), cid);
  if (b.nutrition) run(db, 'UPDATE client_profiles SET nutrition_json = ?, updated_at = ? WHERE client_id = ?', json(b.nutrition), now(), cid);
  return c.json({ ok: true });
});

coachRoutes.get('/coach/settings', (c) => {
  const coach = requireCoach(c);
  const s = get(c.get('db'), 'SELECT response_expectation, whatsapp_url, week_start_day, covers_json FROM coach_settings WHERE coach_id = ?', coach.id);
  return c.json(s ? { ...s, covers: parse(s.covers_json, {}), covers_json: undefined } : {});
});

coachRoutes.put('/coach/settings', async (c) => {
  const coach = requireCoach(c);
  const b = z
    .object({
      response_expectation: z.string().max(500).nullable(),
      whatsapp_url: z.string().url().startsWith('https://').nullable().or(z.literal('')),
      week_start_day: z.number().int().min(0).max(6),
      covers: z.record(z.string(), z.string()).optional(),
    })
    .parse(await c.req.json());
  const db = c.get('db');
  // Category cover photos must be the coach's own ready library images.
  for (const [cat, mid] of Object.entries(b.covers ?? {})) {
    if (!CATEGORIES.includes(cat as any)) throw badRequest('invalid_category');
    if (!get(db, "SELECT 1 FROM media WHERE id = ? AND scope = 'library' AND coach_id = ? AND status = 'ready' AND mime LIKE 'image/%'", mid, coach.id)) throw badRequest('invalid_media');
  }
  run(
    db,
    `INSERT INTO coach_settings (coach_id, response_expectation, whatsapp_url, week_start_day, covers_json, updated_at) VALUES (?,?,?,?,?,?)
     ON CONFLICT(coach_id) DO UPDATE SET response_expectation = excluded.response_expectation, whatsapp_url = excluded.whatsapp_url,
     week_start_day = excluded.week_start_day, covers_json = COALESCE(excluded.covers_json, coach_settings.covers_json), updated_at = excluded.updated_at`,
    coach.id, b.response_expectation, b.whatsapp_url || null, b.week_start_day, b.covers ? json(b.covers) : null, now(),
  );
  return c.json({ ok: true });
});

coachRoutes.get('/invites', (c) => {
  const coach = requireCoach(c);
  return c.json(all(c.get('db'), 'SELECT code, name, email, track, role, created_at, expires_at, used_at FROM invites WHERE coach_id = ? ORDER BY created_at DESC LIMIT 50', coach.id));
});

coachRoutes.post('/invites', async (c) => {
  const coach = requireCoach(c);
  const b = z.object({ name: z.string().max(80).optional(), email: z.string().email().optional().or(z.literal('')), track: z.enum(['A', 'B']).default('A'), role: z.enum(['client', 'coach']).default('client') }).parse(await c.req.json());
  const code = randomBytes(9).toString('base64url');
  insert(c.get('db'), 'invites', {
    code, coach_id: coach.id, role: b.role, name: b.name ?? null, email: b.email || null, track: b.track,
    created_at: now(), expires_at: new Date(Date.now() + 14 * 86_400_000).toISOString(),
  });
  return c.json({ code });
});

/** Items awaiting the coach's attention, computed from source records (nothing is duplicated). */
export function attentionFor(db: DB, coachId: string, today = todayISO()) {
  const clientIds = all<{ client_id: string }>(db, "SELECT client_id FROM coach_clients WHERE coach_id = ? AND status != 'ended'", coachId).map((r) => r.client_id);
  if (!clientIds.length) return [];
  const ph = clientIds.map(() => '?').join(',');
  const names = new Map(all(db, `SELECT id, name FROM users WHERE id IN (${ph})`, ...clientIds).map((r) => [r.id, r.name]));
  const items: { type: string; id: string; clientId: string; clientName: string; date: string; detail: Record<string, unknown> }[] = [];
  const push = (type: string, r: any, date: string, detail: Record<string, unknown> = {}) =>
    items.push({ type, id: r.id, clientId: r.client_id, clientName: names.get(r.client_id) ?? '', date, detail });

  for (const r of all(db, `SELECT id, client_id, week_start, submitted_at FROM checkins WHERE client_id IN (${ph}) AND coach_reviewed_at IS NULL`, ...clientIds))
    push('checkin', r, r.submitted_at, { weekStart: r.week_start });
  for (const r of all(
    db,
    `SELECT id, client_id, title, date, status, notes, completed_at FROM workout_logs
     WHERE client_id IN (${ph}) AND status != 'draft' AND coach_reviewed_at IS NULL ORDER BY date DESC LIMIT 100`,
    ...clientIds,
  ))
    push('workout', r, r.completed_at ?? r.date, { title: r.title, status: r.status, hasNotes: !!r.notes });
  for (const r of all(db, `SELECT id, client_id, title, created_at FROM media WHERE client_id IN (${ph}) AND kind = 'submission' AND status = 'ready' AND coach_reviewed_at IS NULL`, ...clientIds))
    push('video', r, r.created_at, { title: r.title });
  for (const r of all(
    db,
    `SELECT m.client_id, COUNT(*) AS n, MAX(m.created_at) AS last, MIN(m.id) AS id FROM messages m
     WHERE m.client_id IN (${ph}) AND m.sender_id = m.client_id AND m.read_at IS NULL GROUP BY m.client_id`,
    ...clientIds,
  ))
    push('message', { ...r, id: 'msg-' + r.client_id }, r.last, { count: r.n });
  for (const r of all(db, `SELECT id, client_id, title, review_date FROM goals WHERE client_id IN (${ph}) AND status = 'active' AND review_date IS NOT NULL AND review_date <= ?`, ...clientIds, today))
    push('goal_review', r, r.review_date, { title: r.title });
  for (const r of all(
    db,
    `SELECT s.client_id, COUNT(*) AS n FROM scheduled_sessions s WHERE s.client_id IN (${ph}) AND s.status = 'planned' AND s.date BETWEEN ? AND ?
     AND NOT EXISTS (SELECT 1 FROM workout_logs l WHERE l.session_id = s.id) GROUP BY s.client_id HAVING n >= 2`,
    ...clientIds, addDays(today, -7), addDays(today, -1),
  ))
    push('missed', { ...r, id: 'missed-' + r.client_id }, today, { count: r.n });
  for (const r of all(db, `SELECT id AS client_id FROM users WHERE id IN (${ph}) AND id NOT IN (SELECT client_id FROM programs WHERE client_id IS NOT NULL AND status = 'active')`, ...clientIds))
    push('no_program', { ...r, id: 'noprog-' + r.client_id }, today);
  return items.sort((a, b) => (a.date < b.date ? 1 : -1));
}

coachRoutes.get('/coach/attention', (c) => {
  const coach = requireCoach(c);
  return c.json(attentionFor(c.get('db'), coach.id, c.req.query('today') ?? todayISO()));
});
