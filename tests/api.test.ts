import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { setup, makeCoach, login, registerClient, Client } from './helpers.ts';
import { todayISO, weekStart, addDays, dayOfWeek } from '../shared/dates.ts';

const env = setup();
const today = todayISO();
let coach: Client, coach2: Client, alice: Client, bob: Client;
let aliceId: string, bobId: string;
const ids: Record<string, string> = {};

before(async () => {
  const c = await makeCoach(env.db);
  const c2 = await makeCoach(env.db, 'other@example.com');
  coach = await login(env.app, c.email, c.password);
  coach2 = await login(env.app, c2.email, c2.password);
  ({ client: alice, id: aliceId } = await registerClient(env.app, coach, 'alice@example.com', 'Alice'));
  ({ client: bob, id: bobId } = await registerClient(env.app, coach, 'bob@example.com', 'Bob'));
});

test('auth: login errors, me, csrf header required', async () => {
  const anon = new Client(env.app);
  assert.equal((await anon.post('/auth/login', { email: 'coach@example.com', password: 'wrong' })).status, 401);
  assert.equal((await anon.get('/auth/me')).data.user, null);
  assert.equal((await anon.get('/clients')).status, 401);
  const noCsrf = await coach.req('POST', '/invites', { name: 'x' }, { 'x-csrf': '' });
  assert.equal(noCsrf.status, 403);
  const me = await alice.get('/auth/me');
  assert.equal(me.data.user.role, 'client');
  assert.equal(me.data.onboardingDone, false);
  // Invites are single-use
  const inv = await coach.post('/invites', { name: 'Carol' });
  const c1 = new Client(env.app);
  assert.equal((await c1.post('/auth/register', { code: inv.data.code, name: 'Carol', email: 'carol@example.com', password: 'carol-password' })).status, 200);
  const c2 = new Client(env.app);
  assert.equal((await c2.post('/auth/register', { code: inv.data.code, name: 'Eve', email: 'eve@example.com', password: 'eve-password-1' })).status, 400);
});

test('coaching loop: program → training log → review → feedback → goals', async () => {
  // Onboarding
  assert.equal((await alice.put(`/clients/${aliceId}/onboarding`, { goals: 'Stronger legs', experience: '1 year', availability: 'Sun, Tue, Thu', daysPerWeek: 3, equipment: 'Dumbbells', considerations: 'Old knee injury', consent: true })).status, 200);

  // Library
  const squat = await coach.post('/exercises', { name: 'Goblet squat', category: 'strength', log_type: 'strength', purpose: 'Leg strength', cues: 'Chest up', progression_criteria: '3x10 at RPE 7 → +2kg' });
  const boxSquat = await coach.post('/exercises', { name: 'Box squat', category: 'strength', log_type: 'strength' });
  const lunge = await coach.post('/exercises', { name: 'Reverse lunge', category: 'strength', log_type: 'strength' });
  const flow = await coach.post('/exercises', { name: 'Hip mobility flow', category: 'mobility', log_type: 'practice' });
  const run = await coach.post('/exercises', { name: 'Easy run', category: 'running', log_type: 'running' });
  ids.squat = squat.data.id; ids.box = boxSquat.data.id; ids.lunge = lunge.data.id; ids.flow = flow.data.id; ids.run = run.data.id;
  assert.equal((await coach.put(`/exercises/${ids.squat}`, { alternatives: [{ id: ids.box, note: 'If knee is sensitive' }] })).status, 200);

  // Template with a workout every day of weeks 1–2 so "today" and "tomorrow" always have one.
  const days = [0, 1, 2, 3, 4, 5, 6].flatMap((d) => [{ w: 1, d }, { w: 2, d }]);
  const tpl = await coach.post('/programs', {
    name: 'Foundations', length_weeks: 3,
    content: {
      workouts: days.map(({ w, d }) => ({
        week_index: w, day_of_week: d, title: `Lower body ${d}`, category: 'strength', est_minutes: 40,
        items: [
          { exercise_id: ids.squat, prescription: { sets: 3, reps: 10, load: 12, loadUnit: 'kg', restSec: 90, rpe: 7 } },
          { exercise_id: ids.flow, prescription: { durationMin: 10 } },
          { exercise_id: ids.run, prescription: { distanceKm: 3 } },
        ],
      })).concat([{ week_index: 3, day_of_week: 2, title: 'Week 3', category: 'strength', est_minutes: 30, items: [] }] as any),
    },
  });
  assert.equal(tpl.status, 200, JSON.stringify(tpl.data));
  ids.template = tpl.data.id;
  // Clients can't see templates
  assert.equal((await alice.get(`/programs/${ids.template}`)).status, 404);

  const assigned = await coach.post(`/programs/${ids.template}/assign`, { clientId: aliceId, startDate: today });
  assert.equal(assigned.status, 200, JSON.stringify(assigned.data));
  ids.program = assigned.data.id;

  // Client's Today has a session
  const t = await alice.get(`/clients/${aliceId}/today?date=${today}`);
  assert.equal(t.status, 200);
  assert.equal(t.data.sessions.length, 1);
  const sid = t.data.sessions[0].id;
  ids.session = sid;

  const sess = await alice.get(`/sessions/${sid}`);
  assert.equal(sess.data.items.length, 3);
  assert.equal(sess.data.items[0].prescription.load, 12);
  assert.equal(sess.data.exercises[ids.squat].alternatives[0].id, ids.box);

  // Start + autosave draft
  const start = await alice.post(`/sessions/${sid}/start`);
  ids.log = start.data.logId;
  assert.equal((await alice.post(`/sessions/${sid}/start`)).data.logId, ids.log, 'start is idempotent');
  const items = sess.data.items;
  const entries = [
    { program_item_id: items[0].id, exercise_id: ids.box, data: { sets: [{ reps: 10, weight: 14, unit: 'kg', done: true }, { reps: 9, weight: 14, unit: 'kg', done: true }] }, notes: 'knee felt ok on box' },
    { program_item_id: items[1].id, exercise_id: ids.flow, data: { durationSec: 600, completed: true, difficulty: 'ok' } },
    { program_item_id: items[2].id, exercise_id: ids.run, data: { distanceKm: 3, durationSec: 1080 } },
  ];
  assert.equal((await alice.put(`/logs/${ids.log}`, { entries })).status, 200);
  // Non-approved substitution is rejected
  const bad = await alice.put(`/logs/${ids.log}`, { entries: [{ ...entries[0], exercise_id: ids.lunge }] });
  assert.equal(bad.status, 400);
  assert.equal(bad.data.error, 'alternative_not_approved');

  // Coach can view but not write the client's log
  assert.equal((await coach.get(`/logs/${ids.log}`)).status, 200);
  assert.equal((await coach.put(`/logs/${ids.log}`, { entries })).status, 403);

  const fin = await alice.post(`/logs/${ids.log}/finish`, { status: 'partial', entries, session_rpe: 7, notes: 'Short on time' });
  assert.equal(fin.status, 200);

  // Prescription is untouched by the different weight/exercise
  const after = await alice.get(`/sessions/${sid}`);
  assert.equal(after.data.items[0].prescription.load, 12);
  assert.equal(after.data.items[0].exercise_id, ids.squat);
  assert.equal(after.data.session.status, 'partial');
  const logView = await coach.get(`/logs/${ids.log}`);
  assert.equal(logView.data.entries[0].substituted_for_id, ids.squat);
  assert.equal(logView.data.entries[0].data.sets[0].weight, 14);

  // Coach attention queue → review with feedback → client sees it on Today
  const att = await coach.get('/coach/attention');
  assert.ok(att.data.some((i: any) => i.type === 'workout' && i.id === ids.log));
  assert.ok(att.data.some((i: any) => i.type === 'no_program' && i.clientId === bobId));
  assert.equal((await coach.post(`/logs/${ids.log}/review`, { feedback: 'Great call using the box squat.' })).status, 200);
  const att2 = await coach.get('/coach/attention');
  assert.ok(!att2.data.some((i: any) => i.type === 'workout' && i.id === ids.log));
  const t2 = await alice.get(`/clients/${aliceId}/today?date=${today}`);
  assert.equal(t2.data.feedback[0].body, 'Great call using the box squat.');
  await alice.post(`/clients/${aliceId}/messages/read`);
  assert.equal((await alice.get(`/clients/${aliceId}/today?date=${today}`)).data.feedback.length, 0);

  // Previous performance shows on next session
  const nextSession = (await alice.get(`/clients/${aliceId}/schedule?from=${addDays(today, 1)}&to=${addDays(today, 6)}`)).data.find((s: any) => s.status === 'planned');
  assert.ok(nextSession);
  {
    const ns = await alice.get(`/sessions/${nextSession.id}`);
    assert.equal(ns.data.previous[ids.box].data.sets[0].weight, 14);
    // Reschedule keeps the original record
    const target = addDays(nextSession.date, 1);
    const rs = await alice.post(`/sessions/${nextSession.id}/reschedule`, { date: target });
    assert.equal(rs.status, 200);
    const orig = await alice.get(`/sessions/${nextSession.id}`);
    assert.equal(orig.data.session.status, 'rescheduled');
    assert.equal(orig.data.session.moved_to_date, target);
    // Skip with a supportive reason
    assert.equal((await alice.post(`/sessions/${rs.data.id}/skip`, { reason: 'Travel day' })).status, 200);
  }

  // Exercise history keeps conditions (exercise, weight, unit)
  const hist = await alice.get(`/clients/${aliceId}/exercise-history?exerciseId=${ids.box}`);
  assert.equal(hist.data.length, 1);
  assert.equal(hist.data[0].substituted, true);
  assert.equal(hist.data[0].prescription.load, 12);
});

test('program versions: editing creates a new version; logged sessions keep theirs', async () => {
  const before = await coach.get(`/programs/${ids.program}`);
  const v1 = before.data.version.id;
  const content = {
    note: 'Progress squat load',
    workouts: before.data.workouts.map((w: any) => ({
      week_index: w.week_index, day_of_week: w.day_of_week, title: w.title, category: w.category, est_minutes: w.est_minutes,
      items: w.items.map((i: any) => ({ exercise_id: i.exercise_id, prescription: i.exercise_id === ids.squat ? { ...i.prescription, load: 14 } : i.prescription })),
    })),
  };
  const saved = await coach.post(`/programs/${ids.program}/versions`, content);
  assert.equal(saved.status, 200);
  const afterP = await coach.get(`/programs/${ids.program}`);
  assert.equal(afterP.data.versions.length, 2);
  assert.equal(afterP.data.version.version_no, 2);
  // Old version still readable
  const old = await coach.get(`/programs/${ids.program}?version=${v1}`);
  assert.equal(old.data.workouts[0].items[0].prescription.load, 12);
  // Today's logged session still points to v1 prescription
  const s = await alice.get(`/sessions/${ids.session}`);
  assert.equal(s.data.session.version_id, v1);
  assert.equal(s.data.items[0].prescription.load, 12);
  // Clients can read their own program but not edit it
  assert.equal((await alice.get(`/programs/${ids.program}`)).status, 200);
  assert.equal((await alice.post(`/programs/${ids.program}/versions`, content)).status, 403);
});

test('goals: baseline, measurements, revision with method change, quality without scores, adherence calculated', async () => {
  const g = await coach.post(`/clients/${aliceId}/goals`, {
    title: 'Goblet squat reps at 16 kg', kind: 'performance', metric: 'reps', unit: 'reps', direction: 'increase',
    baseline_value: 6, baseline_date: addDays(today, -14), target_value: 12, review_date: addDays(today, 42),
    procedure: 'After warm-up, one set to RPE 9, full depth', conditions: { exerciseId: ids.squat, load: 16, loadUnit: 'kg' }, show_on_today: true,
  });
  assert.equal(g.status, 200, JSON.stringify(g.data));
  ids.goal = g.data.id;
  assert.equal((await alice.post(`/goals/${ids.goal}/measurements`, { value: 8, measured_on: addDays(today, -7), notes: 'Felt strong' })).status, 200);
  // Clients can't create goals
  assert.equal((await alice.post(`/clients/${aliceId}/goals`, { title: 'x', kind: 'other' })).status, 403);
  // Revision changes procedure → method version bump; history kept
  const rev = await coach.put(`/goals/${ids.goal}`, { procedure: 'Box at parallel, one set to RPE 9', reason: 'Knee comfort' });
  assert.equal(rev.data.methodChanged, true);
  await alice.post(`/goals/${ids.goal}/measurements`, { value: 9, measured_on: today });
  const d = await alice.get(`/goals/${ids.goal}`);
  assert.equal(d.data.measurements.length, 3);
  assert.equal(d.data.measurements[0].is_baseline, true);
  assert.deepEqual(d.data.measurements.map((m: any) => m.method_version), [1, 1, 2]);
  assert.equal(d.data.measurements[1].conditions.load, 16);
  assert.equal(d.data.revisions.length, 1);
  assert.equal(d.data.revisions[0].before.procedure, 'After warm-up, one set to RPE 9, full depth');
  // Void rather than delete
  const mid = d.data.measurements[2].id;
  assert.equal((await alice.post(`/measurements/${mid}/void`, { reason: 'Wrong weight' })).status, 200);
  const d2 = await alice.get(`/goals/${ids.goal}`);
  assert.ok(d2.data.measurements.find((m: any) => m.id === mid).voided_at);
  assert.equal(d2.data.goal.latest.value, 8);
  // Today shows the selected goal
  assert.equal((await alice.get(`/clients/${aliceId}/today?date=${today}`)).data.goals[0].id, ids.goal);

  // Quality goal: no numeric value allowed, criteria-based review
  const q = await coach.post(`/clients/${aliceId}/goals`, { title: 'Roll-up control', kind: 'quality', direction: 'increase', criteria: ['Smooth spinal articulation', 'No momentum'] });
  assert.equal((await alice.post(`/goals/${q.data.id}/measurements`, { value: 7, measured_on: today })).status, 400);
  const m = await alice.post(`/goals/${q.data.id}/measurements`, { measured_on: today, notes: 'Video attached next time' });
  assert.equal(m.status, 200);
  assert.equal((await coach.post(`/goals/${q.data.id}/reviews`, { measurement_id: m.data.id, ratings: [{ criterion: 'Smooth spinal articulation', rating: 'developing' }], summary: 'Nice progress' })).status, 200);
  assert.equal((await coach.post(`/goals/${q.data.id}/reviews`, { ratings: [{ criterion: 'Invented', rating: 'consistent' }] })).status, 400);

  // Adherence goal is calculated, not entered
  const a = await coach.post(`/clients/${aliceId}/goals`, { title: 'Workouts per week', kind: 'adherence', unit: 'sessions', direction: 'increase', target_value: 3, baseline_date: weekStart(today) });
  assert.equal((await alice.post(`/goals/${a.data.id}/measurements`, { value: 3, measured_on: today })).status, 400);
  const ad = await alice.get(`/goals/${a.data.id}?today=${today}`);
  assert.ok(Array.isArray(ad.data.adherence));
  assert.ok(ad.data.adherence[0].partial >= 1);
});

test('check-ins, messages, tasks', async () => {
  const ws = weekStart(today);
  assert.equal((await alice.put(`/clients/${aliceId}/checkins/${ws}`, { energy: 4, sleep: 3, wins: 'Did 3 sessions', struggles: 'Busy week' })).status, 200);
  assert.equal((await coach.put(`/clients/${aliceId}/checkins/${ws}`, { energy: 1 })).status, 403, 'coach cannot answer for client');
  const list = await coach.get(`/clients/${aliceId}/checkins`);
  assert.equal(list.data[0].answers.energy, 4);
  assert.ok((await coach.get('/coach/attention')).data.some((i: any) => i.type === 'checkin'));
  assert.equal((await coach.post(`/checkins/${list.data[0].id}/review`, { feedback: 'Well done this week' })).status, 200);
  assert.equal((await alice.get(`/clients/${aliceId}/checkins`)).data[0].feedback[0].body, 'Well done this week');

  assert.equal((await alice.post(`/clients/${aliceId}/messages`, { body: 'Question about the flow' })).status, 200);
  assert.ok((await coach.get('/coach/attention')).data.some((i: any) => i.type === 'message' && i.clientId === aliceId));

  const task = await coach.post(`/clients/${aliceId}/tasks`, { title: 'Film a side-view squat', due_date: today });
  assert.equal((await alice.get(`/clients/${aliceId}/today?date=${today}`)).data.tasks[0].title, 'Film a side-view squat');
  assert.equal((await alice.put(`/tasks/${task.data.id}`, { done: true })).status, 200);
});

test('nutrition: diary, recipes with substitutions, saved meals, configurable targets', async () => {
  const oats = await coach.post('/foods', { name: 'Oats', kcal: 380, protein: 13, carbs: 67, fat: 7, serving_g: 40, source: 'label' });
  const milk = await coach.post('/foods', { name: 'Milk 3%', kcal: 60, protein: 3.3, carbs: 4.8, fat: 3, source: 'label' });
  const oatDrink = await coach.post('/foods', { name: 'Oat drink', kcal: 45, protein: 1, carbs: 7, fat: 1.5, source: 'label' });
  const priv = await alice.post('/foods', { name: 'Alice granola', kcal: 450, protein: 10, carbs: 60, fat: 18, source: 'label' });
  ids.privateFood = priv.data.id;
  const recipe = await coach.post('/recipes', {
    title: 'Overnight oats', servings: 2, prep_minutes: 5, visibility: 'link', instructions: 'Mix and chill',
    ingredients: [
      { food_id: oats.data.id, name: 'Oats', grams: 100, display_qty: '1 cup' },
      { food_id: milk.data.id, name: 'Milk', grams: 200, substitutions: [{ food_id: oatDrink.data.id, name: 'Oat drink', grams: 200 }] },
      { name: 'Cinnamon', grams: 2 },
    ],
  });
  assert.equal(recipe.status, 200, JSON.stringify(recipe.data));
  const r = await alice.get(`/recipes/${recipe.data.id}`);
  assert.equal(r.data.nutrition.perServing.kcal, 250);
  assert.deepEqual(r.data.nutrition.missing, ['Cinnamon']);
  assert.equal(r.data.share_token, undefined, 'clients do not get share tokens');
  const milkIngredient = r.data.ingredients[1].id;

  const e1 = await alice.post(`/clients/${aliceId}/food-entries`, { date: today, meal: 'breakfast', kind: 'recipe', recipe_id: recipe.data.id, servings: 1, swaps: { [milkIngredient]: 0 } });
  assert.equal(e1.status, 200, JSON.stringify(e1.data));
  const e2 = await alice.post(`/clients/${aliceId}/food-entries`, { date: today, meal: 'snack', kind: 'food', food_id: oats.data.id, amount: 1, unit: 'serving' });
  const e3 = await alice.post(`/clients/${aliceId}/food-entries`, { date: today, meal: 'snack', kind: 'manual', name: 'Coffee', kcal: 5 });
  assert.equal(e3.status, 200);
  const day = await alice.get(`/clients/${aliceId}/food-entries?date=${today}`);
  assert.equal(day.data.length, 3);
  assert.equal(day.data[0].kcal, 235);
  assert.equal(day.data[0].basis, 'recipe');
  assert.deepEqual(day.data[0].detail.swaps, [{ from: 'Milk', to: 'Oat drink' }]);
  assert.equal(day.data[1].grams, 40);
  // Edit amount
  assert.equal((await alice.put(`/food-entries/${e2.data.id}`, { kind: 'food', food_id: oats.data.id, amount: 60, unit: 'g' })).status, 200);
  // Coach can read but not edit the diary
  assert.equal((await coach.get(`/clients/${aliceId}/food-entries?date=${today}`)).status, 200);
  assert.equal((await coach.del(`/food-entries/${e2.data.id}`)).status, 403);
  // Saved meal
  const sm = await alice.post(`/clients/${aliceId}/saved-meals`, { name: 'Usual breakfast', entryIds: [e1.data.id] });
  assert.equal((await alice.post(`/saved-meals/${sm.data.id}/log`, { date: addDays(today, 1), meal: 'breakfast' })).status, 200);
  assert.equal((await alice.get(`/clients/${aliceId}/food-entries?date=${addDays(today, 1)}`)).data.length, 1);
  // Public link
  const owner = await coach.get(`/recipes/${recipe.data.id}`);
  const pub = await new Client(env.app).get(`/public/recipes/${owner.data.share_token}`);
  assert.equal(pub.status, 200);
  assert.equal(pub.data.title, 'Overnight oats');
  // Targets configurable per client
  assert.equal((await coach.put(`/clients/${aliceId}/settings`, { nutrition: { mode: 'targets', kcal: 2000, protein: 110 } })).status, 200);
  assert.equal((await alice.get(`/clients/${aliceId}/today?date=${today}`)).data.nutrition.config.kcal, 2000);
  await coach.put(`/clients/${bobId}/settings`, { nutrition: { mode: 'off' } });
  assert.equal((await bob.get(`/clients/${bobId}/today?date=${today}`)).data.nutrition, null);
  ids.entry = e2.data.id;
  ids.savedMeal = sm.data.id;
});

test('media: upload, range read, interrupted/invalid uploads, review', async () => {
  const lib = await coach.post('/media', { kind: 'demo', title: 'Goblet squat demo', duration_sec: 30, level: 'beginner' });
  const bytes = new Uint8Array(1000).map((_, i) => i % 256);
  assert.equal((await coach.req('PUT', `/media/${lib.data.id}/file`, bytes, { 'content-type': 'video/mp4' })).status, 200);
  const ranged = await alice.req('GET', `/media/${lib.data.id}/file`, undefined, { range: 'bytes=100-199' });
  assert.equal(ranged.status, 206);
  assert.equal(ranged.headers.get('content-range'), 'bytes 100-199/1000');
  // Wrong type rejected
  const sub = await alice.post(`/clients/${aliceId}/media`, { kind: 'submission', title: 'My squat', context: { logId: ids.log, exerciseId: ids.box } });
  assert.equal((await alice.req('PUT', `/media/${sub.data.id}/file`, bytes, { 'content-type': 'text/html' })).status, 400);
  assert.equal((await alice.req('PUT', `/media/${sub.data.id}/file`, bytes, { 'content-type': 'video/mp4' })).status, 200);
  assert.ok((await coach.get('/coach/attention')).data.some((i: any) => i.type === 'video' && i.id === sub.data.id));
  assert.equal((await coach.post(`/media/${sub.data.id}/review`, { feedback: 'Depth looks good' })).status, 200);
  // Clients can't create library media
  assert.equal((await alice.post('/media', { kind: 'demo', title: 'x' })).status, 403);
  ids.privateMedia = sub.data.id;
  ids.libMedia = lib.data.id;
});

test('permissions: a client cannot access another client’s private data', async () => {
  const A = aliceId;
  const paths = [
    `/clients/${A}`, `/clients/${A}/today`, `/clients/${A}/schedule?from=${today}&to=${today}`, `/clients/${A}/program`,
    `/sessions/${ids.session}`, `/logs/${ids.log}`, `/clients/${A}/logs`, `/clients/${A}/exercise-history?exerciseId=${ids.box}`,
    `/clients/${A}/goals`, `/goals/${ids.goal}`, `/clients/${A}/checkins`, `/clients/${A}/messages`, `/clients/${A}/tasks`,
    `/clients/${A}/food-entries?date=${today}`, `/clients/${A}/saved-meals`, `/clients/${A}/media`,
    `/media/${ids.privateMedia}`, `/media/${ids.privateMedia}/file`, `/programs/${ids.program}`,
  ];
  for (const p of paths) {
    const r = await bob.get(p);
    assert.equal(r.status, 404, `bob GET ${p} → ${r.status}`);
    const r2 = await coach2.get(p);
    assert.equal(r2.status, 404, `unassigned coach GET ${p} → ${r2.status}`);
  }
  const writes: [string, string, unknown][] = [
    ['POST', `/sessions/${ids.session}/start`, {}],
    ['PUT', `/logs/${ids.log}`, { entries: [] }],
    ['POST', `/logs/${ids.log}/finish`, { status: 'completed', entries: [] }],
    ['POST', `/sessions/${ids.session}/skip`, {}],
    ['POST', `/goals/${ids.goal}/measurements`, { value: 1, measured_on: today }],
    ['PUT', `/clients/${A}/checkins/${weekStart(today)}`, { energy: 1 }],
    ['POST', `/clients/${A}/messages`, { body: 'hi' }],
    ['POST', `/clients/${A}/food-entries`, { date: today, meal: 'snack', kind: 'manual', name: 'x', kcal: 1 }],
    ['PUT', `/food-entries/${ids.entry}`, { meal: 'lunch' }],
    ['DELETE', `/food-entries/${ids.entry}`, undefined],
    ['POST', `/saved-meals/${ids.savedMeal}/log`, { date: today, meal: 'lunch' }],
    ['POST', `/clients/${A}/media`, { kind: 'submission', title: 'x' }],
    ['PUT', `/clients/${A}/onboarding`, { consent: true }],
  ];
  for (const [m, p, b] of writes) {
    const r = await bob.req(m, p, b);
    assert.equal(r.status, 404, `bob ${m} ${p} → ${r.status}`);
  }
  // Bob can't use Alice's private food in his diary
  const r = await bob.post(`/clients/${bobId}/food-entries`, { date: today, meal: 'snack', kind: 'food', food_id: ids.privateFood, amount: 10, unit: 'g' });
  assert.equal(r.status, 400);
  // Unassigned coach can't see library of another coach or assign to their clients
  assert.equal((await coach2.get(`/media/${ids.libMedia}`)).status, 404);
  assert.equal((await coach2.get(`/exercises/${ids.squat}`)).status, 404);
  assert.equal((await coach2.post(`/clients/${A}/goals`, { title: 'x', kind: 'other' })).status, 404);
  assert.equal((await coach2.get(`/clients`)).data.length, 0);
  // Clients can't reach coach-only endpoints
  for (const [m, p, b] of [
    ['GET', '/clients', undefined], ['GET', '/coach/attention', undefined], ['POST', '/programs', { name: 'x' }],
    ['POST', '/exercises', { name: 'x', category: 'yoga', log_type: 'practice' }], ['POST', '/invites', {}],
    ['PUT', `/clients/${A}/settings`, { track: 'B' }], ['POST', `/logs/${ids.log}/review`, {}],
  ] as const) {
    const res = await alice.req(m, p, b);
    assert.equal(res.status, 403, `alice ${m} ${p} → ${res.status}`);
  }
  // Coach-private notes are never sent to the client
  await coach.put(`/clients/${A}/settings`, { coachNotes: 'Private note' });
  assert.equal((await alice.get(`/clients/${A}`)).data.coachNotes, undefined);
  assert.equal((await coach.get(`/clients/${A}`)).data.coachNotes, 'Private note');
});

test('reschedule date validity and dayOfWeek sanity', () => {
  assert.ok(dayOfWeek(today) >= 0);
});
