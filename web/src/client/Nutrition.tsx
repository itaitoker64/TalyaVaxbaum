import { useMemo, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router';
import { useI18n } from '../i18n/index.tsx';
import { useAuth, useUser } from '../auth.tsx';
import { useApi, POST, PUT, DEL } from '../api.ts';
import { Async, DateNav, Modal, Seg, Field, Input, NumInput, Select, ErrorBox, Empty, DemoBadge, N } from '../components/ui.tsx';
import { MediaPlayer } from '../components/media.tsx';
import { MacroStat } from './Today.tsx';
import { mediaUrl } from '../api.ts';
import { todayISO } from '../../../shared/dates.ts';
import { sumMacros, recipeNutrition, macrosForGrams } from '../../../shared/nutrition.ts';
import type { MealSlot, NutritionConfig } from '../../../shared/types.ts';
import type { StringKey } from '../i18n/strings.ts';

const MEALS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export function Diary({ clientId, config, readOnly }: { clientId: string; config: NutritionConfig; readOnly?: boolean }) {
  const { t, fmtNum } = useI18n();
  const [date, setDate] = useState(todayISO());
  const q = useApi<any[]>(`/clients/${clientId}/food-entries?date=${date}`);
  const [adding, setAdding] = useState<MealSlot | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [savingMeal, setSavingMeal] = useState<MealSlot | null>(null);
  const targets = config.mode === 'targets';

  return (
    <div>
      <DateNav date={date} onChange={setDate} />
      <Async q={q}>
        {(entries) => {
          const totals = sumMacros(entries as any);
          return (
            <>
              <div className="card">
                <div className="tiny muted" style={{ marginBottom: 6 }}>{t('nutrition.totals')}</div>
                <div className="grid3">
                  <MacroStat label={t('nutrition.kcal')} v={totals.kcal} target={targets ? config.kcal : null} fmt={fmtNum} />
                  <MacroStat label={t('nutrition.protein')} v={totals.protein} target={targets ? config.protein : null} fmt={fmtNum} unit="g" />
                  <MacroStat label={t('nutrition.carbs')} v={totals.carbs} target={targets ? config.carbs : null} fmt={fmtNum} unit="g" />
                  <MacroStat label={t('nutrition.fat')} v={totals.fat} target={targets ? config.fat : null} fmt={fmtNum} unit="g" />
                </div>
              </div>
              {MEALS.map((meal) => {
                const list = entries.filter((e) => e.meal === meal);
                return (
                  <div className="card" key={meal}>
                    <div className="card-title">
                      <h3>{t(('nutrition.meal.' + meal) as StringKey)}</h3>
                      <span className="small muted num">{fmtNum(sumMacros(list).kcal, 0)} kcal</span>
                    </div>
                    {list.length > 0 && (
                      <ul className="list">
                        {list.map((e) => (
                          <li key={e.id} className="row nowrap">
                            <div className="grow">
                              <div>{e.name}</div>
                              <div className="tiny muted">
                                <N>{e.unit === 'g' ? `${fmtNum(e.amount, 0)} g` : `${fmtNum(e.amount)} ${t('nutrition.serving')}`}</N> · {t(('nutrition.basis.' + e.basis) as StringKey)}
                                {e.detail?.swaps?.length ? ` · ${e.detail.swaps.map((s: any) => `${s.from}→${s.to}`).join(', ')}` : ''}
                              </div>
                            </div>
                            <span className="num small">{e.kcal != null ? fmtNum(e.kcal, 0) : '–'}</span>
                            {!readOnly && <button className="btn small ghost" onClick={() => setEditing(e)}>{t('common.edit')}</button>}
                          </li>
                        ))}
                      </ul>
                    )}
                    {!readOnly && (
                      <div className="row">
                        <button className="btn small" onClick={() => setAdding(meal)}>+ {t('nutrition.add')}</button>
                        {list.length > 0 && <button className="btn small ghost" onClick={() => setSavingMeal(meal)}>{t('nutrition.saveMeal')}</button>}
                      </div>
                    )}
                  </div>
                );
              })}
              {adding && <AddFood clientId={clientId} date={date} meal={adding} onClose={() => setAdding(null)} onAdded={() => { setAdding(null); q.reload(); }} />}
              {editing && <EditEntry entry={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); q.reload(); }} />}
              {savingMeal && <SaveMeal clientId={clientId} entries={entries.filter((e) => e.meal === savingMeal)} onClose={() => setSavingMeal(null)} />}
            </>
          );
        }}
      </Async>
    </div>
  );
}

function AddFood({ clientId, date, meal, onClose, onAdded }: { clientId: string; date: string; meal: MealSlot; onClose: () => void; onAdded: () => void }) {
  const { t, fmtNum } = useI18n();
  const [tab, setTab] = useState<'foods' | 'recipes' | 'saved' | 'quick' | 'new'>('foods');
  const [search, setSearch] = useState('');
  const foods = useApi<any[]>(tab === 'foods' ? `/foods?q=${encodeURIComponent(search)}` : null);
  const recipes = useApi<any[]>(tab === 'recipes' ? '/recipes' : null);
  const saved = useApi<any[]>(tab === 'saved' ? `/clients/${clientId}/saved-meals` : null);
  const [picked, setPicked] = useState<any>(null);
  const [amount, setAmount] = useState<number | null>(100);
  const [unit, setUnit] = useState<'g' | 'serving'>('g');
  const [quick, setQuick] = useState<{ name: string; kcal: number | null; protein: number | null; carbs: number | null; fat: number | null }>({ name: '', kcal: null, protein: null, carbs: null, fat: null });
  const [nf, setNf] = useState<any>({ name: '', brand: '', kcal: null, protein: null, carbs: null, fat: null, serving_g: null });
  const [err, setErr] = useState<unknown>(null);
  const nav = useNavigate();

  const add = async (body: any) => {
    setErr(null);
    try {
      await POST(`/clients/${clientId}/food-entries`, { date, meal, ...body });
      onAdded();
    } catch (e) {
      setErr(e);
    }
  };
  const fav = async (f: any) => {
    await POST('/favorites', { kind: 'food', ref_id: f.id, on: !f.favorite });
    foods.reload();
  };

  return (
    <Modal title={t('nutrition.addTo', { meal: t(('nutrition.meal.' + meal) as StringKey) })} onClose={onClose}>
      <div className="stack">
        <Seg value={tab} onChange={(v) => { setTab(v); setPicked(null); }} options={[
          { value: 'foods', label: t('nutrition.foods') }, { value: 'recipes', label: t('nutrition.recipes') },
          { value: 'saved', label: t('nutrition.saved') }, { value: 'quick', label: t('nutrition.quick') }, { value: 'new', label: '+' },
        ]} />
        {tab === 'foods' && !picked && (
          <>
            <Input placeholder={t('common.search')} value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
            <Async q={foods}>
              {(list) => list.length === 0 ? <Empty>{t('common.none')}</Empty> : (
                <ul className="list">
                  {list.map((f) => (
                    <li key={f.id} className="row nowrap">
                      <button className="btn ghost" style={{ padding: 0 }} aria-label={t('common.favorite')} onClick={() => fav(f)}>{f.favorite ? '★' : '☆'}</button>
                      <button className="listlink grow" style={{ background: 'none', border: 0, textAlign: 'start', cursor: 'pointer' }} onClick={() => { setPicked(f); setUnit(f.serving_g ? 'serving' : 'g'); setAmount(f.serving_g ? 1 : 100); }}>
                        <span className="grow">{f.name}{f.brand ? <span className="muted small"> · {f.brand}</span> : null} <DemoBadge show={f.is_demo} /></span>
                        <span className="num small muted">{f.kcal != null ? `${fmtNum(f.kcal, 0)}/100g` : '–'}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Async>
          </>
        )}
        {tab === 'foods' && picked && (
          <div className="stack">
            <strong>{picked.name}</strong>
            <div className="row">
              <NumInput value={amount} onChange={setAmount} ariaLabel={t('nutrition.amount')} />
              <Seg value={unit} onChange={setUnit} options={[{ value: 'g', label: t('nutrition.grams') }, ...(picked.serving_g ? [{ value: 'serving' as const, label: picked.serving_label || t('nutrition.serving') }] : [])]} />
            </div>
            {amount ? <div className="small muted num">≈ {fmtNum(macrosForGrams(picked, unit === 'g' ? amount : amount * picked.serving_g).kcal, 0)} kcal · {t('nutrition.basis.food')}</div> : null}
            <div className="row"><button className="btn" onClick={() => setPicked(null)}>{t('common.back')}</button><button className="btn primary grow" disabled={!amount} onClick={() => add({ kind: 'food', food_id: picked.id, amount, unit })}>{t('nutrition.log')}</button></div>
          </div>
        )}
        {tab === 'recipes' && (
          <Async q={recipes}>
            {(list) => list.length === 0 ? <Empty>{t('common.none')}</Empty> : (
              <ul className="list">{list.map((r) => (
                <li key={r.id}><button className="listlink" style={{ background: 'none', border: 0, width: '100%', cursor: 'pointer' }} onClick={() => nav(`/nutrition/recipe/${r.id}?date=${date}&meal=${meal}`)}>
                  <span className="grow" style={{ textAlign: 'start' }}>{r.title} <DemoBadge show={r.is_demo} /></span><span className="num small muted">{fmtNum(r.nutrition.perServing.kcal, 0)} kcal / {t('nutrition.serving')}</span>
                </button></li>
              ))}</ul>
            )}
          </Async>
        )}
        {tab === 'saved' && (
          <Async q={saved}>
            {(list) => list.length === 0 ? <Empty>{t('common.none')}</Empty> : (
              <ul className="list">{list.map((m) => (
                <li key={m.id} className="row nowrap">
                  <span className="grow">{m.name} <span className="tiny muted">({m.items.length})</span></span>
                  <button className="btn small primary" onClick={async () => { try { await POST(`/saved-meals/${m.id}/log`, { date, meal }); onAdded(); } catch (e) { setErr(e); } }}>{t('nutrition.log')}</button>
                  <button className="btn small ghost" onClick={async () => { await DEL(`/saved-meals/${m.id}`); saved.reload(); }}>{t('common.delete')}</button>
                </li>
              ))}</ul>
            )}
          </Async>
        )}
        {tab === 'quick' && (
          <div className="stack">
            <Field label={t('common.name')}><Input value={quick.name} onChange={(e) => setQuick({ ...quick, name: e.target.value })} /></Field>
            <div className="grid3">
              {(['kcal', 'protein', 'carbs', 'fat'] as const).map((k) => <Field key={k} label={t(('nutrition.' + k) as StringKey)}><NumInput value={quick[k]} onChange={(v) => setQuick({ ...quick, [k]: v })} /></Field>)}
            </div>
            <button className="btn primary big" disabled={!quick.name} onClick={() => add({ kind: 'manual', ...quick })}>{t('nutrition.log')}</button>
          </div>
        )}
        {tab === 'new' && (
          <div className="stack">
            <Field label={t('common.name')}><Input value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} /></Field>
            <div className="small muted">{t('nutrition.per100')}</div>
            <div className="grid3">
              {(['kcal', 'protein', 'carbs', 'fat'] as const).map((k) => <Field key={k} label={t(('nutrition.' + k) as StringKey)}><NumInput value={nf[k]} onChange={(v) => setNf({ ...nf, [k]: v })} /></Field>)}
              <Field label={t('nutrition.servingSize')}><NumInput value={nf.serving_g} onChange={(v) => setNf({ ...nf, serving_g: v })} /></Field>
            </div>
            <button className="btn primary big" disabled={!nf.name || nf.kcal == null} onClick={async () => {
              try {
                await POST('/foods', { ...nf, brand: nf.brand || null, source: 'label' });
                setTab('foods');
                setSearch(nf.name);
              } catch (e) { setErr(e); }
            }}>{t('common.save')}</button>
          </div>
        )}
        <div className="tiny muted">{t('nutrition.photoLater')}</div>
        {!!err && <ErrorBox error={err} />}
      </div>
    </Modal>
  );
}

function EditEntry({ entry, onClose, onDone }: { entry: any; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const [meal, setMeal] = useState<MealSlot>(entry.meal);
  const [amount, setAmount] = useState<number | null>(entry.amount);
  const [err, setErr] = useState<unknown>(null);
  const save = async () => {
    try {
      const body: any = { meal };
      if (entry.basis === 'food' && amount !== entry.amount) Object.assign(body, { kind: 'food', food_id: entry.food_id, amount, unit: entry.unit });
      if (entry.basis === 'recipe' && amount !== entry.amount) Object.assign(body, { kind: 'recipe', recipe_id: entry.recipe_id, servings: amount });
      await PUT(`/food-entries/${entry.id}`, body);
      onDone();
    } catch (e) { setErr(e); }
  };
  return (
    <Modal title={entry.name} onClose={onClose}>
      <div className="stack">
        <Field label={t('common.status')}><Select value={meal} onChange={(e) => setMeal(e.target.value as MealSlot)}>{MEALS.map((m) => <option key={m} value={m}>{t(('nutrition.meal.' + m) as StringKey)}</option>)}</Select></Field>
        {entry.basis !== 'manual' && <Field label={`${t('nutrition.amount')} (${entry.unit === 'g' ? t('nutrition.grams') : t('nutrition.servings')})`}><NumInput value={amount} onChange={setAmount} /></Field>}
        {!!err && <ErrorBox error={err} />}
        <div className="row">
          <button className="btn danger" onClick={async () => { await DEL(`/food-entries/${entry.id}`); onDone(); }}>{t('common.delete')}</button>
          <button className="btn primary grow" onClick={save} disabled={!amount}>{t('common.save')}</button>
        </div>
      </div>
    </Modal>
  );
}

function SaveMeal({ clientId, entries, onClose }: { clientId: string; entries: any[]; onClose: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [err, setErr] = useState<unknown>(null);
  return (
    <Modal title={t('nutrition.saveMeal')} onClose={onClose}>
      <div className="stack">
        <ul className="small">{entries.map((e) => <li key={e.id}>{e.name}</li>)}</ul>
        <Field label={t('nutrition.mealName')}><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        {!!err && <ErrorBox error={err} />}
        <button className="btn primary big" disabled={!name} onClick={async () => { try { await POST(`/clients/${clientId}/saved-meals`, { name, entryIds: entries.map((e) => e.id) }); onClose(); } catch (e) { setErr(e); } }}>{t('common.save')}</button>
      </div>
    </Modal>
  );
}

export function Nutrition() {
  const { t } = useI18n();
  const user = useUser();
  const { me } = useAuth();
  const [tab, setTab] = useState<'diary' | 'recipes'>('diary');
  const config = me?.nutrition ?? { mode: 'diary' };
  return (
    <div>
      <div className="row between" style={{ marginBottom: '0.75rem' }}>
        <h1 style={{ margin: 0 }}>{t('tab.nutrition')}</h1>
        <Seg value={tab} onChange={setTab} options={[{ value: 'diary', label: t('nutrition.diary') }, { value: 'recipes', label: t('nutrition.recipes') }]} />
      </div>
      {config.guidance && tab === 'diary' && (
        <details className="card sage"><summary className="bold">{t('nutrition.guidance')}</summary><p className="pre" style={{ marginTop: 8 }}>{config.guidance}</p></details>
      )}
      {tab === 'recipes' ? <RecipeList /> : config.mode === 'off' ? <Empty>{t('nutrition.off')}</Empty> : <Diary clientId={user.id} config={config} />}
      <p className="tiny muted center">{t('nutrition.trackingNote')}</p>
    </div>
  );
}

function RecipeList() {
  const { t, fmtNum } = useI18n();
  const q = useApi<any[]>('/recipes');
  return (
    <Async q={q}>
      {(list) => list.length === 0 ? <Empty>{t('common.none')}</Empty> : (
        <div className="grid2">
          {list.map((r) => (
            <Link key={r.id} to={`/nutrition/recipe/${r.id}`} className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
              {r.photo_media_id && <img className="recipe-photo" src={mediaUrl(r.photo_media_id)} alt="" style={{ maxHeight: 160 }} />}
              <div className="row between"><strong>{r.title}</strong>{r.favorite && <span>★</span>}</div>
              <div className="small muted">
                {r.prep_minutes ? t('nutrition.prep', { n: r.prep_minutes }) + ' · ' : ''}
                <span className="num">{fmtNum(r.nutrition.perServing.kcal, 0)} kcal</span> {t('nutrition.perServing')} <DemoBadge show={r.is_demo} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </Async>
  );
}

export function RecipeScreen() {
  const { id } = useParams();
  const q = useApi<any>(`/recipes/${id}`);
  return <Async q={q}>{(r) => <RecipeDetail r={r} reload={q.reload} />}</Async>;
}

function RecipeDetail({ r, reload }: { r: any; reload: () => void }) {
  const { t, fmtNum } = useI18n();
  const user = useUser();
  const nav = useNavigate();
  const params = new URLSearchParams(location.search);
  const [swaps, setSwaps] = useState<Record<string, number>>({});
  const [servings, setServings] = useState<number | null>(1);
  const [meal, setMeal] = useState<MealSlot>((params.get('meal') as MealSlot) || 'lunch');
  const [err, setErr] = useState<unknown>(null);
  const n = useMemo(() => recipeNutrition(r.ingredients, r.servings, swaps), [r, swaps]);
  const isClient = user.role === 'client';
  return (
    <div>
      {r.photo_media_id && <img className="recipe-photo" src={mediaUrl(r.photo_media_id)} alt={r.title} />}
      <div className="row between" style={{ margin: '0.75rem 0' }}>
        <h1 style={{ margin: 0 }}>{r.title} <DemoBadge show={r.is_demo} /></h1>
        <button className="btn ghost" onClick={async () => { await POST('/favorites', { kind: 'recipe', ref_id: r.id, on: !r.favorite }); reload(); }} aria-label={t('common.favorite')}>{r.favorite ? '★' : '☆'}</button>
      </div>
      {r.description && <p>{r.description}</p>}
      <div className="row small muted">{r.prep_minutes ? <span>{t('nutrition.prep', { n: r.prep_minutes })}</span> : null}<span><N>{r.servings}</N> {t('nutrition.servings')}</span></div>
      {r.video_url && <div style={{ marginTop: 8 }}><MediaPlayer media={{ id: '', title: r.title, external_url: r.video_url }} /></div>}

      <div className="card" style={{ marginTop: '0.75rem' }}>
        <div className="small muted">{t('nutrition.basis.recipe')} · {t('nutrition.perServing')}</div>
        <div className="grid3">
          {(['kcal', 'protein', 'carbs', 'fat'] as const).map((k) => <div key={k}><div className="tiny muted">{t(('nutrition.' + k) as StringKey)}</div><div className="bold num">{fmtNum(n.perServing[k], k === 'kcal' ? 0 : 1)}{k === 'kcal' ? '' : 'g'}</div></div>)}
        </div>
        {n.missing.length > 0 && <div className="tiny" style={{ color: 'var(--warn)', marginTop: 6 }}>{t('nutrition.missingData', { list: n.missing.join(', ') })}</div>}
      </div>

      <div className="card">
        <h3>{t('nutrition.ingredients')}</h3>
        <ul className="list">
          {r.ingredients.map((i: any) => (
            <li key={i.id}>
              <div className="row between">
                <span>{swaps[i.id] != null ? i.substitutions[swaps[i.id]].name : i.name}</span>
                <span className="num small muted">{i.display_qty || `${swaps[i.id] != null ? i.substitutions[swaps[i.id]].grams : i.grams} g`}</span>
              </div>
              {i.substitutions?.length > 0 && (
                <div className="row" style={{ marginTop: 4 }}>
                  <span className="tiny muted">{t('nutrition.swaps')}:</span>
                  <button className={'btn small' + (swaps[i.id] == null ? ' primary' : '')} onClick={() => { const s = { ...swaps }; delete s[i.id]; setSwaps(s); }}>{i.name}</button>
                  {i.substitutions.map((s: any, idx: number) => <button key={idx} className={'btn small' + (swaps[i.id] === idx ? ' primary' : '')} onClick={() => setSwaps({ ...swaps, [i.id]: idx })}>{s.name}</button>)}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
      {r.instructions && <div className="card"><h3>{t('nutrition.instructions')}</h3><p className="pre">{r.instructions}</p></div>}

      {isClient && (
        <div className="card sage stack">
          <h3>{t('nutrition.logRecipe')}</h3>
          <div className="row">
            <div className="stepper">
              <button onClick={() => setServings(Math.max(0.25, (servings ?? 1) - 0.25))}>−</button>
              <NumInput value={servings} onChange={setServings} ariaLabel={t('nutrition.servings')} />
              <button onClick={() => setServings((servings ?? 0) + 0.25)}>+</button>
            </div>
            <span className="small">{t('nutrition.servings')}</span>
            <Select value={meal} onChange={(e) => setMeal(e.target.value as MealSlot)} style={{ width: 'auto' }}>{MEALS.map((m) => <option key={m} value={m}>{t(('nutrition.meal.' + m) as StringKey)}</option>)}</Select>
          </div>
          {servings ? <div className="small num">≈ {fmtNum(n.perServing.kcal * servings, 0)} kcal</div> : null}
          {!!err && <ErrorBox error={err} />}
          <button className="btn primary big" disabled={!servings} onClick={async () => {
            try {
              await POST(`/clients/${user.id}/food-entries`, { date: params.get('date') || todayISO(), meal, kind: 'recipe', recipe_id: r.id, servings, swaps });
              nav('/nutrition');
            } catch (e) { setErr(e); }
          }}>{t('nutrition.log')}</button>
        </div>
      )}
    </div>
  );
}
