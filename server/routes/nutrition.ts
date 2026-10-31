import { Hono } from 'hono';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { all, get, insert, run, update, now, newId, json, parse, tx, onlySent, type DB } from '../db.ts';
import type { Env, AuthUser } from '../auth.ts';
import { requireCoach, requireUser, requireClientAccess, notFound, badRequest, forbidden, libraryCoachId, canSeeCoachLibrary } from '../access.ts';
import { isISODate } from '../../shared/dates.ts';
import { macrosForGrams, recipeNutrition, scaleMacros, type RecipeIngredientInput } from '../../shared/nutrition.ts';

export const nutritionRoutes = new Hono<Env>();

const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
const Macro = z.number().finite().min(0).max(5000).nullable().optional();

// ---------- Foods ----------
function canSeeFood(db: DB, u: AuthUser, f: any) {
  if (f.client_id) return u.role === 'client' ? f.client_id === u.id : false;
  return canSeeCoachLibrary(db, u, f.coach_id);
}

const FoodBody = z.object({
  name: z.string().min(1).max(160),
  brand: z.string().max(120).nullable().optional(),
  kcal: Macro, protein: Macro, carbs: Macro, fat: Macro,
  serving_g: z.number().positive().max(5000).nullable().optional(),
  serving_label: z.string().max(80).nullable().optional(),
  source: z.enum(['label', 'database', 'custom']).default('label'),
  source_ref: z.string().max(300).nullable().optional(),
});

nutritionRoutes.get('/foods', (c) => {
  const u = requireUser(c);
  const db = c.get('db');
  const q = `%${(c.req.query('q') ?? '').trim()}%`;
  const coachId = libraryCoachId(db, u);
  const rows = all(
    db,
    `SELECT f.*, (SELECT 1 FROM favorites fv WHERE fv.user_id = ? AND fv.kind = 'food' AND fv.ref_id = f.id) AS favorite
     FROM foods f WHERE (f.coach_id = ? OR (f.client_id = ? AND ? = 'client')) AND (f.name LIKE ? OR IFNULL(f.brand,'') LIKE ?)
     ORDER BY favorite DESC, f.name LIMIT 100`,
    u.id, coachId, u.id, u.role, q, q,
  );
  return c.json(rows.map((f) => ({ ...f, favorite: !!f.favorite, is_demo: !!f.is_demo })));
});

nutritionRoutes.post('/foods', async (c) => {
  const u = requireUser(c);
  const b = FoodBody.parse(await c.req.json());
  const id = newId();
  insert(c.get('db'), 'foods', { ...b, id, created_by: u.id, coach_id: u.role === 'coach' ? u.id : null, client_id: u.role === 'client' ? u.id : null, created_at: now() });
  return c.json({ id });
});

nutritionRoutes.put('/foods/:id', async (c) => {
  const u = requireUser(c);
  const db = c.get('db');
  const f = get(db, 'SELECT * FROM foods WHERE id = ?', c.req.param('id'));
  if (!f || !canSeeFood(db, u, f)) throw notFound();
  if (f.created_by !== u.id) throw forbidden();
  const raw = await c.req.json();
  update(db, 'foods', f.id, onlySent(FoodBody.partial().parse(raw), raw));
  return c.json({ ok: true });
});

nutritionRoutes.post('/favorites', async (c) => {
  const u = requireUser(c);
  const b = z.object({ kind: z.enum(['food', 'recipe', 'saved_meal']), ref_id: z.string(), on: z.boolean() }).parse(await c.req.json());
  const db = c.get('db');
  if (b.on) run(db, 'INSERT OR IGNORE INTO favorites (user_id, kind, ref_id, created_at) VALUES (?,?,?,?)', u.id, b.kind, b.ref_id, now());
  else run(db, 'DELETE FROM favorites WHERE user_id = ? AND kind = ? AND ref_id = ?', u.id, b.kind, b.ref_id);
  return c.json({ ok: true });
});

// ---------- Recipes (content management, separate from diary entries) ----------
function loadRecipeIngredients(db: DB, recipeId: string) {
  return all(db, 'SELECT ri.*, f.kcal, f.protein, f.carbs, f.fat FROM recipe_ingredients ri LEFT JOIN foods f ON f.id = ri.food_id WHERE ri.recipe_id = ? ORDER BY ri.sort', recipeId).map((r) => {
    const subs = parse<{ food_id?: string | null; name: string; grams: number }[]>(r.substitutions_json, []);
    return {
      id: r.id, name: r.name, grams: r.grams, display_qty: r.display_qty, food_id: r.food_id,
      food: r.food_id ? { kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat } : null,
      substitutions: subs.map((s) => {
        const f = s.food_id ? get(db, 'SELECT kcal, protein, carbs, fat FROM foods WHERE id = ?', s.food_id) : null;
        return { ...s, food: f ?? null };
      }),
    };
  });
}

function recipeOut(db: DB, r: any, u: AuthUser | null, full = true) {
  const ingredients = loadRecipeIngredients(db, r.id);
  const nutrition = recipeNutrition(ingredients as RecipeIngredientInput[], r.servings);
  const fav = u ? !!get(db, "SELECT 1 FROM favorites WHERE user_id = ? AND kind = 'recipe' AND ref_id = ?", u.id, r.id) : false;
  const isOwner = u?.role === 'coach' && u.id === r.coach_id;
  return {
    ...r, is_demo: !!r.is_demo, share_token: isOwner ? r.share_token : undefined, favorite: fav,
    nutrition, ...(full ? { ingredients } : {}),
  };
}

function recipeVisible(db: DB, u: AuthUser, r: any) {
  if (u.role === 'coach') return r.coach_id === u.id;
  return r.visibility !== 'draft' && canSeeCoachLibrary(db, u, r.coach_id);
}

nutritionRoutes.get('/recipes', (c) => {
  const u = requireUser(c);
  const db = c.get('db');
  const coachId = libraryCoachId(db, u);
  const rows = all(db, `SELECT * FROM recipes WHERE coach_id = ? ${u.role === 'client' ? "AND visibility != 'draft'" : ''} ORDER BY title`, coachId);
  return c.json(rows.map((r) => recipeOut(db, r, u, false)));
});

nutritionRoutes.get('/recipes/:id', (c) => {
  const u = requireUser(c);
  const db = c.get('db');
  const r = get(db, 'SELECT * FROM recipes WHERE id = ?', c.req.param('id'));
  if (!r || !recipeVisible(db, u, r)) throw notFound();
  return c.json(recipeOut(db, r, u));
});

/** Public read-only recipe page for shared links (only when the coach chose link sharing). */
nutritionRoutes.get('/public/recipes/:token', (c) => {
  const db = c.get('db');
  const r = get(db, "SELECT * FROM recipes WHERE share_token = ? AND visibility = 'link'", c.req.param('token'));
  if (!r) throw notFound();
  const out = recipeOut(db, r, null);
  return c.json({ title: out.title, description: out.description, prep_minutes: out.prep_minutes, servings: out.servings, instructions: out.instructions, ingredients: out.ingredients.map((i: any) => ({ name: i.name, display_qty: i.display_qty, grams: i.grams })), nutrition: out.nutrition, is_demo: out.is_demo });
});

const RecipeBody = z.object({
  title: z.string().min(1).max(160),
  description: z.string().max(4000).nullable().optional(),
  photo_media_id: z.string().nullable().optional(),
  video_url: z.string().url().startsWith('https://').nullable().optional(),
  prep_minutes: z.number().int().min(0).max(1440).nullable().optional(),
  servings: z.number().positive().max(100),
  instructions: z.string().max(20000).nullable().optional(),
  tags: z.string().max(500).nullable().optional(),
  visibility: z.enum(['draft', 'clients', 'link']).default('draft'),
  ingredients: z.array(
    z.object({
      food_id: z.string().nullable().optional(),
      name: z.string().min(1).max(160),
      grams: z.number().positive().max(10000),
      display_qty: z.string().max(80).nullable().optional(),
      substitutions: z.array(z.object({ food_id: z.string().nullable().optional(), name: z.string().min(1).max(160), grams: z.number().positive().max(10000) })).max(5).optional(),
    }),
  ).max(60),
});

function saveRecipe(db: DB, coachId: string, id: string, b: z.infer<typeof RecipeBody>, existing?: any) {
  const foodOk = (fid?: string | null) => !fid || !!get(db, 'SELECT 1 FROM foods WHERE id = ? AND coach_id = ?', fid, coachId);
  for (const i of b.ingredients) if (!foodOk(i.food_id) || (i.substitutions ?? []).some((s) => !foodOk(s.food_id))) throw badRequest('invalid_food');
  if (b.photo_media_id && !get(db, "SELECT 1 FROM media WHERE id = ? AND scope = 'library' AND coach_id = ?", b.photo_media_id, coachId)) throw badRequest('invalid_media');
  const { ingredients, ...meta } = b;
  const share_token = b.visibility === 'link' ? existing?.share_token ?? randomBytes(12).toString('base64url') : existing?.share_token ?? null;
  if (existing) update(db, 'recipes', id, { ...meta, share_token, updated_at: now() });
  else insert(db, 'recipes', { ...meta, id, coach_id: coachId, share_token, created_at: now(), updated_at: now() });
  run(db, 'DELETE FROM recipe_ingredients WHERE recipe_id = ?', id);
  ingredients.forEach((i, idx) =>
    insert(db, 'recipe_ingredients', { id: newId(), recipe_id: id, sort: idx, food_id: i.food_id ?? null, name: i.name, grams: i.grams, display_qty: i.display_qty ?? null, substitutions_json: json(i.substitutions ?? []) }),
  );
}

nutritionRoutes.post('/recipes', async (c) => {
  const coach = requireCoach(c);
  const db = c.get('db');
  const b = RecipeBody.parse(await c.req.json());
  const id = newId();
  tx(db, () => saveRecipe(db, coach.id, id, b));
  return c.json({ id });
});

nutritionRoutes.put('/recipes/:id', async (c) => {
  const coach = requireCoach(c);
  const db = c.get('db');
  const r = get(db, 'SELECT * FROM recipes WHERE id = ? AND coach_id = ?', c.req.param('id'), coach.id);
  if (!r) throw notFound();
  const b = RecipeBody.parse(await c.req.json());
  tx(db, () => saveRecipe(db, coach.id, r.id, b, r));
  return c.json({ ok: true });
});

// ---------- Food diary ----------
const EntryBody = z.union([
  z.object({ kind: z.literal('food'), food_id: z.string(), amount: z.number().positive().max(10000), unit: z.enum(['g', 'serving']) }),
  z.object({ kind: z.literal('recipe'), recipe_id: z.string(), servings: z.number().positive().max(50), swaps: z.record(z.string(), z.number().int().min(0)).optional() }),
  z.object({ kind: z.literal('manual'), name: z.string().min(1).max(160), kcal: Macro, protein: Macro, carbs: Macro, fat: Macro }),
]);
const EntryMeta = z.object({ date: z.string().refine(isISODate), meal: z.enum(MEALS), notes: z.string().max(2000).nullable().optional() });

/** Resolves an entry request to a stored snapshot. Totals are frozen at logging time so later
 *  edits to a food or recipe don't silently rewrite past diary days. */
function resolveEntry(db: DB, u: AuthUser, b: z.infer<typeof EntryBody>) {
  if (b.kind === 'food') {
    const f = get(db, 'SELECT * FROM foods WHERE id = ?', b.food_id);
    if (!f || !canSeeFood(db, u, f)) throw badRequest('invalid_food');
    let grams = b.amount;
    if (b.unit === 'serving') {
      if (!f.serving_g) throw badRequest('no_serving_size');
      grams = b.amount * f.serving_g;
    }
    return { food_id: f.id, recipe_id: null, name: f.name, amount: b.amount, unit: b.unit, grams, basis: 'food', detail_json: json({ per100: { kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat }, source: f.source }), ...macrosForGrams(f, grams) };
  }
  if (b.kind === 'recipe') {
    const r = get(db, 'SELECT * FROM recipes WHERE id = ?', b.recipe_id);
    if (!r || !recipeVisible(db, u, r)) throw badRequest('invalid_recipe');
    const ings = loadRecipeIngredients(db, r.id);
    const n = recipeNutrition(ings as RecipeIngredientInput[], r.servings, b.swaps ?? {});
    const swapsNamed = Object.entries(b.swaps ?? {}).map(([iid, idx]) => {
      const ing = ings.find((i) => i.id === iid);
      return ing?.substitutions[idx] ? { from: ing.name, to: ing.substitutions[idx].name } : null;
    }).filter(Boolean);
    return { food_id: null, recipe_id: r.id, name: r.title, amount: b.servings, unit: 'serving', grams: null, basis: 'recipe', detail_json: json({ swaps: swapsNamed, missing: n.missing }), ...scaleMacros(n.perServing, b.servings) };
  }
  return { food_id: null, recipe_id: null, name: b.name, amount: 1, unit: 'serving', grams: null, basis: 'manual', detail_json: null, kcal: b.kcal ?? null, protein: b.protein ?? null, carbs: b.carbs ?? null, fat: b.fat ?? null };
}

nutritionRoutes.get('/clients/:cid/food-entries', (c) => {
  const cid = c.req.param('cid');
  requireClientAccess(c, cid);
  const from = c.req.query('date') ?? c.req.query('from');
  const to = c.req.query('to') ?? from;
  if (!isISODate(from) || !isISODate(to)) throw badRequest('date');
  return c.json(all(c.get('db'), 'SELECT * FROM food_entries WHERE client_id = ? AND date BETWEEN ? AND ? ORDER BY date, created_at', cid, from, to).map((e) => ({ ...e, detail: parse(e.detail_json, null), detail_json: undefined })));
});

function requireOwnDiary(u: AuthUser, cid: string) {
  if (u.role !== 'client' || u.id !== cid) throw forbidden();
}

nutritionRoutes.post('/clients/:cid/food-entries', async (c) => {
  const cid = c.req.param('cid');
  const u = requireClientAccess(c, cid);
  requireOwnDiary(u, cid);
  const raw = await c.req.json();
  const meta = EntryMeta.parse(raw);
  const db = c.get('db');
  const snap = resolveEntry(db, u, EntryBody.parse(raw));
  const id = newId();
  insert(db, 'food_entries', { ...snap, id, client_id: cid, date: meta.date, meal: meta.meal, notes: meta.notes ?? null, created_at: now(), updated_at: now() });
  return c.json({ id });
});

function loadEntry(c: any) {
  const db: DB = c.get('db');
  const e = get(db, 'SELECT * FROM food_entries WHERE id = ?', c.req.param('id'));
  if (!e) throw notFound();
  const u = requireClientAccess(c, e.client_id);
  requireOwnDiary(u, e.client_id);
  return { u, db, e };
}

nutritionRoutes.put('/food-entries/:id', async (c) => {
  const { u, db, e } = loadEntry(c);
  const raw = await c.req.json();
  const meta = onlySent(EntryMeta.partial().parse(raw), raw);
  const patch: Record<string, unknown> = { ...meta, updated_at: now() };
  if (raw.kind) Object.assign(patch, resolveEntry(db, u, EntryBody.parse(raw)));
  update(db, 'food_entries', e.id, patch);
  return c.json({ ok: true });
});

nutritionRoutes.delete('/food-entries/:id', (c) => {
  const { db, e } = loadEntry(c);
  run(db, 'DELETE FROM food_entries WHERE id = ?', e.id);
  return c.json({ ok: true });
});

// ---------- Saved meals ----------
nutritionRoutes.get('/clients/:cid/saved-meals', (c) => {
  const cid = c.req.param('cid');
  const u = requireClientAccess(c, cid);
  const db = c.get('db');
  return c.json(all(db, 'SELECT * FROM saved_meals WHERE client_id = ? ORDER BY name', cid).map((m) => ({
    ...m, items: parse(m.items_json, []), items_json: undefined,
    favorite: !!get(db, "SELECT 1 FROM favorites WHERE user_id = ? AND kind = 'saved_meal' AND ref_id = ?", u.id, m.id),
  })));
});

nutritionRoutes.post('/clients/:cid/saved-meals', async (c) => {
  const cid = c.req.param('cid');
  const u = requireClientAccess(c, cid);
  requireOwnDiary(u, cid);
  const b = z.object({ name: z.string().min(1).max(120), entryIds: z.array(z.string()).min(1).max(30) }).parse(await c.req.json());
  const db = c.get('db');
  const items = b.entryIds.map((id) => {
    const e = get(db, 'SELECT * FROM food_entries WHERE id = ? AND client_id = ?', id, cid);
    if (!e) throw badRequest('invalid_entry');
    if (e.basis === 'food') return { kind: 'food', food_id: e.food_id, amount: e.amount, unit: e.unit };
    if (e.basis === 'recipe') return { kind: 'recipe', recipe_id: e.recipe_id, servings: e.amount };
    return { kind: 'manual', name: e.name, kcal: e.kcal, protein: e.protein, carbs: e.carbs, fat: e.fat };
  });
  const id = newId();
  insert(db, 'saved_meals', { id, client_id: cid, name: b.name, items_json: json(items), created_at: now() });
  return c.json({ id });
});

nutritionRoutes.post('/saved-meals/:id/log', async (c) => {
  const db: DB = c.get('db');
  const m = get(db, 'SELECT * FROM saved_meals WHERE id = ?', c.req.param('id'));
  if (!m) throw notFound();
  const u = requireClientAccess(c, m.client_id);
  requireOwnDiary(u, m.client_id);
  const meta = EntryMeta.parse(await c.req.json());
  tx(db, () => {
    for (const item of parse<any[]>(m.items_json, [])) {
      const snap = resolveEntry(db, u, EntryBody.parse(item));
      insert(db, 'food_entries', { ...snap, id: newId(), client_id: m.client_id, date: meta.date, meal: meta.meal, notes: null, created_at: now(), updated_at: now() });
    }
  });
  return c.json({ ok: true });
});

nutritionRoutes.delete('/saved-meals/:id', (c) => {
  const db: DB = c.get('db');
  const m = get(db, 'SELECT * FROM saved_meals WHERE id = ?', c.req.param('id'));
  if (!m) throw notFound();
  const u = requireClientAccess(c, m.client_id);
  requireOwnDiary(u, m.client_id);
  run(db, 'DELETE FROM saved_meals WHERE id = ?', m.id);
  return c.json({ ok: true });
});
