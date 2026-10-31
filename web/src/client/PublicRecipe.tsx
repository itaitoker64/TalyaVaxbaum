import { useParams } from 'react-router';
import { useI18n } from '../i18n/index.tsx';
import { useApi } from '../api.ts';
import { Async, DemoBadge, N } from '../components/ui.tsx';
import type { StringKey } from '../i18n/strings.ts';

/** Read-only recipe page for links the coach chose to share publicly. */
export function PublicRecipe() {
  const { token } = useParams();
  const { t, fmtNum } = useI18n();
  const q = useApi<any>(`/public/recipes/${token}`);
  return (
    <div className="main">
      <div className="brand" style={{ marginBottom: '1rem' }}><span className="brand-mark">T</span>{t('app.name')} · @talyavaxbaum</div>
      <Async q={q}>
        {(r) => (
          <div>
            <h1>{r.title} <DemoBadge show={r.is_demo} /></h1>
            {r.description && <p>{r.description}</p>}
            <div className="row small muted">{r.prep_minutes ? <span>{t('nutrition.prep', { n: r.prep_minutes })}</span> : null}<span><N>{r.servings}</N> {t('nutrition.servings')}</span></div>
            <div className="card" style={{ marginTop: 8 }}>
              <div className="small muted">{t('nutrition.basis.recipe')} · {t('nutrition.perServing')}</div>
              <div className="grid3">{(['kcal', 'protein', 'carbs', 'fat'] as const).map((k) => <div key={k}><div className="tiny muted">{t(('nutrition.' + k) as StringKey)}</div><div className="bold num">{fmtNum(r.nutrition.perServing[k])}</div></div>)}</div>
              {r.nutrition.missing.length > 0 && <div className="tiny muted">{t('nutrition.missingData', { list: r.nutrition.missing.join(', ') })}</div>}
            </div>
            <div className="card"><h3>{t('nutrition.ingredients')}</h3><ul>{r.ingredients.map((i: any, idx: number) => <li key={idx}>{i.name} — <span className="num">{i.display_qty || `${i.grams} g`}</span></li>)}</ul></div>
            {r.instructions && <div className="card"><h3>{t('nutrition.instructions')}</h3><p className="pre">{r.instructions}</p></div>}
          </div>
        )}
      </Async>
    </div>
  );
}
