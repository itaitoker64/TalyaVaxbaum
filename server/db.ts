import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type DB = DatabaseSync;
// Rows are validated at the API boundary; inside the server they are loosely typed.
export type Row = any;

/**
 * Numbered migrations tracked with PRAGMA user_version. Never edit a published step; only append.
 * Every step runs inside a transaction so an interrupted start can't leave a half-migrated file.
 */
const MIGRATIONS: string[] = [
  /* 1: initial schema */ `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('coach','client')),
    locale TEXT NOT NULL DEFAULT 'he',
    is_demo INTEGER NOT NULL DEFAULT 0,
    disabled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE coach_clients (
    coach_id TEXT NOT NULL REFERENCES users(id),
    client_id TEXT NOT NULL REFERENCES users(id),
    track TEXT NOT NULL DEFAULT 'A' CHECK (track IN ('A','B')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','ended')),
    created_at TEXT NOT NULL,
    PRIMARY KEY (coach_id, client_id)
  );
  CREATE INDEX coach_clients_client ON coach_clients(client_id);
  CREATE TABLE invites (
    code TEXT PRIMARY KEY,
    coach_id TEXT NOT NULL REFERENCES users(id),
    name TEXT,
    email TEXT,
    track TEXT NOT NULL DEFAULT 'A',
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_by TEXT REFERENCES users(id),
    used_at TEXT
  );
  CREATE TABLE client_profiles (
    client_id TEXT PRIMARY KEY REFERENCES users(id),
    onboarding_json TEXT,
    onboarding_completed_at TEXT,
    nutrition_json TEXT NOT NULL DEFAULT '{"mode":"diary"}',
    coach_notes TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE coach_settings (
    coach_id TEXT PRIMARY KEY REFERENCES users(id),
    response_expectation TEXT,
    whatsapp_url TEXT,
    week_start_day INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE media (
    id TEXT PRIMARY KEY,
    uploader_id TEXT NOT NULL REFERENCES users(id),
    scope TEXT NOT NULL CHECK (scope IN ('library','private')),
    coach_id TEXT REFERENCES users(id),
    client_id TEXT REFERENCES users(id),
    kind TEXT NOT NULL CHECK (kind IN ('demo','follow_along','submission','progress','recipe','other')),
    title TEXT NOT NULL,
    purpose TEXT, duration_sec INTEGER, equipment TEXT, level TEXT, instructions TEXT,
    mime TEXT, size INTEGER, file_key TEXT, external_url TEXT,
    status TEXT NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading','ready','failed')),
    context_json TEXT,
    coach_reviewed_at TEXT,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    CHECK ((scope = 'library' AND coach_id IS NOT NULL) OR (scope = 'private' AND client_id IS NOT NULL))
  );
  CREATE INDEX media_client ON media(client_id);

  CREATE TABLE exercises (
    id TEXT PRIMARY KEY,
    coach_id TEXT NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    log_type TEXT NOT NULL CHECK (log_type IN ('strength','circuit','running','practice')),
    purpose TEXT, prerequisites TEXT, starting_prescription TEXT, cues TEXT,
    progression_criteria TEXT, equipment TEXT, level TEXT,
    demo_media_id TEXT REFERENCES media(id),
    practice_media_id TEXT REFERENCES media(id),
    is_demo INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE exercise_alternatives (
    exercise_id TEXT NOT NULL REFERENCES exercises(id),
    alternative_id TEXT NOT NULL REFERENCES exercises(id),
    note TEXT,
    PRIMARY KEY (exercise_id, alternative_id)
  );

  CREATE TABLE programs (
    id TEXT PRIMARY KEY,
    coach_id TEXT NOT NULL REFERENCES users(id),
    client_id TEXT REFERENCES users(id),
    name TEXT NOT NULL,
    description TEXT,
    track TEXT NOT NULL DEFAULT 'A',
    length_weeks INTEGER NOT NULL DEFAULT 4,
    start_date TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
    source_program_id TEXT REFERENCES programs(id),
    current_version_id TEXT,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE INDEX programs_client ON programs(client_id);
  -- Program versions are immutable. Editing a program creates a new version.
  CREATE TABLE program_versions (
    id TEXT PRIMARY KEY,
    program_id TEXT NOT NULL REFERENCES programs(id),
    version_no INTEGER NOT NULL,
    note TEXT,
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    UNIQUE (program_id, version_no)
  );
  CREATE TABLE program_workouts (
    id TEXT PRIMARY KEY,
    version_id TEXT NOT NULL REFERENCES program_versions(id),
    week_index INTEGER NOT NULL,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    title TEXT NOT NULL,
    category TEXT,
    notes TEXT,
    est_minutes INTEGER,
    sort INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE program_items (
    id TEXT PRIMARY KEY,
    workout_id TEXT NOT NULL REFERENCES program_workouts(id),
    sort INTEGER NOT NULL,
    exercise_id TEXT NOT NULL REFERENCES exercises(id),
    exercise_name TEXT NOT NULL,
    log_type TEXT NOT NULL,
    block TEXT,
    prescription_json TEXT NOT NULL,
    notes TEXT
  );

  CREATE TABLE scheduled_sessions (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL REFERENCES users(id),
    program_id TEXT NOT NULL REFERENCES programs(id),
    version_id TEXT NOT NULL REFERENCES program_versions(id),
    workout_id TEXT NOT NULL REFERENCES program_workouts(id),
    date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','completed','partial','skipped','rescheduled')),
    moved_to_date TEXT,
    rescheduled_from_id TEXT REFERENCES scheduled_sessions(id),
    skip_reason TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE INDEX sessions_client_date ON scheduled_sessions(client_id, date);

  CREATE TABLE workout_logs (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL REFERENCES users(id),
    session_id TEXT UNIQUE REFERENCES scheduled_sessions(id),
    workout_id TEXT REFERENCES program_workouts(id),
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','completed','partial','skipped')),
    session_rpe INTEGER,
    notes TEXT,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    updated_at TEXT NOT NULL,
    coach_reviewed_at TEXT
  );
  CREATE INDEX logs_client_date ON workout_logs(client_id, date);
  CREATE TABLE log_entries (
    id TEXT PRIMARY KEY,
    log_id TEXT NOT NULL REFERENCES workout_logs(id) ON DELETE CASCADE,
    program_item_id TEXT REFERENCES program_items(id),
    exercise_id TEXT REFERENCES exercises(id),
    exercise_name TEXT NOT NULL,
    log_type TEXT NOT NULL,
    substituted_for_id TEXT REFERENCES exercises(id),
    sort INTEGER NOT NULL,
    data_json TEXT NOT NULL,
    notes TEXT
  );
  CREATE INDEX log_entries_exercise ON log_entries(exercise_id);

  CREATE TABLE goals (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL REFERENCES users(id),
    created_by TEXT NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    description TEXT,
    kind TEXT NOT NULL CHECK (kind IN ('performance','mobility','adherence','body','quality','other')),
    metric TEXT,
    unit TEXT,
    direction TEXT NOT NULL DEFAULT 'increase' CHECK (direction IN ('increase','decrease','range')),
    baseline_value REAL, baseline_date TEXT,
    target_value REAL, target_min REAL, target_max REAL,
    review_date TEXT,
    procedure TEXT,
    conditions_json TEXT,
    criteria_json TEXT,
    method_version INTEGER NOT NULL DEFAULT 1,
    client_can_record INTEGER NOT NULL DEFAULT 1,
    show_on_today INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','achieved','paused','archived')),
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE INDEX goals_client ON goals(client_id);
  CREATE TABLE goal_revisions (
    id TEXT PRIMARY KEY,
    goal_id TEXT NOT NULL REFERENCES goals(id),
    revised_by TEXT NOT NULL REFERENCES users(id),
    revised_at TEXT NOT NULL,
    before_json TEXT NOT NULL,
    after_json TEXT NOT NULL,
    reason TEXT,
    method_changed INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE measurements (
    id TEXT PRIMARY KEY,
    goal_id TEXT NOT NULL REFERENCES goals(id),
    client_id TEXT NOT NULL REFERENCES users(id),
    value REAL,
    measured_on TEXT NOT NULL,
    recorded_by TEXT NOT NULL REFERENCES users(id),
    notes TEXT,
    conditions_json TEXT,
    method_version INTEGER NOT NULL,
    media_id TEXT REFERENCES media(id),
    is_baseline INTEGER NOT NULL DEFAULT 0,
    voided_at TEXT, void_reason TEXT, voided_by TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX measurements_goal ON measurements(goal_id);
  CREATE TABLE quality_reviews (
    id TEXT PRIMARY KEY,
    goal_id TEXT NOT NULL REFERENCES goals(id),
    measurement_id TEXT REFERENCES measurements(id),
    coach_id TEXT NOT NULL REFERENCES users(id),
    ratings_json TEXT NOT NULL,
    summary TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE checkins (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL REFERENCES users(id),
    week_start TEXT NOT NULL,
    answers_json TEXT NOT NULL,
    submitted_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    coach_reviewed_at TEXT,
    UNIQUE (client_id, week_start)
  );
  CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL REFERENCES users(id),
    sender_id TEXT NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,
    ref_type TEXT, ref_id TEXT,
    created_at TEXT NOT NULL,
    read_at TEXT
  );
  CREATE INDEX messages_client ON messages(client_id, created_at);
  CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL REFERENCES users(id),
    created_by TEXT NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    notes TEXT,
    due_date TEXT,
    done_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE foods (
    id TEXT PRIMARY KEY,
    created_by TEXT NOT NULL REFERENCES users(id),
    coach_id TEXT REFERENCES users(id),
    client_id TEXT REFERENCES users(id),
    name TEXT NOT NULL,
    brand TEXT,
    kcal REAL, protein REAL, carbs REAL, fat REAL,
    serving_g REAL, serving_label TEXT,
    source TEXT NOT NULL DEFAULT 'label' CHECK (source IN ('label','database','custom','demo')),
    source_ref TEXT,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    CHECK (coach_id IS NOT NULL OR client_id IS NOT NULL)
  );
  CREATE TABLE recipes (
    id TEXT PRIMARY KEY,
    coach_id TEXT NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    description TEXT,
    photo_media_id TEXT REFERENCES media(id),
    video_url TEXT,
    prep_minutes INTEGER,
    servings REAL NOT NULL DEFAULT 1,
    instructions TEXT,
    tags TEXT,
    visibility TEXT NOT NULL DEFAULT 'draft' CHECK (visibility IN ('draft','clients','link')),
    share_token TEXT UNIQUE,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE recipe_ingredients (
    id TEXT PRIMARY KEY,
    recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    sort INTEGER NOT NULL,
    food_id TEXT REFERENCES foods(id),
    name TEXT NOT NULL,
    grams REAL NOT NULL,
    display_qty TEXT,
    substitutions_json TEXT
  );
  CREATE TABLE food_entries (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL REFERENCES users(id),
    date TEXT NOT NULL,
    meal TEXT NOT NULL CHECK (meal IN ('breakfast','lunch','dinner','snack')),
    food_id TEXT REFERENCES foods(id),
    recipe_id TEXT REFERENCES recipes(id),
    name TEXT NOT NULL,
    amount REAL NOT NULL,
    unit TEXT NOT NULL CHECK (unit IN ('g','serving')),
    grams REAL,
    kcal REAL, protein REAL, carbs REAL, fat REAL,
    basis TEXT NOT NULL CHECK (basis IN ('food','recipe','manual','estimate')),
    detail_json TEXT,
    notes TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE INDEX food_entries_client_date ON food_entries(client_id, date);
  CREATE TABLE saved_meals (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    items_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE favorites (
    user_id TEXT NOT NULL REFERENCES users(id),
    kind TEXT NOT NULL CHECK (kind IN ('food','recipe','saved_meal')),
    ref_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, kind, ref_id)
  );
  `,
  /* 2: design refinement — imagery, captions, levels, guided practice library */ `
  ALTER TABLE media ADD COLUMN category TEXT;
  ALTER TABLE media ADD COLUMN cover_media_id TEXT REFERENCES media(id);
  ALTER TABLE media ADD COLUMN captions_media_id TEXT REFERENCES media(id);
  ALTER TABLE program_workouts ADD COLUMN level TEXT;
  ALTER TABLE workout_logs ADD COLUMN media_id TEXT REFERENCES media(id);
  ALTER TABLE coach_settings ADD COLUMN covers_json TEXT;
  `,
  /* 3: single-use password reset tokens */ `
  CREATE TABLE password_resets (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL);
  CREATE INDEX password_resets_user ON password_resets(user_id);
  `,
];

export function openDb(file: string): DB {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  migrate(db);
  return db;
}

export function migrate(db: DB) {
  const current = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  for (let v = current; v < MIGRATIONS.length; v++) {
    tx(db, () => {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

export function tx<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

type Params = SQLInputValue[];
const clean = (p: unknown[]): Params => p.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v)) as Params;

export function all<T = Row>(db: DB, sql: string, ...p: unknown[]): T[] {
  return db.prepare(sql).all(...clean(p)) as T[];
}
export function get<T = Row>(db: DB, sql: string, ...p: unknown[]): T | undefined {
  return db.prepare(sql).get(...clean(p)) as T | undefined;
}
export function run(db: DB, sql: string, ...p: unknown[]) {
  return db.prepare(sql).run(...clean(p));
}

/** Insert a row from an object. Keys are trusted column names from server code only. */
export function insert(db: DB, table: string, row: Record<string, unknown>) {
  const keys = Object.keys(row);
  run(db, `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...keys.map((k) => row[k]));
}

export function update(db: DB, table: string, id: string, patch: Record<string, unknown>, idCol = 'id') {
  const keys = Object.keys(patch);
  if (!keys.length) return;
  run(db, `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE ${idCol} = ?`, ...keys.map((k) => patch[k]), id);
}

export const now = () => new Date().toISOString();
export const newId = () => crypto.randomUUID();
export const json = (v: unknown) => (v == null ? null : JSON.stringify(v));
export function parse<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

/** Keeps only keys present in the raw request body. zod applies `.default()` even on
 *  `.partial()` schemas, which would otherwise silently reset fields on update. */
export function onlySent<T extends object>(parsed: T, raw: unknown): Partial<T> {
  const keys = raw && typeof raw === 'object' ? Object.keys(raw) : [];
  return Object.fromEntries(Object.entries(parsed).filter(([k]) => keys.includes(k))) as Partial<T>;
}
