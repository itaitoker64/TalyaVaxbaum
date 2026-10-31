import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.tsx';
import { mediaUrl } from '../api.ts';
import { loadImage, drawCover, wrap } from './ShareCard.tsx';

/** Exports only the saved recipe; diary substitutions and private client data are not included. */
export function RecipeShare({ recipe: r }: { recipe: any }) {
  const { t, locale, fmtNum } = useI18n();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [show, setShow] = useState({ description: true, servings: true, prep: true });
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setBlob(null); setError(false);
    (async () => {
      await document.fonts.ready;
      const image = r.photo_media_id ? await loadImage(mediaUrl(r.photo_media_id)) : null;
      if (cancelled || !canvas.current) return;
      const ctx = canvas.current.getContext('2d')!;
      ctx.fillStyle = '#f3ece1'; ctx.fillRect(0, 0, 1080, 1920);
      if (image) { ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 1080, 1050); ctx.clip(); drawCover(ctx, image); ctx.restore(); }
      const rtl = locale === 'he', x = rtl ? 990 : 90;
      ctx.direction = rtl ? 'rtl' : 'ltr'; ctx.textAlign = rtl ? 'right' : 'left';
      ctx.fillStyle = '#26241f'; ctx.font = '700 84px "Frank Ruhl Libre"';
      let y = image ? 1120 : 580;
      for (const line of wrap(ctx, r.title, 900, 2)) { ctx.fillText(line, x, y); y += 100; }
      ctx.font = '500 36px Heebo';
      if (show.description && r.description) for (const line of wrap(ctx, r.description, 900, 2)) { y += 52; ctx.fillText(line, x, y); }
      y += 90;
      if (show.servings) { ctx.fillText(`${t('nutrition.servings')}: \u2068${fmtNum(r.servings)}\u2069`, x, y); y += 60; }
      if (show.prep && r.prep_minutes) { ctx.fillText(t('nutrition.prep', { n: r.prep_minutes }), x, y); y += 60; }
      if (r.is_demo) { ctx.fillText(t('common.demo'), x, y); }
      ctx.font = '700 36px "Frank Ruhl Libre"'; ctx.fillText('T · Movement by Talya', x, 1740);
      ctx.font = '500 32px Heebo'; ctx.direction = 'ltr'; ctx.fillText('@talyavaxbaum', x, 1810);
      canvas.current.toBlob(b => { if (!cancelled) { setBlob(b); if (!b) setError(true); } }, 'image/png');
    })().catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [r, show, locale, t, fmtNum]);
  const file = blob ? new File([blob], 'talya-recipe.png', { type: 'image/png' }) : null;
  return <div className="stack">
    <canvas ref={canvas} width={1080} height={1920} className="share-preview" role="img" aria-label={r.title} />
    <fieldset><legend>{t('recipe.shareInfo')}</legend><div className="chips">
      {(['description', 'servings', 'prep'] as const).filter(k => k !== 'prep' || r.prep_minutes).map(k => <button className="chip" type="button" key={k} aria-pressed={show[k]} onClick={() => setShow({ ...show, [k]: !show[k] })}>{t(k === 'description' ? 'common.description' : k === 'servings' ? 'nutrition.servings' : 'recipe.prepMinutes')}</button>)}
    </div></fieldset>
    {error && <p role="alert">{t('share.failed')}</p>}
    <button className="btn primary" disabled={!blob} onClick={() => { const url = URL.createObjectURL(blob!); const a = document.createElement('a'); a.href = url; a.download = 'talya-recipe.png'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000); }}>{t('share.download')}</button>
    {file && navigator.canShare?.({ files: [file] }) && <button className="btn" onClick={() => navigator.share({ files: [file] }).catch(e => { if (e.name !== 'AbortError') setError(true); })}>{t('share.shareBtn')}</button>}
    <p className="tiny muted">{t('share.noAuto')}</p>
  </div>;
}
