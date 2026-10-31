import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useI18n } from '../i18n/index.tsx';
import { useApi, POST, PUT, mediaUrl } from '../api.ts';
import { Async, Field, Input, TextArea, Select, NumInput, Seg, ErrorBox, Empty, DemoBadge, N } from '../components/ui.tsx';
import { Uploader } from '../components/media.tsx';
import { recipeNutrition } from '../../../shared/nutrition.ts';
import type { StringKey } from '../i18n/strings.ts';

export function Recipes() {
  const { t, fmtNum } = useI18n();
  const q = useApi<any[]>('/recipes');
  return (
    <div>
      <div className="row between"><h1>{t('coach.recipes')}</h1><Link className="btn primary" to="/coach/recipes/new">{t('recipe.new')}</Link></div>
      <Async q={q}>
        {(list) => list.length === 0 ? <Empty>{t('common.none')}</Empty> : (
          <div className="grid2">
            {list.map((r) => (
              <Link key={r.id} to={`/coach/recipes/${r.id}`} className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="row between"><strong>{r.title}</strong><span className="row"><DemoBadge show={r.is_demo} /><span className="badge">{t(('vis.' + r.visibility) as StringKey)}</span></span></div>
                <div className="small muted num">{fmtNum(r.nutrition.perServing.kcal, 0)} kcal / {t('nutrition.serving')}</div>
              </Link>
            ))}
          </div>
        )}
      </Async>
    </div>
  );
}

export function RecipeEditor() {
  const { id } = useParams();
  const q = useApi<any>(id && id !== 'new' ? `/recipes/${id}` : null);
  const foods = useApi<any[]>('/foods');
  if (id !== 'new' && !q.data) return <Async q={q}>{() => null}</Async>;
  return <Async q={foods}>{(f) => <Form r={id === 'new' ? null : q.data} foods={f} />}</Async>;
}

function Form({ r, foods }: { r: any; foods: any[] }) {
  const { t, fmtNum } = useI18n();
  const nav = useNavigate();
  const [f, setF] = useState<any>(() => r ? {
    ...r, ingredients: r.ingredients.map((i: any) => ({ food_id: i.food_id, name: i.name, grams: i.grams, display_qty: i.display_qty, substitutions: i.substitutions.map((s: any) => ({ food_id: s.food_id ?? null, name: s.name, grams: s.grams })) })),
  } : { title: '', description: '', servings: 2, prep_minutes: null, instructions: '', tags: '', visibility: 'draft', video_url: '', photo_media_id: null, ingredients: [] });
  const [err, setErr] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const foodById = new Map(foods.map((x) => [x.id, x]));
  const per = (fid: string | null) => (fid && foodById.get(fid)) || null;
  const n = useMemo(() => recipeNutrition(f.ingredients.map((i: any, idx: number) => ({ id: String(idx), name: i.name, grams: i.grams || 0, food: per(i.food_id) })), f.servings || 1), [f]);
  const setIng = (i: number, patch: any) => setF({ ...f, ingredients: f.ingredients.map((x: any, j: number) => (j === i ? { ...x, ...patch } : x)) });

  const save = async () => {
    setErr(null);
    const body = {
      title: f.title, description: f.description || null, servings: f.servings, prep_minutes: f.prep_minutes, instructions: f.instructions || null, tags: f.tags || null,
      visibility: f.visibility, video_url: f.video_url || null, photo_media_id: f.photo_media_id || null,
      ingredients: f.ingredients.filter((i: any) => i.name && i.grams > 0).map((i: any) => ({ ...i, food_id: i.food_id || null, display_qty: i.display_qty || null, substitutions: (i.substitutions ?? []).filter((s: any) => s.name && s.grams > 0).map((s: any) => ({ ...s, food_id: s.food_id || null })) })),
    };
    try {
      if (r) { await PUT(`/recipes/${r.id}`, body); setSaved(true); }
      else { const res = await POST('/recipes', body); nav(`/coach/recipes/${res.id}`, { replace: true }); }
    } catch (e) { setErr(e); }
  };

  return (
    <div className="grid2">
      <div className="card stack">
        <Field label={t('goal.title')}><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label={t('common.description')}><TextArea value={f.description ?? ''} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="grid3">
          <Field label={t('nutrition.servings')}><NumInput value={f.servings} onChange={(v) => setF({ ...f, servings: v })} /></Field>
          <Field label={t('recipe.prepMinutes')}><NumInput value={f.prep_minutes} onChange={(v) => setF({ ...f, prep_minutes: v })} /></Field>
        </div>
        <Field label={t('recipe.photo')}>
          {f.photo_media_id ? <img src={mediaUrl(f.photo_media_id)} className="recipe-photo" alt="" style={{ maxHeight: 180 }} /> : null}
          <Uploader createPath="/media" meta={{ kind: 'recipe', title: f.title || 'recipe' }} accept="image/*" label={t('recipe.photo')} onDone={(mid) => setF({ ...f, photo_media_id: mid })} />
        </Field>
        <Field label={t('recipe.videoUrl')}><Input type="url" value={f.video_url ?? ''} onChange={(e) => setF({ ...f, video_url: e.target.value })} /></Field>
        <Field label={t('nutrition.instructions')}><TextArea value={f.instructions ?? ''} onChange={(e) => setF({ ...f, instructions: e.target.value })} style={{ minHeight: 140 }} /></Field>
        <Field label={t('recipe.tags')}><Input value={f.tags ?? ''} onChange={(e) => setF({ ...f, tags: e.target.value })} /></Field>
        <Field label={t('recipe.visibility')}><Seg value={f.visibility} onChange={(v) => setF({ ...f, visibility: v })} options={(['draft', 'clients', 'link'] as const).map((v) => ({ value: v, label: t(('vis.' + v) as StringKey) }))} /></Field>
        {r?.share_token && f.visibility === 'link' && <div className="small">{t('nutrition.share')}: <code className="num">{location.origin}/r/{r.share_token}</code></div>}
      </div>
      <div>
        <div className="card stack">
          <h3>{t('nutrition.ingredients')}</h3>
          {f.ingredients.map((i: any, idx: number) => (
            <div key={idx} className="card soft" style={{ marginBottom: 0 }}>
              <div className="grid3">
                <Field label={t('common.name')}><Input value={i.name} onChange={(e) => setIng(idx, { name: e.target.value })} /></Field>
                <Field label={t('nutrition.grams')}><NumInput value={i.grams} onChange={(v) => setIng(idx, { grams: v })} /></Field>
                <Field label={t('recipe.displayQty')}><Input value={i.display_qty ?? ''} onChange={(e) => setIng(idx, { display_qty: e.target.value })} /></Field>
              </div>
              <Field label={t('recipe.food')}>
                <Select value={i.food_id ?? ''} onChange={(e) => { const fd = foodById.get(e.target.value); setIng(idx, { food_id: e.target.value || null, name: i.name || fd?.name || '' }); }}>
                  <option value="">{t('lib.none')}</option>
                  {foods.map((x) => <option key={x.id} value={x.id}>{x.name}{x.brand ? ` (${x.brand})` : ''}</option>)}
                </Select>
              </Field>
              {(i.substitutions ?? []).map((s: any, si: number) => (
                <div key={si} className="row nowrap" style={{ marginTop: 4 }}>
                  <span className="tiny muted">↔</span>
                  <Select value={s.food_id ?? ''} onChange={(e) => { const fd = foodById.get(e.target.value); setIng(idx, { substitutions: i.substitutions.map((x: any, k: number) => (k === si ? { ...x, food_id: e.target.value || null, name: fd?.name ?? x.name } : x)) }); }} style={{ flex: 2 }}>
                    <option value="">{t('lib.none')}</option>{foods.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </Select>
                  <div style={{ width: 90 }}><NumInput value={s.grams} onChange={(v) => setIng(idx, { substitutions: i.substitutions.map((x: any, k: number) => (k === si ? { ...x, grams: v } : x)) })} /></div>
                  <button className="btn small ghost" onClick={() => setIng(idx, { substitutions: i.substitutions.filter((_: any, k: number) => k !== si) })}>✕</button>
                </div>
              ))}
              <div className="row" style={{ marginTop: 4 }}>
                <button className="btn small ghost" onClick={() => setIng(idx, { substitutions: [...(i.substitutions ?? []), { food_id: null, name: '', grams: i.grams }] })}>{t('recipe.addSub')}</button>
                <button className="btn small ghost danger" onClick={() => setF({ ...f, ingredients: f.ingredients.filter((_: any, j: number) => j !== idx) })}>{t('common.delete')}</button>
              </div>
            </div>
          ))}
          <button className="btn small" onClick={() => setF({ ...f, ingredients: [...f.ingredients, { food_id: null, name: '', grams: 100, display_qty: '', substitutions: [] }] })}>{t('recipe.addIngredient')}</button>
        </div>
        <div className="card">
          <div className="small muted">{t('nutrition.perServing')}</div>
          <div className="grid3">{(['kcal', 'protein', 'carbs', 'fat'] as const).map((k) => <div key={k}><div className="tiny muted">{t(('nutrition.' + k) as StringKey)}</div><div className="bold"><N>{fmtNum(n.perServing[k])}</N></div></div>)}</div>
          {n.missing.length > 0 && <div className="tiny" style={{ color: 'var(--warn)' }}>{t('nutrition.missingData', { list: n.missing.join(', ') })}</div>}
        </div>
        {!!err && <ErrorBox error={err} />}
        {saved && <div className="alert ok">{t('common.saved')}</div>}
        <button className="btn primary big" disabled={!f.title || !f.servings} onClick={save}>{t('common.save')}</button>
      </div>
    </div>
  );
}
