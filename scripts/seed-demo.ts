// Seeds clearly labeled DEMO content (users, library, program, logs) through the real API so it
// passes the same validation as real data. All demo rows are flagged is_demo and the UI shows a
// "Demo" banner/badge. Nutrition values for demo foods are approximate and marked "verify".
//   npm run seed:demo           (uses DATA_DIR/DB_FILE like the server)
import { openDb, run, get, insert, now, newId } from '../server/db.ts';
import { createApp } from '../server/app.ts';
import { LocalStorage } from '../server/storage.ts';
import { hashPassword } from '../server/auth.ts';
import { todayISO, addDays, weekStart } from '../shared/dates.ts';

const DATA_DIR = process.env.DATA_DIR ?? './data';
const db = openDb(process.env.DB_FILE ?? `${DATA_DIR}/movement.db`);
const app = createApp(db, new LocalStorage(process.env.UPLOAD_DIR ?? `${DATA_DIR}/uploads`));
const PW = process.env.DEMO_PASSWORD ?? 'demo-password';

if (get(db, "SELECT 1 FROM users WHERE email = 'coach@demo.local'")) {
  console.log('Demo data already present.');
  process.exit(0);
}

class C {
  cookie = '';
  async r(method: string, path: string, body?: unknown) {
    const res = await app.request('/api' + path, { method, headers: { 'x-csrf': '1', 'content-type': 'application/json', cookie: this.cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = res.headers.get('set-cookie');
    if (sc) this.cookie = sc.split(';')[0];
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(data)}`);
    return data;
  }
}

const coachId = newId();
insert(db, 'users', { id: coachId, email: 'coach@demo.local', name: 'Talya (Demo)', password_hash: await hashPassword(PW), role: 'coach', locale: 'he', is_demo: 1, created_at: now() });
insert(db, 'coach_settings', { coach_id: coachId, response_expectation: 'א׳–ה׳, עד 48 שעות (דמו)', whatsapp_url: null, week_start_day: 0, updated_at: now() });
const coach = new C();
await coach.r('POST', '/auth/login', { email: 'coach@demo.local', password: PW });

async function client(email: string, name: string) {
  const inv = await coach.r('POST', '/invites', { name });
  const c = new C();
  await c.r('POST', '/auth/register', { code: inv.code, name, email, password: PW });
  const me = await c.r('GET', '/auth/me');
  run(db, 'UPDATE users SET is_demo = 1 WHERE id = ?', me.user.id);
  return { c, id: me.user.id as string };
}
const noa = await client('noa@demo.local', 'Noa (Demo)');
const dan = await client('dan@demo.local', 'Dan (Demo)');
await noa.c.r('PUT', `/clients/${noa.id}/onboarding`, { goals: 'להתחזק ולהרגיש יציבה יותר בגב התחתון (דמו)', experience: 'פילאטיס פעם בשבוע, שנה', availability: 'א׳, ג׳, ה׳ בבוקר', daysPerWeek: 3, equipment: 'משקולות 4–12 ק״ג, גומיות, מזרן', considerations: 'רגישות בברך ימין (דמו)', nutritionInterest: 'יומן בסיסי', consent: true });

const ex = async (body: any) => (await coach.r('POST', '/exercises', body)).id as string;
const goblet = await ex({ name: 'Goblet squat', category: 'strength', log_type: 'strength', purpose: 'Leg strength and squat pattern', prerequisites: 'Pain-free squat to a box', starting_prescription: '3 × 8–10 @ RPE 7', cues: 'Weight in mid-foot\nRibs down\nKnees track over toes', progression_criteria: 'All sets at top of range with RPE ≤ 7 → +2 kg', equipment: 'Dumbbell / kettlebell', level: 'Beginner' });
const boxSquat = await ex({ name: 'Box squat', category: 'strength', log_type: 'strength', purpose: 'Squat with depth control', cues: 'Touch the box, don’t sit', level: 'Beginner' });
const rdl = await ex({ name: 'Romanian deadlift', category: 'strength', log_type: 'strength', purpose: 'Hip hinge strength', cues: 'Soft knees\nPush hips back\nNeutral spine', progression_criteria: '3 × 10 smooth → +2 kg' });
const row = await ex({ name: 'One-arm dumbbell row', category: 'strength', log_type: 'strength', purpose: 'Upper-back strength', cues: 'Pull elbow to hip' });
const pushup = await ex({ name: 'Incline push-up', category: 'functional', log_type: 'strength', purpose: 'Pressing strength', cues: 'Body in one line' });
const hipFlow = await ex({ name: 'Hip mobility flow', category: 'mobility', log_type: 'practice', purpose: 'Hip rotation and flexion range', cues: 'Breathe slowly; stay in a comfortable range' });
const core = await ex({ name: 'Pilates core sequence', category: 'pilates', log_type: 'practice', purpose: 'Deep core control' });
const easyRun = await ex({ name: 'Easy run', category: 'running', log_type: 'running', purpose: 'Aerobic base', cues: 'Conversational pace' });
const circuit = await ex({ name: 'Conditioning circuit', category: 'functional', log_type: 'circuit', purpose: 'Work capacity' });
await coach.r('PUT', `/exercises/${goblet}`, { alternatives: [{ id: boxSquat, note: 'If the knee is sensitive' }] });
run(db, 'UPDATE exercises SET is_demo = 1 WHERE coach_id = ?', coachId);

const S = (sets: number, reps: number, load?: number, rest = 90, rpe = 7) => ({ sets, reps, ...(load != null ? { load, loadUnit: 'kg' } : {}), restSec: rest, rpe });
const week = (w: number) => [
  { week_index: w, day_of_week: 0, title: 'Strength A', category: 'strength', est_minutes: 45, items: [
    { exercise_id: goblet, prescription: { ...S(3, 8, 10 + (w - 1)), repsMax: 10 } },
    { exercise_id: row, prescription: S(3, 10, 8) },
    { exercise_id: core, prescription: { durationMin: 10 } },
  ] },
  { week_index: w, day_of_week: 2, title: 'Mobility & flexibility', category: 'mobility', est_minutes: 30, items: [
    { exercise_id: hipFlow, prescription: { durationMin: 20 } },
    { exercise_id: easyRun, prescription: { distanceKm: 3 + (w - 1) * 0.5 } },
  ] },
  { week_index: w, day_of_week: 4, title: 'Strength B', category: 'strength', est_minutes: 45, items: [
    { exercise_id: rdl, prescription: S(3, 10, 12 + (w - 1) * 2) },
    { exercise_id: pushup, prescription: S(3, 8, undefined, 60) },
    { exercise_id: circuit, prescription: { rounds: 3, reps: 10, workSec: 40, restSec: 20 } },
  ] },
];
const tpl = await coach.r('POST', '/programs', { name: 'Foundations (Demo)', description: '4-week introductory block: two strength days and one mobility day.', length_weeks: 4, content: { workouts: [1, 2, 3, 4].flatMap(week) } });
const start = weekStart(addDays(todayISO(), -7));
const prog = await coach.r('POST', `/programs/${tpl.id}/assign`, { clientId: noa.id, startDate: start });
run(db, 'UPDATE programs SET is_demo = 1 WHERE coach_id = ?', coachId);

// Log last week's sessions for Noa (one completed, one partial, one skipped)
const sched = await noa.c.r('GET', `/clients/${noa.id}/schedule?from=${start}&to=${addDays(start, 6)}`);
for (const [i, s] of sched.entries()) {
  if (s.date >= todayISO()) continue;
  if (i === 2) { await noa.c.r('POST', `/sessions/${s.id}/skip`, { reason: 'עומס בעבודה (דמו)' }); continue; }
  const { logId } = await noa.c.r('POST', `/sessions/${s.id}/start`);
  const detail = await noa.c.r('GET', `/sessions/${s.id}`);
  const entries = detail.items.map((it: any) => {
    const p = it.prescription;
    const data = it.log_type === 'strength' ? { sets: Array.from({ length: p.sets ?? 3 }, () => ({ reps: p.reps, weight: p.load ?? null, unit: 'kg', done: true })) }
      : it.log_type === 'running' ? { distanceKm: p.distanceKm, durationSec: Math.round((p.distanceKm ?? 3) * 390) }
      : it.log_type === 'circuit' ? { rounds: p.rounds, reps: p.reps, workSec: p.workSec, restSec: p.restSec }
      : { durationSec: (p.durationMin ?? 10) * 60, completed: true, difficulty: 'ok' };
    return { program_item_id: it.id, exercise_id: it.exercise_id, data };
  });
  await noa.c.r('POST', `/logs/${logId}/finish`, { status: i === 1 ? 'partial' : 'completed', entries: i === 1 ? entries.slice(0, 1) : entries, session_rpe: 6, notes: i === 1 ? 'Only had 20 minutes (demo)' : null });
}

const g1 = await coach.r('POST', `/clients/${noa.id}/goals`, { title: 'Goblet squat reps @ 12 kg', kind: 'performance', metric: 'reps', unit: 'reps', direction: 'increase', baseline_value: 6, baseline_date: addDays(todayISO(), -21), target_value: 12, review_date: addDays(todayISO(), 35), procedure: 'After warm-up: one set to RPE 9, full depth, 2-second pause at bottom', conditions: { exerciseId: goblet, exerciseName: 'Goblet squat', load: 12, loadUnit: 'kg' }, show_on_today: true });
await noa.c.r('POST', `/goals/${g1.id}/measurements`, { value: 8, measured_on: addDays(todayISO(), -10), notes: 'Felt solid (demo)' });
await coach.r('POST', `/clients/${noa.id}/goals`, { title: 'Knee-to-wall ankle test (right)', kind: 'mobility', metric: 'distance', unit: 'cm', direction: 'increase', baseline_value: 7, baseline_date: addDays(todayISO(), -21), target_value: 11, procedure: 'Barefoot, heel down, measure toe-to-wall distance at max knee touch', conditions: { side: 'right' }, show_on_today: true });
await coach.r('POST', `/clients/${noa.id}/goals`, { title: 'Planned sessions per week', kind: 'adherence', unit: 'sessions', direction: 'increase', target_value: 3, baseline_date: start });
await coach.r('POST', `/clients/${noa.id}/goals`, { title: 'Pilates roll-up control', kind: 'quality', criteria: ['Smooth spinal articulation', 'No momentum from arms', 'Even breathing'] });
await noa.c.r('PUT', `/clients/${noa.id}/checkins/${start}`, { energy: 4, sleep: 3, stress: 3, soreness: 2, enjoyment: 5, wins: 'Did two sessions (demo)', struggles: 'Busy Thursday' });
await coach.r('POST', `/clients/${noa.id}/tasks`, { title: 'Film a side-view goblet squat for feedback', due_date: todayISO() });
await coach.r('PUT', `/clients/${noa.id}/settings`, { nutrition: { mode: 'targets', kcal: 1900, protein: 100, guidance: 'Protein at every meal; vegetables at lunch and dinner. (demo)' } });

// Demo foods: approximate values, flagged source=demo so the UI says "verify".
const food = async (name: string, kcal: number, protein: number, carbs: number, fat: number, serving_g?: number) => {
  const r = await coach.r('POST', '/foods', { name, kcal, protein, carbs, fat, serving_g: serving_g ?? null, source: 'custom' });
  run(db, "UPDATE foods SET source = 'demo', is_demo = 1 WHERE id = ?", r.id);
  return r.id as string;
};
const oats = await food('Rolled oats (demo)', 380, 13, 66, 7, 40);
const yogurt = await food('Greek yogurt 2% (demo)', 75, 10, 4, 2, 150);
const soy = await food('Soy yogurt (demo)', 60, 4, 5, 2.5, 150);
const banana = await food('Banana (demo)', 90, 1, 22, 0.3, 120);
await food('Tahini (demo)', 640, 20, 12, 55, 15);
const rec = await coach.r('POST', '/recipes', { title: 'Overnight oats (Demo)', description: 'Breakfast you can prepare the night before.', servings: 2, prep_minutes: 5, visibility: 'clients', instructions: '1. Mix oats and yogurt.\n2. Refrigerate overnight.\n3. Top with banana.', ingredients: [
  { food_id: oats, name: 'Rolled oats', grams: 80, display_qty: '1 cup' },
  { food_id: yogurt, name: 'Greek yogurt', grams: 300, substitutions: [{ food_id: soy, name: 'Soy yogurt', grams: 300 }] },
  { food_id: banana, name: 'Banana', grams: 120, display_qty: '1 medium' },
  { name: 'Cinnamon', grams: 2, display_qty: 'pinch' },
] });
run(db, 'UPDATE recipes SET is_demo = 1 WHERE id = ?', rec.id);
await noa.c.r('POST', `/clients/${noa.id}/food-entries`, { date: todayISO(), meal: 'breakfast', kind: 'recipe', recipe_id: rec.id, servings: 1 });
await noa.c.r('POST', `/clients/${noa.id}/messages`, { body: 'היי טליה, האם אפשר להחליף את הריצה בהליכה מהירה? (דמו)' });

console.log(`Demo data created (all flagged as demo). Password for all demo users: ${PW}
  coach@demo.local  — coach
  noa@demo.local    — client with program, logs, goals
  dan@demo.local    — client without a program (shows empty states)
  program: ${prog.id}`);
void dan;
