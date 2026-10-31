import { Hono } from 'hono';
import { z } from 'zod';
import { all, get, insert, run, update, now, newId, json, parse, tx, onlySent, type DB } from '../db.ts';
import type { Env, AuthUser } from '../auth.ts';
import { requireCoach, requireUser, requireClientAccess, notFound, badRequest, forbidden, isCoachOf } from '../access.ts';
import { CATEGORIES, LOG_TYPES } from '../../shared/types.ts';
import { scheduleDates } from '../../shared/schedule.ts';
import { isISODate, todayISO } from '../../shared/dates.ts';

export const trainingRoutes = new Hono<Env>();

// ---------- Program content ----------
const PrescriptionSchema = z
  .object({
    sets: z.number().int().min(0).max(50).optional(),
    reps: z.number().int().min(0).max(1000).optional(),
    repsMax: z.number().int().min(0).max(1000).optional(),
    load: z.number().min(0).max(2000).optional(),
    loadUnit: z.enum(['kg', 'lb']).optional(),
    loadNote: z.string().max(200).optional(),
    rpe: z.number().min(1).max(10).optional(),
    restSec: z.number().int().min(0).max(3600).optional(),
    rounds: z.number().int().min(0).max(100).optional(),
    workSec: z.number().int().min(0).max(3600).optional(),
    durationMin: z.number().min(0).max(600).optional(),
    distanceKm: z.number().min(0).max(500).optional(),
    side: z.string().max(100).optional(),
    notes: z.string().max(2000).optional(),
  })
  .strict();

const Content = z.object({
  note: z.string().max(1000).optional(),
  workouts: z
    .array(
      z.object({
        week_index: z.number().int().min(1).max(52),
        day_of_week: z.number().int().min(0).max(6),
        title: z.string().min(1).max(120),
        category: z.enum(CATEGORIES).nullable().optional(),
        notes: z.string().max(4000).nullable().optional(),
        est_minutes: z.number().int().min(0).max(600).nullable().optional(),
        items: z
          .array(
            z.object({
              exercise_id: z.string(),
              block: z.string().max(60).nullable().optional(),
              prescription: PrescriptionSchema,
              notes: z.string().max(2000).nullable().optional(),
            }),
          )
          .max(60),
      }),
    )
    .max(200),
});
type ContentT = z.infer<typeof Content>;

function loadProgram(c: any, pid: string) {
  const u: AuthUser = requireUser(c);
  const db: DB = c.get('db');
  const p = get(db, 'SELECT * FROM programs WHERE id = ?', pid);
  if (!p) throw notFound();
  const ok = u.role === 'coach' ? p.coach_id === u.id : p.client_id === u.id;
  if (!ok) throw notFound();
  return { u, db, p };
}

export function versionContent(db: DB, versionId: string) {
  const workouts = all(db, 'SELECT * FROM program_workouts WHERE version_id = ? ORDER BY week_index, day_of_week, sort', versionId);
  return workouts.map((w) => ({
    ...w,
    items: all(db, 'SELECT * FROM program_items WHERE workout_id = ? ORDER BY sort', w.id).map((i) => ({
      ...i,
      prescription: parse(i.prescription_json, {}),
      prescription_json: undefined,
    })),
  }));
}

function writeVersion(db: DB, programId: string, coachId: string, content: ContentT, note?: string): string {
  const last = get(db, 'SELECT MAX(version_no) AS n FROM program_versions WHERE program_id = ?', programId);
  const vid = newId();
  insert(db, 'program_versions', { id: vid, program_id: programId, version_no: (last?.n ?? 0) + 1, note: note ?? content.note ?? null, created_by: coachId, created_at: now() });
  content.workouts.forEach((w, wi) => {
    const wid = newId();
    insert(db, 'program_workouts', {
      id: wid, version_id: vid, week_index: w.week_index, day_of_week: w.day_of_week, title: w.title,
      category: w.category ?? null, notes: w.notes ?? null, est_minutes: w.est_minutes ?? null, sort: wi,
    });
    w.items.forEach((it, ii) => {
      const ex = get(db, 'SELECT id, name, log_type FROM exercises WHERE id = ? AND coach_id = ?', it.exercise_id, coachId);
      if (!ex) throw badRequest('invalid_exercise');
      insert(db, 'program_items', {
        id: newId(), workout_id: wid, sort: ii, exercise_id: ex.id, exercise_name: ex.name, log_type: ex.log_type,
        block: it.block ?? null, prescription_json: json(it.prescription), notes: it.notes ?? null,
      });
    });
  });
  run(db, 'UPDATE programs SET current_version_id = ?, updated_at = ? WHERE id = ?', vid, now(), programId);
  return vid;
}

function contentFromVersion(db: DB, versionId: string): ContentT {
  return {
    workouts: versionContent(db, versionId).map((w) => ({
      week_index: w.week_index, day_of_week: w.day_of_week, title: w.title, category: w.category, notes: w.notes, est_minutes: w.est_minutes,
      items: w.items.map((i: any) => ({ exercise_id: i.exercise_id, block: i.block, prescription: i.prescription, notes: i.notes })),
    })),
  };
}

function weekStartDayFor(db: DB, coachId: string): number {
  return get(db, 'SELECT week_start_day FROM coach_settings WHERE coach_id = ?', coachId)?.week_start_day ?? 0;
}

/**
 * (Re)generates future sessions for a client program from its current version. Past sessions and
 * any session with a log are left untouched, so history keeps pointing at the version that was
 * actually prescribed at the time.
 */
export function scheduleProgram(db: DB, programId: string, fromDate: string) {
  const p = get(db, 'SELECT * FROM programs WHERE id = ?', programId)!;
  if (!p.client_id || !p.start_date || p.status !== 'active') return;
  run(
    db,
    `DELETE FROM scheduled_sessions WHERE program_id = ? AND status = 'planned' AND date >= ? AND rescheduled_from_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM workout_logs l WHERE l.session_id = scheduled_sessions.id)`,
    programId, fromDate,
  );
  const workouts = all(db, 'SELECT id, week_index, day_of_week, title FROM program_workouts WHERE version_id = ?', p.current_version_id);
  const titles = new Map(workouts.map((w) => [w.id, w.title]));
  const dates = scheduleDates(
    workouts.map((w) => ({ id: w.id, weekIndex: w.week_index, dayOfWeek: w.day_of_week })),
    p.start_date, p.length_weeks, weekStartDayFor(db, p.coach_id),
  ).filter((d) => d.date >= fromDate);
  for (const d of dates) {
    // Don't duplicate a session already kept on that day (logged, or moved there by the client).
    const existing = get(
      db,
      `SELECT 1 FROM scheduled_sessions s JOIN program_workouts w ON w.id = s.workout_id
       WHERE s.program_id = ? AND (s.date = ? AND w.title = ? AND s.status != 'rescheduled')`,
      programId, d.date, titles.get(d.workoutId),
    );
    if (existing) continue;
    insert(db, 'scheduled_sessions', {
      id: newId(), client_id: p.client_id, program_id: programId, version_id: p.current_version_id, workout_id: d.workoutId,
      date: d.date, status: 'planned', created_at: now(), updated_at: now(),
    });
  }
}

trainingRoutes.get('/programs', (c) => {
  const coach = requireCoach(c);
  const db = c.get('db');
  const clientId = c.req.query('clientId');
  const rows = clientId
    ? all(db, 'SELECT * FROM programs WHERE coach_id = ? AND client_id = ? ORDER BY created_at DESC', coach.id, clientId)
    : all(db, 'SELECT * FROM programs WHERE coach_id = ? AND client_id IS NULL ORDER BY status, name', coach.id);
  return c.json(rows.map((p) => ({ ...p, is_demo: !!p.is_demo, versionNo: get(db, 'SELECT version_no FROM program_versions WHERE id = ?', p.current_version_id)?.version_no ?? null })));
});

const ProgramMeta = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(4000).nullable().optional(),
  length_weeks: z.number().int().min(1).max(52).default(4),
  track: z.enum(['A', 'B']).default('A'),
});

trainingRoutes.post('/programs', async (c) => {
  const coach = requireCoach(c);
  const db = c.get('db');
  const b = ProgramMeta.extend({ content: Content.optional() }).parse(await c.req.json());
  const id = newId();
  tx(db, () => {
    insert(db, 'programs', { id, coach_id: coach.id, client_id: null, name: b.name, description: b.description ?? null, track: b.track, length_weeks: b.length_weeks, created_at: now(), updated_at: now() });
    writeVersion(db, id, coach.id, b.content ?? { workouts: [] }, 'Created');
  });
  return c.json({ id });
});

trainingRoutes.put('/programs/:pid', async (c) => {
  const { u, db, p } = loadProgram(c, c.req.param('pid'));
  if (u.role !== 'coach') throw forbidden();
  const raw = await c.req.json();
  const b = onlySent(ProgramMeta.partial().extend({ status: z.enum(['active', 'archived']).optional() }).parse(raw), raw);
  tx(db, () => {
    update(db, 'programs', p.id, { ...b, updated_at: now() });
    if (b.status === 'archived' && p.client_id)
      run(db, "DELETE FROM scheduled_sessions WHERE program_id = ? AND status = 'planned' AND date >= ? AND NOT EXISTS (SELECT 1 FROM workout_logs l WHERE l.session_id = scheduled_sessions.id)", p.id, todayISO());
    else if (p.client_id && b.length_weeks) scheduleProgram(db, p.id, todayISO());
  });
  return c.json({ ok: true });
});

trainingRoutes.get('/programs/:pid', (c) => {
  const { db, p } = loadProgram(c, c.req.param('pid'));
  const versionId = c.req.query('version') ?? p.current_version_id;
  const v = get(db, 'SELECT * FROM program_versions WHERE id = ? AND program_id = ?', versionId, p.id);
  if (!v) throw notFound();
  const versions = all(db, 'SELECT v.id, v.version_no, v.note, v.created_at, u.name AS created_by_name FROM program_versions v JOIN users u ON u.id = v.created_by WHERE program_id = ? ORDER BY version_no DESC', p.id);
  return c.json({ ...p, is_demo: !!p.is_demo, version: v, versions, workouts: versionContent(db, v.id) });
});

trainingRoutes.post('/programs/:pid/versions', async (c) => {
  const { u, db, p } = loadProgram(c, c.req.param('pid'));
  if (u.role !== 'coach') throw forbidden();
  const content = Content.parse(await c.req.json());
  const today = isISODate(c.req.query('today')) ? c.req.query('today')! : todayISO();
  const vid = tx(db, () => {
    const id = writeVersion(db, p.id, u.id, content);
    if (p.client_id) scheduleProgram(db, p.id, today);
    return id;
  });
  return c.json({ versionId: vid });
});

/** Copy a template (or any of the coach's programs) into a client's personalized program. */
trainingRoutes.post('/programs/:pid/assign', async (c) => {
  const { u, db, p } = loadProgram(c, c.req.param('pid'));
  if (u.role !== 'coach') throw forbidden();
  const b = z.object({ clientId: z.string(), startDate: z.string().refine(isISODate), name: z.string().max(120).optional(), replaceActive: z.boolean().default(true) }).parse(await c.req.json());
  if (!isCoachOf(db, u.id, b.clientId)) throw notFound();
  const id = newId();
  const today = todayISO();
  tx(db, () => {
    if (b.replaceActive) {
      for (const old of all(db, "SELECT id FROM programs WHERE client_id = ? AND status = 'active'", b.clientId)) {
        run(db, "UPDATE programs SET status = 'archived', updated_at = ? WHERE id = ?", now(), old.id);
        run(db, "DELETE FROM scheduled_sessions WHERE program_id = ? AND status = 'planned' AND date >= ? AND NOT EXISTS (SELECT 1 FROM workout_logs l WHERE l.session_id = scheduled_sessions.id)", old.id, b.startDate < today ? today : b.startDate);
      }
    }
    insert(db, 'programs', {
      id, coach_id: u.id, client_id: b.clientId, name: b.name || p.name, description: p.description, track: p.track,
      length_weeks: p.length_weeks, start_date: b.startDate, status: 'active', source_program_id: p.id, is_demo: p.is_demo, created_at: now(), updated_at: now(),
    });
    const srcVersion = get(db, 'SELECT version_no FROM program_versions WHERE id = ?', p.current_version_id);
    writeVersion(db, id, u.id, contentFromVersion(db, p.current_version_id), `From "${p.name}" v${srcVersion?.version_no ?? 1}`);
    scheduleProgram(db, id, b.startDate);
  });
  return c.json({ id });
});

trainingRoutes.get('/clients/:cid/program', (c) => {
  const cid = c.req.param('cid');
  requireClientAccess(c, cid);
  const db = c.get('db');
  const p = get(db, "SELECT * FROM programs WHERE client_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1", cid);
  if (!p) return c.json(null);
  const v = get(db, 'SELECT * FROM program_versions WHERE id = ?', p.current_version_id);
  return c.json({ ...p, version: v, workouts: versionContent(db, p.current_version_id) });
});

// ---------- Schedule & sessions ----------
trainingRoutes.get('/clients/:cid/schedule', (c) => {
  const cid = c.req.param('cid');
  requireClientAccess(c, cid);
  const from = c.req.query('from');
  const to = c.req.query('to');
  if (!isISODate(from) || !isISODate(to)) throw badRequest('dates');
  return c.json(sessionsBetween(c.get('db'), cid, from, to));
});

export function sessionsBetween(db: DB, clientId: string, from: string, to: string) {
  return all(
    db,
    `SELECT s.id, s.date, s.status, s.moved_to_date, s.rescheduled_from_id, s.skip_reason, s.program_id, s.version_id,
            w.title, w.category, w.est_minutes, w.notes AS workout_notes,
            (SELECT COUNT(*) FROM program_items i WHERE i.workout_id = w.id) AS item_count,
            l.id AS log_id, l.status AS log_status, l.coach_reviewed_at
     FROM scheduled_sessions s JOIN program_workouts w ON w.id = s.workout_id
     LEFT JOIN workout_logs l ON l.session_id = s.id
     WHERE s.client_id = ? AND s.date BETWEEN ? AND ? ORDER BY s.date, w.sort`,
    clientId, from, to,
  );
}

function loadSession(c: any) {
  const db: DB = c.get('db');
  const s = get(db, 'SELECT * FROM scheduled_sessions WHERE id = ?', c.req.param('sid'));
  if (!s) throw notFound();
  const u = requireClientAccess(c, s.client_id);
  return { u, db, s };
}

/** Last logged performance of an exercise before a given log (for "last time" hints). */
function previousPerformance(db: DB, clientId: string, exerciseId: string, excludeLogId: string | null) {
  const row = get(
    db,
    `SELECT e.data_json, e.notes, l.date FROM log_entries e JOIN workout_logs l ON l.id = e.log_id
     WHERE l.client_id = ? AND e.exercise_id = ? AND l.status IN ('completed','partial') AND l.id != ?
     ORDER BY l.date DESC, l.completed_at DESC LIMIT 1`,
    clientId, exerciseId, excludeLogId ?? '',
  );
  return row ? { date: row.date, data: parse(row.data_json, {}), notes: row.notes } : null;
}

function exerciseDetail(db: DB, exerciseId: string) {
  const e = get(db, 'SELECT * FROM exercises WHERE id = ?', exerciseId);
  if (!e) return null;
  const media = (id: string | null) =>
    id ? get(db, "SELECT id, title, kind, duration_sec, external_url, mime, status, equipment, level, instructions, purpose FROM media WHERE id = ? AND status = 'ready'", id) ?? null : null;
  return {
    id: e.id, name: e.name, category: e.category, log_type: e.log_type, purpose: e.purpose, cues: e.cues, equipment: e.equipment, level: e.level,
    prerequisites: e.prerequisites, progression_criteria: e.progression_criteria,
    demo: media(e.demo_media_id), practice: media(e.practice_media_id),
    alternatives: all(db, `SELECT e.id, e.name, e.log_type, a.note FROM exercise_alternatives a JOIN exercises e ON e.id = a.alternative_id WHERE a.exercise_id = ? AND e.archived = 0`, e.id),
  };
}

trainingRoutes.get('/sessions/:sid', (c) => {
  const { db, s } = loadSession(c);
  const w = get(db, 'SELECT * FROM program_workouts WHERE id = ?', s.workout_id);
  const items = all(db, 'SELECT * FROM program_items WHERE workout_id = ? ORDER BY sort', s.workout_id);
  const log = get(db, 'SELECT * FROM workout_logs WHERE session_id = ?', s.id);
  const entries = log ? all(db, 'SELECT * FROM log_entries WHERE log_id = ? ORDER BY sort', log.id).map((e) => ({ ...e, data: parse(e.data_json, {}), data_json: undefined })) : [];
  const version = get(db, 'SELECT version_no FROM program_versions WHERE id = ?', s.version_id);
  const exIds = new Set<string>();
  items.forEach((i) => exIds.add(i.exercise_id));
  entries.forEach((e) => e.exercise_id && exIds.add(e.exercise_id));
  const exercises: Record<string, unknown> = {};
  const previous: Record<string, unknown> = {};
  for (const id of exIds) {
    exercises[id] = exerciseDetail(db, id);
    for (const a of (exercises[id] as any)?.alternatives ?? []) if (!exercises[a.id]) exercises[a.id] = exerciseDetail(db, a.id);
  }
  for (const id of Object.keys(exercises)) previous[id] = previousPerformance(db, s.client_id, id, log?.id ?? null);
  return c.json({
    session: s,
    workout: w,
    versionNo: version?.version_no ?? null,
    items: items.map((i) => ({ ...i, prescription: parse(i.prescription_json, {}), prescription_json: undefined })),
    log: log ?? null,
    entries,
    exercises,
    previous,
  });
});

function requireOwnClient(u: AuthUser, clientId: string) {
  if (u.role !== 'client' || u.id !== clientId) throw forbidden();
}

/** Starts (or resumes) the log for a session. One log per scheduled session. */
trainingRoutes.post('/sessions/:sid/start', (c) => {
  const { u, db, s } = loadSession(c);
  requireOwnClient(u, s.client_id);
  const existing = get(db, 'SELECT id FROM workout_logs WHERE session_id = ?', s.id);
  if (existing) return c.json({ logId: existing.id });
  if (s.status === 'rescheduled') throw badRequest('rescheduled');
  const w = get(db, 'SELECT * FROM program_workouts WHERE id = ?', s.workout_id)!;
  const id = newId();
  tx(db, () => {
    insert(db, 'workout_logs', { id, client_id: s.client_id, session_id: s.id, workout_id: w.id, title: w.title, date: s.date, status: 'draft', started_at: now(), updated_at: now() });
    all(db, 'SELECT * FROM program_items WHERE workout_id = ? ORDER BY sort', w.id).forEach((i, idx) => {
      const p = parse<any>(i.prescription_json, {});
      const data = i.log_type === 'strength' ? { sets: Array.from({ length: Math.max(1, p.sets ?? 1) }, () => ({ reps: null, weight: null, unit: p.loadUnit ?? 'kg', done: false })) } : {};
      insert(db, 'log_entries', { id: newId(), log_id: id, program_item_id: i.id, exercise_id: i.exercise_id, exercise_name: i.exercise_name, log_type: i.log_type, sort: idx, data_json: json(data) });
    });
  });
  return c.json({ logId: id });
});

const NullNum = z.number().finite().min(0).max(100000).nullable().optional();
const EntryData = z.object({
  sets: z.array(z.object({ reps: NullNum, weight: NullNum, unit: z.enum(['kg', 'lb']).optional(), rpe: z.number().min(1).max(10).nullable().optional(), done: z.boolean().optional() })).max(50).optional(),
  rounds: NullNum, reps: NullNum, workSec: NullNum, restSec: NullNum, distanceKm: NullNum, durationSec: NullNum,
  completed: z.boolean().optional(),
  difficulty: z.enum(['easy', 'ok', 'hard']).nullable().optional(),
});

const LogBody = z.object({
  notes: z.string().max(8000).nullable().optional(),
  session_rpe: z.number().int().min(1).max(10).nullable().optional(),
  entries: z
    .array(
      z.object({
        program_item_id: z.string().nullable().optional(),
        exercise_id: z.string(),
        data: EntryData,
        notes: z.string().max(4000).nullable().optional(),
      }),
    )
    .max(80),
});

function loadLog(c: any) {
  const db: DB = c.get('db');
  const l = get(db, 'SELECT * FROM workout_logs WHERE id = ?', c.req.param('lid'));
  if (!l) throw notFound();
  const u = requireClientAccess(c, l.client_id);
  return { u, db, l };
}

/** Autosave. Replaces the log's actual entries; prescriptions (program_items) are never touched. */
function saveLogBody(db: DB, l: any, b: z.infer<typeof LogBody>) {
  const items = new Map(
    (l.workout_id ? all(db, 'SELECT id, exercise_id FROM program_items WHERE workout_id = ?', l.workout_id) : []).map((i) => [i.id, i.exercise_id]),
  );
  const coachId = get(db, "SELECT coach_id FROM coach_clients WHERE client_id = ? AND status != 'ended'", l.client_id)?.coach_id;
  run(db, 'DELETE FROM log_entries WHERE log_id = ?', l.id);
  b.entries.forEach((e, idx) => {
    const prescribedEx = e.program_item_id ? items.get(e.program_item_id) : undefined;
    if (e.program_item_id && !prescribedEx) throw badRequest('invalid_item');
    let substituted: string | null = null;
    if (prescribedEx && prescribedEx !== e.exercise_id) {
      const ok = get(db, 'SELECT 1 FROM exercise_alternatives WHERE exercise_id = ? AND alternative_id = ?', prescribedEx, e.exercise_id);
      if (!ok) throw badRequest('alternative_not_approved');
      substituted = prescribedEx;
    }
    const ex = get(db, 'SELECT id, name, log_type FROM exercises WHERE id = ? AND coach_id = ?', e.exercise_id, coachId);
    if (!ex) throw badRequest('invalid_exercise');
    insert(db, 'log_entries', {
      id: newId(), log_id: l.id, program_item_id: e.program_item_id ?? null, exercise_id: ex.id, exercise_name: ex.name, log_type: ex.log_type,
      substituted_for_id: substituted, sort: idx, data_json: json(e.data), notes: e.notes ?? null,
    });
  });
  update(db, 'workout_logs', l.id, { notes: b.notes ?? null, session_rpe: b.session_rpe ?? null, updated_at: now() });
}

trainingRoutes.get('/logs/:lid', (c) => {
  const { db, l } = loadLog(c);
  const entries = all(db, 'SELECT * FROM log_entries WHERE log_id = ? ORDER BY sort', l.id).map((e) => ({ ...e, data: parse(e.data_json, {}), data_json: undefined }));
  const items = l.workout_id ? all(db, 'SELECT * FROM program_items WHERE workout_id = ? ORDER BY sort', l.workout_id).map((i) => ({ ...i, prescription: parse(i.prescription_json, {}), prescription_json: undefined })) : [];
  const feedback = all(db, "SELECT m.*, u.name AS sender_name FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.ref_type = 'workout_log' AND m.ref_id = ? ORDER BY m.created_at", l.id);
  const media = all(db, "SELECT id, title, status, mime, coach_reviewed_at, created_at FROM media WHERE client_id = ? AND json_extract(context_json, '$.logId') = ?", l.client_id, l.id);
  return c.json({ log: l, entries, items, feedback, media });
});

trainingRoutes.put('/logs/:lid', async (c) => {
  const { u, db, l } = loadLog(c);
  requireOwnClient(u, l.client_id);
  if (l.status === 'skipped') throw badRequest('skipped');
  const b = LogBody.parse(await c.req.json());
  tx(db, () => saveLogBody(db, l, b));
  return c.json({ ok: true, savedAt: now() });
});

trainingRoutes.post('/logs/:lid/finish', async (c) => {
  const { u, db, l } = loadLog(c);
  requireOwnClient(u, l.client_id);
  const b = LogBody.extend({ status: z.enum(['completed', 'partial']) }).parse(await c.req.json());
  tx(db, () => {
    saveLogBody(db, l, b);
    update(db, 'workout_logs', l.id, { status: b.status, completed_at: l.completed_at ?? now(), coach_reviewed_at: null });
    if (l.session_id) run(db, 'UPDATE scheduled_sessions SET status = ?, updated_at = ? WHERE id = ?', b.status, now(), l.session_id);
  });
  return c.json({ ok: true });
});

trainingRoutes.post('/sessions/:sid/skip', async (c) => {
  const { u, db, s } = loadSession(c);
  requireOwnClient(u, s.client_id);
  const b = z.object({ reason: z.string().max(2000).optional() }).parse(await c.req.json());
  const log = get(db, 'SELECT * FROM workout_logs WHERE session_id = ?', s.id);
  if (log && log.status !== 'draft') throw badRequest('already_logged');
  const w = get(db, 'SELECT title FROM program_workouts WHERE id = ?', s.workout_id)!;
  tx(db, () => {
    run(db, "UPDATE scheduled_sessions SET status = 'skipped', skip_reason = ?, updated_at = ? WHERE id = ?", b.reason ?? null, now(), s.id);
    if (log) update(db, 'workout_logs', log.id, { status: 'skipped', notes: b.reason ?? log.notes, completed_at: now(), updated_at: now() });
    else insert(db, 'workout_logs', { id: newId(), client_id: s.client_id, session_id: s.id, workout_id: s.workout_id, title: w.title, date: s.date, status: 'skipped', notes: b.reason ?? null, started_at: now(), completed_at: now(), updated_at: now() });
  });
  return c.json({ ok: true });
});

trainingRoutes.post('/sessions/:sid/reschedule', async (c) => {
  const { u, db, s } = loadSession(c);
  requireOwnClient(u, s.client_id);
  const b = z.object({ date: z.string().refine(isISODate) }).parse(await c.req.json());
  if (s.status !== 'planned') throw badRequest('not_planned');
  if (get(db, "SELECT 1 FROM workout_logs WHERE session_id = ? AND status != 'draft'", s.id)) throw badRequest('already_logged');
  if (b.date === s.date) throw badRequest('same_date');
  const id = newId();
  tx(db, () => {
    const draft = get(db, 'SELECT id FROM workout_logs WHERE session_id = ?', s.id);
    run(db, "UPDATE scheduled_sessions SET status = 'rescheduled', moved_to_date = ?, updated_at = ? WHERE id = ?", b.date, now(), s.id);
    insert(db, 'scheduled_sessions', {
      id, client_id: s.client_id, program_id: s.program_id, version_id: s.version_id, workout_id: s.workout_id,
      date: b.date, status: 'planned', rescheduled_from_id: s.id, created_at: now(), updated_at: now(),
    });
    // A draft started on the old date follows the session.
    if (draft) run(db, 'UPDATE workout_logs SET session_id = ?, date = ? WHERE id = ?', id, b.date, draft.id);
  });
  return c.json({ id });
});

trainingRoutes.get('/clients/:cid/logs', (c) => {
  const cid = c.req.param('cid');
  requireClientAccess(c, cid);
  const limit = Math.min(Number(c.req.query('limit') ?? 30), 200);
  return c.json(
    all(
      c.get('db'),
      `SELECT l.id, l.title, l.date, l.status, l.session_rpe, l.notes, l.completed_at, l.coach_reviewed_at,
              (SELECT COUNT(*) FROM messages m WHERE m.ref_type = 'workout_log' AND m.ref_id = l.id) AS feedback_count
       FROM workout_logs l WHERE l.client_id = ? AND l.status != 'draft' ORDER BY l.date DESC, l.completed_at DESC LIMIT ?`,
      cid, limit,
    ),
  );
});

trainingRoutes.post('/logs/:lid/review', async (c) => {
  const coach = requireCoach(c);
  const { db, l } = loadLog(c);
  const b = z.object({ feedback: z.string().max(8000).optional() }).parse(await c.req.json());
  tx(db, () => {
    update(db, 'workout_logs', l.id, { coach_reviewed_at: now() });
    if (b.feedback?.trim()) insert(db, 'messages', { id: newId(), client_id: l.client_id, sender_id: coach.id, body: b.feedback.trim(), ref_type: 'workout_log', ref_id: l.id, created_at: now() });
  });
  return c.json({ ok: true });
});

/** Every logged entry for one exercise, oldest first, with its conditions preserved. */
trainingRoutes.get('/clients/:cid/exercise-history', (c) => {
  const cid = c.req.param('cid');
  requireClientAccess(c, cid);
  const db = c.get('db');
  const exerciseId = c.req.query('exerciseId');
  if (!exerciseId) {
    return c.json(
      all(
        db,
        `SELECT e.exercise_id AS id, e.exercise_name AS name, e.log_type, COUNT(*) AS n, MAX(l.date) AS last FROM log_entries e
         JOIN workout_logs l ON l.id = e.log_id WHERE l.client_id = ? AND l.status IN ('completed','partial') GROUP BY e.exercise_id ORDER BY last DESC`,
        cid,
      ),
    );
  }
  return c.json(
    all(
      db,
      `SELECT e.id, e.data_json, e.notes, e.substituted_for_id, l.date, l.id AS log_id, i.prescription_json
       FROM log_entries e JOIN workout_logs l ON l.id = e.log_id LEFT JOIN program_items i ON i.id = e.program_item_id
       WHERE l.client_id = ? AND e.exercise_id = ? AND l.status IN ('completed','partial') ORDER BY l.date`,
      cid, exerciseId,
    ).map((r) => ({ id: r.id, date: r.date, logId: r.log_id, notes: r.notes, substituted: !!r.substituted_for_id, data: parse(r.data_json, {}), prescription: parse(r.prescription_json, null) })),
  );
});
