import { Hono } from 'hono';
import { z } from 'zod';
import { all, get, insert, run, update, now, newId, json, parse, tx, onlySent } from '../db.ts';
import type { Env } from '../auth.ts';
import {
  requireCoach, requireUser, requireClientAccess, requireLibraryAccess, notFound, badRequest,
  canAccessMedia, libraryCoachId, coachIdsOf,
} from '../access.ts';
import { CATEGORIES, LOG_TYPES } from '../../shared/types.ts';
import { ALLOWED_MIME, MAX_UPLOAD_BYTES, type LocalStorage } from '../storage.ts';

export function libraryRoutes(storage: LocalStorage) {
  const r = new Hono<Env>();

  // ---------- Exercises & practices ----------
  const ExerciseBody = z.object({
    name: z.string().min(1).max(120),
    category: z.enum(CATEGORIES),
    log_type: z.enum(LOG_TYPES),
    purpose: z.string().max(4000).nullable().optional(),
    prerequisites: z.string().max(4000).nullable().optional(),
    starting_prescription: z.string().max(4000).nullable().optional(),
    cues: z.string().max(4000).nullable().optional(),
    progression_criteria: z.string().max(4000).nullable().optional(),
    equipment: z.string().max(500).nullable().optional(),
    level: z.string().max(100).nullable().optional(),
    demo_media_id: z.string().nullable().optional(),
    practice_media_id: z.string().nullable().optional(),
    archived: z.boolean().optional(),
    alternatives: z.array(z.object({ id: z.string(), note: z.string().max(500).nullable().optional() })).optional(),
  });

  function checkOwnMedia(db: any, coachId: string, id: string | null | undefined) {
    if (!id) return;
    const m = get(db, "SELECT 1 FROM media WHERE id = ? AND scope = 'library' AND coach_id = ?", id, coachId);
    if (!m) throw badRequest('invalid_media');
  }

  function exerciseOut(db: any, e: any) {
    const alternatives = all(
      db,
      `SELECT a.alternative_id AS id, a.note, e.name, e.category, e.log_type, e.demo_media_id FROM exercise_alternatives a
       JOIN exercises e ON e.id = a.alternative_id WHERE a.exercise_id = ? AND e.archived = 0`,
      e.id,
    );
    return { ...e, is_demo: !!e.is_demo, archived: !!e.archived, alternatives };
  }

  r.get('/exercises', (c) => {
    const u = requireUser(c);
    const db = c.get('db');
    const coachId = libraryCoachId(db, u);
    if (!coachId) return c.json([]);
    // Clients see only exercises used in their programs (plus their approved alternatives).
    const rows =
      u.role === 'coach'
        ? all(db, 'SELECT * FROM exercises WHERE coach_id = ? ORDER BY archived, name', coachId)
        : all(
            db,
            `SELECT DISTINCT e.* FROM exercises e WHERE e.coach_id = ? AND e.archived = 0 AND (
               e.id IN (SELECT i.exercise_id FROM program_items i JOIN program_workouts w ON w.id = i.workout_id
                        JOIN program_versions v ON v.id = w.version_id JOIN programs p ON p.id = v.program_id WHERE p.client_id = ?)
               OR e.id IN (SELECT a.alternative_id FROM exercise_alternatives a JOIN program_items i ON i.exercise_id = a.exercise_id
                        JOIN program_workouts w ON w.id = i.workout_id JOIN program_versions v ON v.id = w.version_id
                        JOIN programs p ON p.id = v.program_id WHERE p.client_id = ?)) ORDER BY e.name`,
            coachId, u.id, u.id,
          );
    return c.json(rows.map((e) => exerciseOut(db, e)));
  });

  r.get('/exercises/:id', (c) => {
    const db = c.get('db');
    const e = get(db, 'SELECT * FROM exercises WHERE id = ?', c.req.param('id'));
    if (!e) throw notFound();
    requireLibraryAccess(c, e.coach_id);
    return c.json(exerciseOut(db, e));
  });

  function saveAlternatives(db: any, coachId: string, exerciseId: string, alts: { id: string; note?: string | null }[] | undefined) {
    if (!alts) return;
    run(db, 'DELETE FROM exercise_alternatives WHERE exercise_id = ?', exerciseId);
    for (const a of alts) {
      if (a.id === exerciseId) continue;
      if (!get(db, 'SELECT 1 FROM exercises WHERE id = ? AND coach_id = ?', a.id, coachId)) throw badRequest('invalid_alternative');
      insert(db, 'exercise_alternatives', { exercise_id: exerciseId, alternative_id: a.id, note: a.note ?? null });
    }
  }

  r.post('/exercises', async (c) => {
    const coach = requireCoach(c);
    const db = c.get('db');
    const { alternatives, ...b } = ExerciseBody.parse(await c.req.json());
    checkOwnMedia(db, coach.id, b.demo_media_id);
    checkOwnMedia(db, coach.id, b.practice_media_id);
    const id = newId();
    tx(db, () => {
      insert(db, 'exercises', { ...b, archived: b.archived ? 1 : 0, id, coach_id: coach.id, created_at: now(), updated_at: now() });
      saveAlternatives(db, coach.id, id, alternatives);
    });
    return c.json({ id });
  });

  r.put('/exercises/:id', async (c) => {
    const coach = requireCoach(c);
    const db = c.get('db');
    const e = get(db, 'SELECT * FROM exercises WHERE id = ? AND coach_id = ?', c.req.param('id'), coach.id);
    if (!e) throw notFound();
    const raw = await c.req.json();
    const { alternatives, ...b } = onlySent(ExerciseBody.partial().parse(raw), raw);
    checkOwnMedia(db, coach.id, b.demo_media_id);
    checkOwnMedia(db, coach.id, b.practice_media_id);
    tx(db, () => {
      update(db, 'exercises', e.id, { ...b, ...(b.archived != null ? { archived: b.archived ? 1 : 0 } : {}), updated_at: now() });
      saveAlternatives(db, coach.id, e.id, alternatives);
    });
    return c.json({ ok: true });
  });

  // ---------- Media (library videos, client submissions, photos) ----------
  const MediaMeta = z.object({
    kind: z.enum(['demo', 'follow_along', 'submission', 'progress', 'recipe', 'other']),
    title: z.string().min(1).max(160),
    purpose: z.string().max(4000).nullable().optional(),
    duration_sec: z.number().int().nonnegative().nullable().optional(),
    equipment: z.string().max(500).nullable().optional(),
    level: z.string().max(100).nullable().optional(),
    instructions: z.string().max(8000).nullable().optional(),
    external_url: z.string().url().startsWith('https://').nullable().optional(),
    context: z.record(z.string(), z.string()).optional(),
  });

  const mediaOut = (m: any) => {
    const { file_key: _k, context_json, ...rest } = m;
    return { ...rest, is_demo: !!m.is_demo, context: parse(context_json, {}), hasFile: !!m.file_key };
  };

  r.get('/media', (c) => {
    const u = requireUser(c);
    const db = c.get('db');
    const coachId = libraryCoachId(db, u);
    if (!coachId) return c.json([]);
    const kind = c.req.query('kind');
    const rows = all(
      db,
      `SELECT * FROM media WHERE scope = 'library' AND coach_id = ? AND (? IS NULL OR kind = ?) ${u.role === 'client' ? "AND status = 'ready'" : ''} ORDER BY created_at DESC`,
      coachId, kind ?? null, kind ?? null,
    );
    return c.json(rows.map(mediaOut));
  });

  /** Coach creates library media metadata (file uploaded separately, or an external https link). */
  r.post('/media', async (c) => {
    const coach = requireCoach(c);
    const b = MediaMeta.parse(await c.req.json());
    const id = newId();
    const { context, ...meta } = b;
    insert(c.get('db'), 'media', {
      ...meta, id, uploader_id: coach.id, scope: 'library', coach_id: coach.id,
      status: b.external_url ? 'ready' : 'uploading', context_json: json(context), created_at: now(),
    });
    return c.json({ id });
  });

  /** A client (or their coach) creates a private media record for that client. */
  r.post('/clients/:cid/media', async (c) => {
    const cid = c.req.param('cid');
    const u = requireClientAccess(c, cid);
    const b = MediaMeta.parse(await c.req.json());
    if (b.kind === 'demo' || b.kind === 'follow_along') throw badRequest('invalid_kind');
    const id = newId();
    const { context, ...meta } = b;
    insert(c.get('db'), 'media', {
      ...meta, external_url: null, id, uploader_id: u.id, scope: 'private', client_id: cid, coach_id: null,
      status: 'uploading', context_json: json(context), created_at: now(),
    });
    return c.json({ id });
  });

  r.get('/clients/:cid/media', (c) => {
    const cid = c.req.param('cid');
    requireClientAccess(c, cid);
    return c.json(all(c.get('db'), "SELECT * FROM media WHERE scope = 'private' AND client_id = ? ORDER BY created_at DESC", cid).map(mediaOut));
  });

  function loadMedia(c: any) {
    const u = requireUser(c);
    const db = c.get('db');
    const m = get(db, 'SELECT * FROM media WHERE id = ?', c.req.param('id'));
    if (!m || !canAccessMedia(db, u, m)) throw notFound();
    return { u, db, m };
  }

  r.get('/media/:id', (c) => c.json(mediaOut(loadMedia(c).m)));

  r.put('/media/:id', async (c) => {
    const { u, db, m } = loadMedia(c);
    if (m.uploader_id !== u.id) throw notFound();
    const b = MediaMeta.partial().omit({ kind: true, context: true }).parse(await c.req.json());
    update(db, 'media', m.id, b);
    return c.json({ ok: true });
  });

  /** Raw body upload, streamed to storage. Re-uploading replaces a failed/interrupted attempt. */
  r.put('/media/:id/file', async (c) => {
    const { u, db, m } = loadMedia(c);
    if (m.uploader_id !== u.id) throw notFound();
    if (m.status === 'ready' && m.file_key) throw badRequest('already_uploaded');
    const mime = (c.req.header('content-type') ?? '').split(';')[0].trim();
    if (!ALLOWED_MIME.test(mime)) throw badRequest('unsupported_type');
    const declared = Number(c.req.header('content-length') ?? 0);
    if (declared > MAX_UPLOAD_BYTES) return c.json({ error: 'too_large' }, 413);
    const body = c.req.raw.body;
    if (!body) throw badRequest('empty');
    const key = newId();
    try {
      const size = await storage.write(key, body);
      if (size === 0) throw new Error('empty');
      if (m.file_key) storage.remove(m.file_key);
      update(db, 'media', m.id, { file_key: key, mime, size, status: 'ready' });
      return c.json({ ok: true, size });
    } catch (e) {
      update(db, 'media', m.id, { status: 'failed' });
      const msg = (e as Error).message;
      return c.json({ error: msg === 'too_large' ? 'too_large' : 'upload_interrupted' }, msg === 'too_large' ? 413 : 400);
    }
  });

  /** Authorized file read with HTTP Range support (needed for video seeking on phones). */
  r.get('/media/:id/file', (c) => {
    const { m } = loadMedia(c);
    if (!m.file_key || m.status !== 'ready') throw notFound();
    const size = storage.size(m.file_key);
    if (size == null) throw notFound();
    const headers: Record<string, string> = {
      'Content-Type': m.mime ?? 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    };
    const range = c.req.header('range');
    const match = range && /^bytes=(\d*)-(\d*)$/.exec(range);
    if (match) {
      let start = match[1] ? Number(match[1]) : size - Number(match[2]);
      let end = match[1] && match[2] ? Number(match[2]) : size - 1;
      if (!match[1]) end = size - 1;
      end = Math.min(end, size - 1);
      start = Math.max(0, start);
      if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
      return new Response(storage.read(m.file_key, start, end), {
        status: 206,
        headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) },
      });
    }
    return new Response(storage.read(m.file_key), { headers: { ...headers, 'Content-Length': String(size) } });
  });

  r.post('/media/:id/review', async (c) => {
    const coach = requireCoach(c);
    const { db, m } = loadMedia(c);
    if (m.scope !== 'private' || !coachIdsOf(db, m.client_id).includes(coach.id)) throw notFound();
    const b = z.object({ feedback: z.string().max(8000).optional() }).parse(await c.req.json());
    tx(db, () => {
      update(db, 'media', m.id, { coach_reviewed_at: now() });
      if (b.feedback?.trim())
        insert(db, 'messages', { id: newId(), client_id: m.client_id, sender_id: coach.id, body: b.feedback.trim(), ref_type: 'media', ref_id: m.id, created_at: now() });
    });
    return c.json({ ok: true });
  });

  return r;
}
