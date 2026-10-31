import { Hono } from 'hono';
import { z } from 'zod';
import { all, get, insert, update, now, newId, json, parse, tx, onlySent, type DB } from '../db.ts';
import type { Env } from '../auth.ts';
import { requireCoach, requireClientAccess, notFound, badRequest, forbidden, canAccessMedia } from '../access.ts';
import { isISODate, todayISO, addDays } from '../../shared/dates.ts';
import { weeklyAdherence } from '../../shared/schedule.ts';

export const goalRoutes = new Hono<Env>();

const Conditions = z
  .object({
    exerciseId: z.string().optional(),
    exerciseName: z.string().max(120).optional(),
    variant: z.string().max(200).optional(),
    load: z.number().min(0).max(2000).optional(),
    loadUnit: z.enum(['kg', 'lb']).optional(),
    side: z.string().max(100).optional(),
    other: z.string().max(500).optional(),
  })
  .strict();

const Num = z.number().finite().nullable().optional();
const GoalBody = z.object({
  title: z.string().min(1).max(160),
  description: z.string().max(4000).nullable().optional(),
  kind: z.enum(['performance', 'mobility', 'adherence', 'body', 'quality', 'other']),
  metric: z.string().max(160).nullable().optional(),
  unit: z.string().max(40).nullable().optional(),
  direction: z.enum(['increase', 'decrease', 'range']).default('increase'),
  baseline_value: Num,
  baseline_date: z.string().refine(isISODate).nullable().optional(),
  target_value: Num,
  target_min: Num,
  target_max: Num,
  review_date: z.string().refine(isISODate).nullable().optional(),
  procedure: z.string().max(4000).nullable().optional(),
  conditions: Conditions.nullable().optional(),
  criteria: z.array(z.string().min(1).max(200)).max(12).nullable().optional(),
  client_can_record: z.boolean().default(true),
  show_on_today: z.boolean().default(false),
  status: z.enum(['active', 'achieved', 'paused', 'archived']).default('active'),
});

function toRow(b: Partial<z.infer<typeof GoalBody>>) {
  const { conditions, criteria, client_can_record, show_on_today, ...rest } = b;
  const row: Record<string, unknown> = { ...rest };
  if (conditions !== undefined) row.conditions_json = json(conditions);
  if (criteria !== undefined) row.criteria_json = json(criteria);
  if (client_can_record !== undefined) row.client_can_record = client_can_record ? 1 : 0;
  if (show_on_today !== undefined) row.show_on_today = show_on_today ? 1 : 0;
  return row;
}

function validateTarget(g: { kind: string; direction: string; target_value?: number | null; target_min?: number | null; target_max?: number | null }) {
  if (g.kind === 'quality') return;
  if (g.direction === 'range' && g.target_min != null && g.target_max != null && g.target_min > g.target_max) throw badRequest('range_order');
}

export function goalOut(db: DB, g: any) {
  const latest = get(db, 'SELECT value, measured_on FROM measurements WHERE goal_id = ? AND voided_at IS NULL AND value IS NOT NULL ORDER BY measured_on DESC, created_at DESC LIMIT 1', g.id);
  const count = get(db, 'SELECT COUNT(*) AS n FROM measurements WHERE goal_id = ? AND voided_at IS NULL', g.id)?.n ?? 0;
  return {
    ...g,
    conditions: parse(g.conditions_json, null),
    criteria: parse(g.criteria_json, null),
    conditions_json: undefined,
    criteria_json: undefined,
    client_can_record: !!g.client_can_record,
    show_on_today: !!g.show_on_today,
    latest: latest ?? null,
    measurementCount: count,
  };
}

function loadGoal(c: any) {
  const db: DB = c.get('db');
  const g = get(db, 'SELECT * FROM goals WHERE id = ?', c.req.param('gid'));
  if (!g) throw notFound();
  const u = requireClientAccess(c, g.client_id);
  return { u, db, g };
}

goalRoutes.get('/clients/:cid/goals', (c) => {
  const cid = c.req.param('cid');
  requireClientAccess(c, cid);
  const db = c.get('db');
  return c.json(all(db, "SELECT * FROM goals WHERE client_id = ? ORDER BY status = 'active' DESC, created_at", cid).map((g) => goalOut(db, g)));
});

goalRoutes.post('/clients/:cid/goals', async (c) => {
  const cid = c.req.param('cid');
  const coach = requireCoach(c);
  requireClientAccess(c, cid);
  const b = GoalBody.parse(await c.req.json());
  validateTarget(b);
  const db = c.get('db');
  const id = newId();
  tx(db, () => {
    insert(db, 'goals', { ...toRow(b), id, client_id: cid, created_by: coach.id, method_version: 1, created_at: now(), updated_at: now() });
    // The baseline is also stored as the first measurement so the chart starts from real data.
    if (b.baseline_value != null && b.baseline_date && b.kind !== 'adherence')
      insert(db, 'measurements', {
        id: newId(), goal_id: id, client_id: cid, value: b.baseline_value, measured_on: b.baseline_date, recorded_by: coach.id,
        notes: null, conditions_json: json(b.conditions ?? null), method_version: 1, is_baseline: 1, created_at: now(),
      });
  });
  return c.json({ id });
});

const METHOD_FIELDS = ['procedure', 'unit', 'metric', 'conditions_json'] as const;

/** Updates a goal and keeps the previous definition in goal_revisions. A change in how the
 *  metric is measured bumps method_version, so charts can show the break. */
goalRoutes.put('/goals/:gid', async (c) => {
  const coach = requireCoach(c);
  const { db, g } = loadGoal(c);
  const body = await c.req.json();
  const reason = z.string().max(1000).optional().parse(body.reason);
  const b = onlySent(GoalBody.partial().parse(body), body);
  const patch = toRow(b);
  validateTarget({ ...g, ...patch } as any);
  const changed = Object.keys(patch).filter((k) => JSON.stringify(patch[k] ?? null) !== JSON.stringify(g[k] ?? null));
  if (!changed.length) return c.json({ ok: true, changed: [] });
  const methodChanged = changed.some((k) => (METHOD_FIELDS as readonly string[]).includes(k));
  const before = Object.fromEntries(changed.map((k) => [k, g[k]]));
  const after = Object.fromEntries(changed.map((k) => [k, patch[k]]));
  tx(db, () => {
    insert(db, 'goal_revisions', { id: newId(), goal_id: g.id, revised_by: coach.id, revised_at: now(), before_json: json(before), after_json: json(after), reason: reason ?? null, method_changed: methodChanged ? 1 : 0 });
    update(db, 'goals', g.id, { ...Object.fromEntries(changed.map((k) => [k, patch[k]])), ...(methodChanged ? { method_version: g.method_version + 1 } : {}), updated_at: now() });
  });
  return c.json({ ok: true, changed, methodChanged });
});

goalRoutes.get('/goals/:gid', (c) => {
  const { db, g } = loadGoal(c);
  const measurements = all(
    db,
    `SELECT m.*, u.name AS recorded_by_name, md.title AS media_title, md.mime AS media_mime, md.status AS media_status
     FROM measurements m JOIN users u ON u.id = m.recorded_by LEFT JOIN media md ON md.id = m.media_id
     WHERE m.goal_id = ? ORDER BY m.measured_on, m.created_at`,
    g.id,
  ).map((m) => ({ ...m, conditions: parse(m.conditions_json, null), conditions_json: undefined, is_baseline: !!m.is_baseline }));
  const revisions = all(db, 'SELECT r.*, u.name AS revised_by_name FROM goal_revisions r JOIN users u ON u.id = r.revised_by WHERE goal_id = ? ORDER BY revised_at', g.id).map((r) => ({
    ...r, before: parse(r.before_json, {}), after: parse(r.after_json, {}), method_changed: !!r.method_changed, before_json: undefined, after_json: undefined,
  }));
  const reviews = all(db, 'SELECT q.*, u.name AS coach_name FROM quality_reviews q JOIN users u ON u.id = q.coach_id WHERE goal_id = ? ORDER BY created_at', g.id).map((q) => ({
    ...q, ratings: parse(q.ratings_json, []), ratings_json: undefined,
  }));
  let adherence = null;
  if (g.kind === 'adherence') {
    // Calculated from scheduled sessions and logs, not entered by hand.
    const today = isISODate(c.req.query('today')) ? c.req.query('today')! : todayISO();
    const from = g.baseline_date ?? addDays(today, -84);
    const coachId = get(db, "SELECT coach_id FROM coach_clients WHERE client_id = ? AND status != 'ended'", g.client_id)?.coach_id;
    const wsd = get(db, 'SELECT week_start_day FROM coach_settings WHERE coach_id = ?', coachId)?.week_start_day ?? 0;
    const sessions = all(db, 'SELECT date, status FROM scheduled_sessions WHERE client_id = ? AND date BETWEEN ? AND ?', g.client_id, from, today);
    adherence = weeklyAdherence(sessions as any, today, wsd);
  }
  return c.json({ goal: goalOut(db, g), measurements, revisions, reviews, adherence });
});

const MeasurementBody = z.object({
  value: z.number().finite().nullable().optional(),
  measured_on: z.string().refine(isISODate),
  notes: z.string().max(4000).nullable().optional(),
  conditions: Conditions.nullable().optional(),
  media_id: z.string().nullable().optional(),
});

goalRoutes.post('/goals/:gid/measurements', async (c) => {
  const { u, db, g } = loadGoal(c);
  if (u.role === 'client' && !g.client_can_record) throw forbidden();
  if (g.kind === 'adherence') throw badRequest('calculated_goal');
  const b = MeasurementBody.parse(await c.req.json());
  if (g.kind !== 'quality' && b.value == null) throw badRequest('value_required');
  if (g.kind === 'quality' && b.value != null) throw badRequest('quality_goals_have_no_score');
  if (!b.media_id && b.value == null && !b.notes) throw badRequest('empty');
  if (b.media_id) {
    const m = get(db, 'SELECT * FROM media WHERE id = ?', b.media_id);
    if (!m || m.scope !== 'private' || m.client_id !== g.client_id || !canAccessMedia(db, u, m)) throw badRequest('invalid_media');
  }
  const id = newId();
  insert(db, 'measurements', {
    id, goal_id: g.id, client_id: g.client_id, value: b.value ?? null, measured_on: b.measured_on, recorded_by: u.id,
    notes: b.notes ?? null, conditions_json: json(b.conditions ?? parse(g.conditions_json, null)), method_version: g.method_version,
    media_id: b.media_id ?? null, created_at: now(),
  });
  return c.json({ id });
});

/** Measurements are never edited or deleted; a mistaken one is voided with a reason. */
goalRoutes.post('/measurements/:mid/void', async (c) => {
  const db: DB = c.get('db');
  const m = get(db, 'SELECT * FROM measurements WHERE id = ?', c.req.param('mid'));
  if (!m) throw notFound();
  const u = requireClientAccess(c, m.client_id);
  if (u.role === 'client' && m.recorded_by !== u.id) throw forbidden();
  const b = z.object({ reason: z.string().min(1).max(1000) }).parse(await c.req.json());
  update(db, 'measurements', m.id, { voided_at: now(), void_reason: b.reason, voided_by: u.id });
  return c.json({ ok: true });
});

/** Coach feedback on a movement-quality goal using the goal's defined criteria (no numeric score). */
goalRoutes.post('/goals/:gid/reviews', async (c) => {
  const coach = requireCoach(c);
  const { db, g } = loadGoal(c);
  const criteria: string[] = parse(g.criteria_json, []);
  const b = z
    .object({
      measurement_id: z.string().nullable().optional(),
      ratings: z.array(z.object({ criterion: z.string(), rating: z.enum(['not_yet', 'developing', 'consistent']), comment: z.string().max(1000).optional() })),
      summary: z.string().max(4000).optional(),
    })
    .parse(await c.req.json());
  if (b.ratings.some((r) => !criteria.includes(r.criterion))) throw badRequest('unknown_criterion');
  if (b.measurement_id && !get(db, 'SELECT 1 FROM measurements WHERE id = ? AND goal_id = ?', b.measurement_id, g.id)) throw badRequest('invalid_measurement');
  const id = newId();
  tx(db, () => {
    insert(db, 'quality_reviews', { id, goal_id: g.id, measurement_id: b.measurement_id ?? null, coach_id: coach.id, ratings_json: json(b.ratings), summary: b.summary ?? null, created_at: now() });
    if (b.summary?.trim()) insert(db, 'messages', { id: newId(), client_id: g.client_id, sender_id: coach.id, body: b.summary.trim(), ref_type: 'goal', ref_id: g.id, created_at: now() });
  });
  return c.json({ id });
});
