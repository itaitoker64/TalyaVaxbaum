// End-to-end check of the core coaching loop in a real browser (mobile viewport, Hebrew RTL).
// Requires a running production server seeded with demo data:
//   npm run build && DATA_DIR=/tmp/mbt npm run seed:demo && DATA_DIR=/tmp/mbt npm start
//   BASE_URL=http://localhost:8787 npm run test:e2e
import { createRequire } from 'node:module';
// Playwright is pre-installed globally in the dev/CI image; resolve it via require so NODE_PATH applies.
const { chromium } = createRequire(import.meta.url)('playwright');
type Page = any;
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:8787';
const SHOTS = process.env.SHOTS_DIR ?? 'docs/screenshots';
mkdirSync(SHOTS, { recursive: true });
const errors: string[] = [];

async function newPage(browser: any, w = 390, h = 844) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'he-IL' });
  const page = await ctx.newPage();
  page.on('pageerror', (e: Error) => errors.push('pageerror: ' + e.message));
  page.on('console', (m: any) => m.type() === 'error' && !m.text().includes('404') && errors.push('console: ' + m.text()));
  return page;
}
const api = (page: Page, method: string, path: string, data?: unknown) =>
  page.request.fetch(BASE + '/api' + path, { method, headers: { 'x-csrf': '1', 'content-type': 'application/json' }, data: data === undefined ? undefined : JSON.stringify(data) }).then(async (r: any) => ({ status: r.status(), body: await r.json().catch(() => null) }));
async function login(page: Page, email: string, password: string) {
  await page.goto(BASE + '/login');
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', password);
  await page.click('button.btn.primary');
  await page.waitForURL((u: URL) => !u.pathname.startsWith('/login'));
}
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

const browser = await chromium.launch();
try {
  // 1. Coach logs in and sees the attention queue (RTL, Hebrew)
  const coach = await newPage(browser, 1280, 860);
  await login(coach, 'coach@demo.local', 'demo-password');
  assert.equal(await coach.getAttribute('html', 'dir'), 'rtl');
  await coach.getByRole('heading', { name: 'לטיפול' }).waitFor();
  await shot(coach, 'coach-attention');

  // 2. Coach creates an invite in the UI
  await coach.goto(BASE + '/coach/clients');
  await coach.getByRole('button', { name: 'הזמנת מתאמן/ת' }).first().click();
  await coach.locator('.card.stack input').first().fill('Maya E2E');
  await coach.locator('.card.stack button.btn.primary').click();
  const link = (await coach.locator('code').first().textContent())!.trim();
  assert.match(link, /\/join\//);

  // 3. New client joins and completes onboarding
  const client = await newPage(browser);
  await client.goto(link);
  await client.fill('input[autocomplete=email]', `maya-${Date.now()}@example.com`);
  await client.fill('input[type=password]', 'maya-password-1');
  await client.click('button.btn.primary');
  await client.waitForURL('**/onboarding');
  await client.locator('textarea').first().fill('להתחזק ולשפר גמישות');
  await client.locator('input[type=checkbox]').check();
  await client.click('button.btn.primary.big');
  await client.waitForURL(BASE + '/');
  await client.getByText('עוד אין תוכנית פעילה').waitFor();
  await shot(client, 'client-today-empty');
  const me = (await api(client, 'GET', '/auth/me')).body;
  const clientId = me.user.id;

  // 4. Coach builds a template with a workout on today's weekday (API) and assigns it in the UI
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const exercises = (await api(coach, 'GET', '/exercises')).body;
  const byName = (n: string) => exercises.find((e: any) => e.name === n).id;
  const tpl = await api(coach, 'POST', '/programs', { name: 'E2E block', length_weeks: 2, content: { workouts: [{ week_index: 1, day_of_week: today.getDay(), title: 'אימון כוח E2E', category: 'strength', est_minutes: 40, items: [
    { exercise_id: byName('סקוואט גביע'), prescription: { sets: 2, reps: 8, load: 10, loadUnit: 'kg', restSec: 5 } },
    { exercise_id: byName('זרימת מוביליטי לירכיים'), prescription: { durationMin: 10 } },
    { exercise_id: byName('ריצה קלה'), prescription: { distanceKm: 2 } },
  ] }] } });
  assert.equal(tpl.status, 200);
  await coach.goto(`${BASE}/coach/clients/${clientId}/program`);
  await coach.locator('select').first().selectOption(tpl.body.id);
  await coach.locator('input[type=date]').first().fill(iso);
  await coach.getByRole('button', { name: 'הקצאה למתאמן/ת' }).click();
  await coach.waitForURL('**/coach/programs/**');
  await coach.getByText('גרסה').first().waitFor();

  // 5. Client trains: Today → Start → log sets (tap ✓ copies prescription) → swap → run → finish partial
  await client.goto(BASE + '/');
  await client.getByText('אימון כוח E2E').waitFor();
  await shot(client, 'client-today-session');
  await client.getByRole('button', { name: /להתחיל/ }).click();
  await client.waitForURL('**/training/session/**');
  // Approved swap first, then tap ✓ (fills from the prescription) — the next exercise opens automatically.
  await client.locator('select[aria-label="חלופה מאושרת"]').selectOption({ label: 'חלופה מאושרת: סקוואט לקופסה' });
  await client.locator('.setcheck').first().click();
  await client.locator('.timer').waitFor(); // rest timer started from prescription
  await client.locator('.setcheck').nth(1).click();
  await client.getByText('השלמתי את התרגול').click();
  await client.locator('button.ex-head', { hasText: 'ריצה קלה' }).click();
  await client.getByLabel('מרחק (ק״מ)').fill('2.1');
  await client.locator('input[placeholder="25:00"]').fill('13:30');
  await client.getByText('6:26/km').waitFor(); // pace calculated from distance & time
  await client.getByText(/טיוטה נשמרה/).waitFor({ timeout: 5000 }); // autosaved draft
  await shot(client, 'client-logger');
  await client.getByRole('button', { name: 'סיום אימון' }).click();
  await client.getByRole('button', { name: 'השלמתי חלק' }).click();
  await client.waitForURL('**/training/log/**');
  await client.getByText('בוצע במקום: סקוואט גביע').waitFor();
  await shot(client, 'client-log-view');

  // 6. Coach sees the workout in the queue, reviews prescribed vs actual, sends feedback
  await coach.goto(BASE + '/coach');
  await coach.getByText('אימון לסקירה').first().waitFor();
  const logLink = coach.locator('a', { hasText: 'Maya E2E' }).filter({ hasText: 'אימון לסקירה' });
  await logLink.first().click();
  await coach.waitForURL('**/coach/logs/**');
  await coach.locator('textarea').fill('בחירה מצוינת בסקוואט לקופסה!');
  await coach.getByRole('button', { name: 'שליחת משוב וסימון כנסקר' }).click();
  await coach.getByText('נסקר').waitFor();
  await shot(coach, 'coach-log-review');

  // 7. Client sees the feedback on Today
  await client.goto(BASE + '/');
  await client.getByText('משוב חדש מהמאמנת').waitFor();
  await client.getByText('בחירה מצוינת בסקוואט לקופסה!').waitFor();

  // 8. Coach creates a goal with baseline; client records a measurement; chart renders
  const goal = await api(coach, 'POST', `/clients/${clientId}/goals`, { title: 'Hamstring reach', kind: 'mobility', unit: 'cm', direction: 'increase', baseline_value: -6, baseline_date: iso, target_value: 0, procedure: 'Seated, legs straight, reach 3×, record best', show_on_today: true });
  await client.goto(`${BASE}/progress/goal/${goal.body.id}`);
  await client.getByRole('button', { name: 'הוספת מדידה' }).click();
  await client.locator('.modal input[type=number]').fill('-4');
  await client.locator('.modal textarea').fill('Better today');
  await client.locator('.modal button.btn.primary.big').click();
  await client.locator('svg.chart circle').nth(1).waitFor();
  await shot(client, 'client-goal-chart');

  // 9. Other screens render without errors (demo client with history)
  const noa = await newPage(browser);
  await login(noa, 'noa@demo.local', 'demo-password');
  for (const [path, name] of [['/', 'demo-today'], ['/training', 'demo-training'], ['/nutrition', 'demo-nutrition'], ['/progress', 'demo-progress'], ['/messages', 'demo-messages']] as const) {
    await noa.goto(BASE + path);
    await noa.waitForLoadState('networkidle');
    await noa.locator('.loading').waitFor({ state: 'detached' }).catch(() => undefined);
    await shot(noa, name);
  }
  await noa.goto(BASE + '/nutrition');
  await noa.getByText('דייסת לילה (דמו)').waitFor();

  // 10. Permission check through the browser session: Noa cannot read Maya's data
  for (const p of [`/clients/${clientId}/today`, `/clients/${clientId}/goals`, `/goals/${goal.body.id}`, `/clients/${clientId}/logs`]) {
    assert.equal((await api(noa, 'GET', p)).status, 404, p);
  }
  for (const [path, name] of [['/coach/clients', 'coach-clients'], ['/coach/programs/' + tpl.body.id, 'coach-program-editor'], ['/coach/library', 'coach-library']] as const) {
    await coach.goto(BASE + path);
    await coach.waitForLoadState('networkidle');
    await shot(coach, name);
  }

  // Design review: the five screens, phone viewport, demo data
  const DR = SHOTS + '/design';
  mkdirSync(DR, { recursive: true });
  const phone = await newPage(browser);
  await login(phone, 'noa@demo.local', 'demo-password');
  await phone.goto(BASE + '/');
  await phone.locator('.hero').first().waitFor();
  await phone.waitForTimeout(500);
  await phone.screenshot({ path: `${DR}/1-today.png`, fullPage: true });
  await phone.goto(BASE + '/training?tab=library');
  await phone.locator('.wcard').first().waitFor();
  await phone.waitForTimeout(300);
  await phone.screenshot({ path: `${DR}/2-library.png`, fullPage: true });
  await phone.locator('.wcard').first().click();
  await phone.locator('.preview').waitFor();
  await phone.screenshot({ path: `${DR}/2b-practice-detail.png`, fullPage: true });
  await phone.goto(BASE + '/');
  await phone.getByRole('button', { name: /להתחיל/ }).first().click();
  await phone.waitForURL('**/training/session/**');
  await phone.locator('.setcheck').first().click();
  await phone.locator('.timer').waitFor();
  await phone.waitForTimeout(300);
  await phone.screenshot({ path: `${DR}/3-active-workout.png` });
  const goals = (await api(phone, 'GET', `/clients/${(await api(phone, 'GET', '/auth/me')).body.user.id}/goals`)).body;
  await phone.goto(`${BASE}/progress/goal/${goals.find((g: any) => g.kind === 'performance').id}`);
  await phone.locator('svg.chart').waitFor();
  await phone.waitForTimeout(300);
  await phone.screenshot({ path: `${DR}/4-goal-progress.png`, fullPage: true });
  // Share card from Maya's completed E2E workout
  const logs = (await api(client, 'GET', `/clients/${clientId}/logs`)).body;
  await client.goto(`${BASE}/training/log/${logs[0].id}/share`);
  await client.locator('canvas.share-preview').waitFor();
  await client.waitForTimeout(1200);
  await client.screenshot({ path: `${DR}/5-share-editor.png`, fullPage: true });
  const dataUrl = await client.evaluate(() => (document.querySelector('canvas.share-preview') as HTMLCanvasElement).toDataURL('image/png'));
  (await import('node:fs')).writeFileSync(`${DR}/5-share-card.png`, Buffer.from(dataUrl.split(',')[1], 'base64'));

  assert.deepEqual(errors, [], 'browser errors');
  console.log('E2E journey passed. Screenshots in', SHOTS);
} finally {
  await browser.close();
}
