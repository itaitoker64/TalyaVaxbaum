import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, weekStart, dayOfWeek, daysBetween } from '../shared/dates.ts';
import { scheduleDates, weeklyAdherence } from '../shared/schedule.ts';
import { targetStatus, changeFromBaseline, segmentsByMethod, latestMeasurement } from '../shared/goals.ts';
import { macrosForGrams, recipeNutrition, sumMacros } from '../shared/nutrition.ts';
import { paceSecPerKm, formatPace, parseDuration, formatDuration } from '../shared/pace.ts';

test('dates: week start (Sunday) and arithmetic across month ends', () => {
  assert.equal(dayOfWeek('2026-11-01'), 0); // Sunday
  assert.equal(weekStart('2026-11-04'), '2026-11-01');
  assert.equal(weekStart('2026-11-04', 1), '2026-11-02');
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(daysBetween('2026-03-25', '2026-04-01'), 7);
});

test('schedule: never back-fills before the start date and respects block length', () => {
  const slots = [
    { id: 'a', weekIndex: 1, dayOfWeek: 0 },
    { id: 'b', weekIndex: 1, dayOfWeek: 3 },
    { id: 'c', weekIndex: 2, dayOfWeek: 1 },
    { id: 'd', weekIndex: 3, dayOfWeek: 1 },
  ];
  const out = scheduleDates(slots, '2026-11-03', 2); // Tuesday
  assert.deepEqual(out, [
    { workoutId: 'b', date: '2026-11-04' },
    { workoutId: 'c', date: '2026-11-09' },
  ]);
});

test('adherence: plain counts, rescheduled originals excluded, missed vs upcoming', () => {
  const w = weeklyAdherence(
    [
      { date: '2026-11-01', status: 'completed' },
      { date: '2026-11-02', status: 'rescheduled' },
      { date: '2026-11-03', status: 'partial' },
      { date: '2026-11-04', status: 'planned' },
      { date: '2026-11-06', status: 'planned' },
      { date: '2026-11-05', status: 'skipped' },
    ],
    '2026-11-05',
  );
  assert.equal(w.length, 1);
  assert.deepEqual(w[0], { weekStart: '2026-11-01', planned: 5, completed: 1, partial: 1, skipped: 1, missed: 1, upcoming: 1 });
});

test('goals: target status per direction, no extrapolation', () => {
  const inc = { direction: 'increase' as const, baselineValue: 5, targetValue: 10, targetMin: null, targetMax: null };
  assert.equal(targetStatus(inc, null), 'no_data');
  assert.equal(targetStatus(inc, 9), 'not_reached');
  assert.equal(targetStatus(inc, 10), 'reached');
  assert.equal(changeFromBaseline(inc, 8), 3);
  const dec = { ...inc, direction: 'decrease' as const, baselineValue: 20, targetValue: 15 };
  assert.equal(targetStatus(dec, 14), 'reached');
  assert.equal(changeFromBaseline(dec, 18), 2);
  const range = { direction: 'range' as const, baselineValue: 3, targetValue: null, targetMin: 5, targetMax: 8 };
  assert.equal(targetStatus(range, 6), 'reached');
  assert.equal(targetStatus(range, 9), 'not_reached');
  assert.equal(changeFromBaseline(range, 6), null);
});

test('goals: segments split on measurement method change; latest by date', () => {
  const pts = [
    { id: '1', date: '2026-01-01', value: 1, methodVersion: 1 },
    { id: '3', date: '2026-03-01', value: 3, methodVersion: 2 },
    { id: '2', date: '2026-02-01', value: 2, methodVersion: 1 },
    { id: 'x', date: '2026-04-01', value: null, methodVersion: 2 },
  ];
  const seg = segmentsByMethod(pts);
  assert.equal(seg.length, 2);
  assert.deepEqual(seg[0].map((p) => p.id), ['1', '2']);
  assert.equal(latestMeasurement(pts)?.id, '3');
});

test('nutrition: grams scaling, recipe per serving, substitutions, missing data reported', () => {
  const oats = { kcal: 380, protein: 13, carbs: 67, fat: 7 };
  assert.deepEqual(macrosForGrams(oats, 50), { kcal: 190, protein: 6.5, carbs: 33.5, fat: 3.5 });
  const ingredients = [
    { id: 'i1', name: 'oats', grams: 100, food: oats },
    { id: 'i2', name: 'milk', grams: 200, food: { kcal: 60, protein: 3.3, carbs: 4.8, fat: 3 }, substitutions: [{ name: 'oat drink', grams: 200, food: { kcal: 45, protein: 1, carbs: 7, fat: 1.5 } }] },
    { id: 'i3', name: 'cinnamon', grams: 2, food: null },
  ];
  const base = recipeNutrition(ingredients, 2);
  assert.equal(base.total.kcal, 500);
  assert.equal(base.perServing.kcal, 250);
  assert.deepEqual(base.missing, ['cinnamon']);
  const swapped = recipeNutrition(ingredients, 2, { i2: 0 });
  assert.equal(swapped.total.kcal, 470);
  assert.deepEqual(sumMacros([{ kcal: 1.4 }, { kcal: 1.4 }]).kcal, 3);
});

test('pace: calculated only from real inputs', () => {
  assert.equal(paceSecPerKm(5, 1500), 300);
  assert.equal(formatPace(300), '5:00/km');
  assert.equal(paceSecPerKm(0, 1500), null);
  assert.equal(formatPace(null), '–');
  assert.equal(parseDuration('25:30'), 1530);
  assert.equal(parseDuration('1:02:03'), 3723);
  assert.equal(parseDuration('30'), 1800);
  assert.equal(formatDuration(3723), '1:02:03');
});
