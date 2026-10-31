// Nutrition arithmetic. Values come from foods the coach/client entered (labels, a database,
// or clearly marked demo data). This module never invents values: missing inputs stay missing.

export interface Per100 {
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
}

export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export const ZERO: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

const round1 = (n: number) => Math.round(n * 10) / 10;

export function macrosForGrams(food: Per100, grams: number): Macros {
  const f = grams / 100;
  return {
    kcal: Math.round((food.kcal ?? 0) * f),
    protein: round1((food.protein ?? 0) * f),
    carbs: round1((food.carbs ?? 0) * f),
    fat: round1((food.fat ?? 0) * f),
  };
}

export function sumMacros(items: Partial<Macros>[]): Macros {
  const t = items.reduce<Macros>(
    (acc, m) => ({
      kcal: acc.kcal + (m.kcal ?? 0),
      protein: acc.protein + (m.protein ?? 0),
      carbs: acc.carbs + (m.carbs ?? 0),
      fat: acc.fat + (m.fat ?? 0),
    }),
    { ...ZERO },
  );
  return { kcal: Math.round(t.kcal), protein: round1(t.protein), carbs: round1(t.carbs), fat: round1(t.fat) };
}

export function scaleMacros(m: Macros, factor: number): Macros {
  return {
    kcal: Math.round(m.kcal * factor),
    protein: round1(m.protein * factor),
    carbs: round1(m.carbs * factor),
    fat: round1(m.fat * factor),
  };
}

export interface RecipeIngredientInput {
  id: string;
  name: string;
  grams: number;
  food: Per100 | null; // null = no nutrition data linked
  substitutions?: { name: string; grams: number; food: Per100 | null }[];
}

export interface RecipeNutrition {
  total: Macros;
  perServing: Macros;
  /** Ingredients that have no nutrition data; totals exclude them and the UI must say so. */
  missing: string[];
}

/**
 * Calculates recipe nutrition. `swaps` maps ingredient id → index into its substitutions list,
 * so a client can see updated numbers when choosing a coach-approved substitute.
 */
export function recipeNutrition(
  ingredients: RecipeIngredientInput[],
  servings: number,
  swaps: Record<string, number> = {},
): RecipeNutrition {
  const missing: string[] = [];
  const parts: Macros[] = [];
  for (const ing of ingredients) {
    const swapIdx = swaps[ing.id];
    const chosen = swapIdx != null && ing.substitutions?.[swapIdx] ? ing.substitutions[swapIdx] : ing;
    if (!chosen.food) {
      missing.push(chosen.name);
      continue;
    }
    parts.push(macrosForGrams(chosen.food, chosen.grams));
  }
  const total = sumMacros(parts);
  const s = servings > 0 ? servings : 1;
  return { total, perServing: scaleMacros(total, 1 / s), missing };
}
