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
insert(db, 'users', { id: coachId, email: 'coach@demo.local', name: 'טליה (דמו)', password_hash: await hashPassword(PW), role: 'coach', locale: 'he', is_demo: 1, created_at: now() });
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
const noa = await client('noa@demo.local', 'נועה (דמו)');
const dan = await client('dan@demo.local', 'דן (דמו)');
await noa.c.r('PUT', `/clients/${noa.id}/onboarding`, { goals: 'להתחזק ולהרגיש יציבה יותר בגב התחתון (דמו)', experience: 'פילאטיס פעם בשבוע, שנה', availability: 'א׳, ג׳, ה׳ בבוקר', daysPerWeek: 3, equipment: 'משקולות 4–12 ק״ג, גומיות, מזרן', considerations: 'רגישות בברך ימין (דמו)', nutritionInterest: 'יומן בסיסי', consent: true });

const ex = async (body: any) => (await coach.r('POST', '/exercises', body)).id as string;
const goblet = await ex({ name: 'סקוואט גביע', category: 'strength', log_type: 'strength', purpose: 'כוח רגליים ודפוס סקוואט נקי', prerequisites: 'סקוואט לקופסה ללא כאב', starting_prescription: '3 × 8–10 ב־RPE 7', cues: 'משקל באמצע כף הרגל\nצלעות למטה\nברכיים בכיוון האצבעות', progression_criteria: 'כל הסטים בראש הטווח ב־RPE ≤ 7 → להוסיף 2 ק״ג', equipment: 'קטלבל', level: 'beginner' });
const boxSquat = await ex({ name: 'סקוואט לקופסה', category: 'strength', log_type: 'strength', purpose: 'סקוואט עם שליטה בעומק', cues: 'לגעת בקופסה בלי לשבת', equipment: 'קופסה', level: 'beginner' });
const rdl = await ex({ name: 'דדליפט רומני', category: 'strength', log_type: 'strength', purpose: 'כוח בדפוס ציר ירך', cues: 'ברכיים רכות\nאגן אחורה\nגב ניטרלי', progression_criteria: '3 × 10 חלקים → להוסיף 2 ק״ג', equipment: 'משקולות' });
const row = await ex({ name: 'חתירה במשקולת ביד אחת', category: 'strength', log_type: 'strength', purpose: 'כוח בגב העליון', cues: 'למשוך מרפק לכיוון הירך', equipment: 'משקולת' });
const pushup = await ex({ name: 'שכיבות סמיכה בשיפוע', category: 'functional', log_type: 'strength', purpose: 'כוח דחיקה', cues: 'הגוף בקו אחד' });
const hipFlow = await ex({ name: 'זרימת מוביליטי לירכיים', category: 'mobility', log_type: 'practice', purpose: 'טווח סיבוב וכפיפה בירכיים', cues: 'נשימה איטית, בטווח נוח' });
const core = await ex({ name: 'רצף ליבה בפילאטיס', category: 'pilates', log_type: 'practice', purpose: 'שליטה בשרירי הליבה העמוקים' });
const easyRun = await ex({ name: 'ריצה קלה', category: 'running', log_type: 'running', purpose: 'בסיס אירובי', cues: 'קצב שמאפשר לדבר' });
const circuit = await ex({ name: 'מעגל כושר', category: 'functional', log_type: 'circuit', purpose: 'סבולת וכושר עבודה' });
await coach.r('PUT', `/exercises/${goblet}`, { alternatives: [{ id: boxSquat, note: 'אם הברך רגישה' }] });
run(db, 'UPDATE exercises SET is_demo = 1 WHERE coach_id = ?', coachId);

const S = (sets: number, reps: number, load?: number, rest = 90, rpe = 7) => ({ sets, reps, ...(load != null ? { load, loadUnit: 'kg' } : {}), restSec: rest, rpe });
const dow = new Date().getDay();
const D = [dow, (dow + 2) % 7, (dow + 4) % 7];
const week = (w: number) => [
  { week_index: w, day_of_week: D[0], title: 'כוח A — רגליים וגב', category: 'strength', level: 'beginner', est_minutes: 45, items: [
    { exercise_id: goblet, prescription: { ...S(3, 8, 10 + (w - 1)), repsMax: 10 } },
    { exercise_id: rdl, prescription: S(3, 10, 12 + (w - 1) * 2) },
    { exercise_id: row, prescription: S(3, 10, 8) },
    { exercise_id: core, prescription: { durationMin: 10 } },
  ] },
  { week_index: w, day_of_week: D[1], title: 'מוביליטי וגמישות', category: 'mobility', level: 'beginner', est_minutes: 30, items: [
    { exercise_id: hipFlow, prescription: { durationMin: 20 } },
    { exercise_id: easyRun, prescription: { distanceKm: 3 + (w - 1) * 0.5 } },
  ] },
  { week_index: w, day_of_week: D[2], title: 'כוח B — פלג גוף עליון', category: 'functional', level: 'intermediate', est_minutes: 40, items: [
    { exercise_id: pushup, prescription: S(3, 8, undefined, 60) },
    { exercise_id: row, prescription: S(3, 12, 8) },
    { exercise_id: circuit, prescription: { rounds: 3, reps: 10, workSec: 40, restSec: 20 } },
  ] },
];
const tpl = await coach.r('POST', '/programs', { name: 'יסודות — 4 שבועות (דמו)', description: 'בלוק פתיחה: שני ימי כוח ויום מוביליטי.', length_weeks: 4, content: { workouts: [1, 2, 3, 4].flatMap(week) } });
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
  await noa.c.r('POST', `/logs/${logId}/finish`, { status: i === 1 ? 'partial' : 'completed', entries: i === 1 ? entries.slice(0, 1) : entries, session_rpe: 6, notes: i === 1 ? 'היו לי רק 20 דקות (דמו)' : null });
}

const g1 = await coach.r('POST', `/clients/${noa.id}/goals`, { title: 'חזרות בסקוואט גביע עם 12 ק״ג', kind: 'performance', metric: 'חזרות בסט אחד', unit: 'חזרות', direction: 'increase', baseline_value: 6, baseline_date: addDays(todayISO(), -42), target_value: 12, review_date: addDays(todayISO(), 28), procedure: 'אחרי חימום: סט אחד עד RPE 9, עומק מלא, עצירה של 2 שניות למטה', conditions: { exerciseId: goblet, exerciseName: 'סקוואט גביע', load: 12, loadUnit: 'kg' }, show_on_today: true });
for (const [days, v, note] of [[-35, 7, null], [-28, 7, 'עייפות אחרי שבוע עמוס'], [-21, 8, null], [-14, 9, 'הרגיש יציב'], [-4, 10, null]] as const)
  await noa.c.r('POST', `/goals/${g1.id}/measurements`, { value: v, measured_on: addDays(todayISO(), days), notes: note });
const g2 = await coach.r('POST', `/clients/${noa.id}/goals`, { title: 'מבחן ברך לקיר — קרסול ימין', kind: 'mobility', metric: 'מרחק בהונות מהקיר', unit: 'ס״מ', direction: 'increase', baseline_value: 7, baseline_date: addDays(todayISO(), -42), target_value: 11, procedure: 'יחפים, עקב על הרצפה, מודדים את המרחק המרבי שבו הברך נוגעת בקיר', conditions: { side: 'ימין' }, show_on_today: true });
for (const [days, v] of [[-30, 7.5], [-24, 8], [-3, 9]] as const)
  await noa.c.r('POST', `/goals/${g2.id}/measurements`, { value: v, measured_on: addDays(todayISO(), days) });
await coach.r('POST', `/clients/${noa.id}/goals`, { title: 'אימונים מתוכננים בשבוע', kind: 'adherence', unit: 'אימונים', direction: 'increase', target_value: 3, baseline_date: start });
await coach.r('POST', `/clients/${noa.id}/goals`, { title: 'שליטה ברול־אפ בפילאטיס', kind: 'quality', criteria: ['גלגול חוליה אחר חוליה', 'בלי תנופה מהידיים', 'נשימה רציפה'] });
await noa.c.r('PUT', `/clients/${noa.id}/checkins/${start}`, { energy: 4, sleep: 3, stress: 3, soreness: 2, enjoyment: 5, wins: 'עשיתי שני אימונים (דמו)', struggles: 'יום חמישי היה עמוס' });
await coach.r('POST', `/clients/${noa.id}/tasks`, { title: 'לצלם סקוואט גביע מהצד למשוב', due_date: todayISO() });
await coach.r('PUT', `/clients/${noa.id}/settings`, { nutrition: { mode: 'targets', kcal: 1900, protein: 100, guidance: 'חלבון בכל ארוחה, ירקות בצהריים ובערב. (דמו)' } });

// Guided follow-along practices (no video files yet: the app shows "video coming soon", never a broken player)
const practices: [string, string, number, string, string | null, string][] = [
  ['יוגה זורמת לבוקר', 'yoga', 20, 'beginner', null, 'רצף עדין להעיר את הגוף: חתול־פרה, כלב מביט מטה ולוחם 2.'],
  ['פילאטיס — ליבה עמוקה', 'pilates', 15, 'beginner', 'מזרן', 'עבודה על שרירי הבטן העמוקים והנשימה.'],
  ['פתיחת ירכיים', 'mobility', 12, 'beginner', null, 'שחרור הירכיים אחרי ישיבה ממושכת.'],
  ['מתיחות ונשימה לפני שינה', 'flexibility', 10, 'beginner', null, 'מתיחות שקטות ונשימה איטית לסיום היום.'],
  ['מוביליטי לכתפיים ולגב עליון', 'mobility', 18, 'intermediate', 'גומייה', 'פתיחת החזה ושיפור תנועת השכמות.'],
  ['פילאטיס עם גומייה', 'pilates', 28, 'intermediate', 'גומייה, מזרן', 'חיזוק כללי עם התנגדות קלה.'],
  ['יוגה לכוח ויציבות', 'yoga', 35, 'advanced', 'מזרן', 'עמידות שיווי משקל ומעברים איטיים.'],
];
for (const [title, category, min, level, equipment, purpose] of practices)
  insert(db, 'media', { id: newId(), uploader_id: coachId, scope: 'library', coach_id: coachId, kind: 'follow_along', title, category, duration_sec: min * 60, level, equipment, purpose, instructions: 'הנחיות מפורטות יופיעו עם הסרטון. (תוכן הדגמה)', status: 'ready', is_demo: 1, created_at: now() });

// Demo foods: approximate values, flagged source=demo so the UI says "verify".
const food = async (name: string, kcal: number, protein: number, carbs: number, fat: number, serving_g?: number) => {
  const r = await coach.r('POST', '/foods', { name, kcal, protein, carbs, fat, serving_g: serving_g ?? null, source: 'custom' });
  run(db, "UPDATE foods SET source = 'demo', is_demo = 1 WHERE id = ?", r.id);
  return r.id as string;
};
const oats = await food('שיבולת שועל (דמו)', 380, 13, 66, 7, 40);
const yogurt = await food('יוגורט יווני 2% (דמו)', 75, 10, 4, 2, 150);
const soy = await food('יוגורט סויה (דמו)', 60, 4, 5, 2.5, 150);
const banana = await food('בננה (דמו)', 90, 1, 22, 0.3, 120);
await food('טחינה גולמית (דמו)', 640, 20, 12, 55, 15);
const rec = await coach.r('POST', '/recipes', { title: 'דייסת לילה (דמו)', description: 'ארוחת בוקר שמכינים מהערב.', servings: 2, prep_minutes: 5, visibility: 'clients', instructions: '1. לערבב שיבולת שועל ויוגורט.\n2. לקרר במשך הלילה.\n3. להוסיף בננה מעל.', ingredients: [
  { food_id: oats, name: 'שיבולת שועל', grams: 80, display_qty: 'כוס' },
  { food_id: yogurt, name: 'יוגורט יווני', grams: 300, substitutions: [{ food_id: soy, name: 'יוגורט סויה', grams: 300 }] },
  { food_id: banana, name: 'בננה', grams: 120, display_qty: 'בינונית' },
  { name: 'קינמון', grams: 2, display_qty: 'קורט' },
] });
run(db, 'UPDATE recipes SET is_demo = 1 WHERE id = ?', rec.id);
await noa.c.r('POST', `/clients/${noa.id}/food-entries`, { date: todayISO(), meal: 'breakfast', kind: 'recipe', recipe_id: rec.id, servings: 1 });
await noa.c.r('POST', `/clients/${noa.id}/messages`, { body: 'היי טליה, אפשר להחליף את הריצה בהליכה מהירה? (דמו)' });

console.log(`Demo data created (all flagged as demo). Password for all demo users: ${PW}
  coach@demo.local  — coach
  noa@demo.local    — client with program, logs, goals
  dan@demo.local    — client without a program (shows empty states)
  program: ${prog.id}`);
void dan;
