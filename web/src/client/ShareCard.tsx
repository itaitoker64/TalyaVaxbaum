import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { useI18n } from '../i18n/index.tsx';
import { useUser } from '../auth.tsx';
import { useApi } from '../api.ts';
import { Async, Icon, Input } from '../components/ui.tsx';

const SIZE = { w: 1080, h: 1920 };
type Bg = 'sage' | 'sand' | 'sea' | 'photo';
type StatKey = 'workoutName' | 'date' | 'duration' | 'exercises' | 'sets' | 'volume' | 'effort' | 'name' | 'note';

/** Real numbers from the log only; anything that can't be derived honestly is left out. */
export function shareStats(d: any) {
  const entries: any[] = d.entries ?? [];
  const logged = entries.filter((e) => {
    const x = e.data ?? {};
    return (x.sets ?? []).some((s: any) => s.done || s.reps != null) || x.durationSec != null || x.distanceKm != null || x.rounds != null || x.completed;
  });
  let sets = 0, volume = 0;
  for (const e of entries) for (const s of e.data?.sets ?? []) {
    if (!s.done) continue;
    sets++;
    if ((s.unit ?? 'kg') === 'kg' && s.reps != null && s.weight != null) volume += s.reps * s.weight;
  }
  let minutes: number | null = null;
  if (d.log.media_id) minutes = entries[0]?.data?.durationSec ? Math.round(entries[0].data.durationSec / 60) : null;
  else if (d.log.completed_at && d.log.started_at) {
    const m = Math.round((Date.parse(d.log.completed_at) - Date.parse(d.log.started_at)) / 60000);
    minutes = m >= 1 && m <= 300 ? m : null;
  }
  return { minutes, exercises: logged.length || null, sets: sets || null, volume: volume ? Math.round(volume) : null, effort: d.log.session_rpe ?? null };
}

export function ShareCard() {
  const { lid } = useParams();
  const q = useApi<any>(`/logs/${lid}`);
  return <Async q={q}>{(d) => <Editor d={d} />}</Async>;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement) {
  const s = Math.max(SIZE.w / img.naturalWidth, SIZE.h / img.naturalHeight);
  const w = img.naturalWidth * s, h = img.naturalHeight * s;
  ctx.drawImage(img, (SIZE.w - w) / 2, (SIZE.h - h) / 2, w, h);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const tryLine = cur ? cur + ' ' + w : w;
    if (ctx.measureText(tryLine).width <= maxW || !cur) cur = tryLine;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] += '…'; }
  return lines;
}

function Editor({ d }: { d: any }) {
  const { t, locale, fmtDate, fmtNum } = useI18n();
  const user = useUser();
  const canvas = useRef<HTMLCanvasElement>(null);
  const stats = useMemo(() => shareStats(d), [d]);
  const [bg, setBg] = useState<Bg>('sand');
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [note, setNote] = useState('');
  // Personal details (name, note, own photo) are off until the user turns them on.
  const [show, setShow] = useState<Record<StatKey, boolean>>({
    workoutName: true, date: true, duration: stats.minutes != null, exercises: stats.exercises != null,
    sets: false, volume: false, effort: false, name: false, note: false,
  });
  const [ready, setReady] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const rtl = locale === 'he';

  const statItems = ([
    ['duration', stats.minutes, t('share.minutes')],
    ['exercises', stats.exercises, t('share.exercisesLbl')],
    ['sets', stats.sets, t('share.setsLbl')],
    ['volume', stats.volume, t('share.kg')],
    ['effort', stats.effort, t('share.rpe')],
  ] as const).filter(([k, v]) => v != null && show[k]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.all([
        document.fonts.load('700 96px "Frank Ruhl Libre"', 'אבג'),
        document.fonts.load('700 120px Heebo', 'אבג 123'),
        document.fonts.load('500 36px Heebo', 'אבג'),
      ]).catch(() => undefined);
      const c = canvas.current;
      if (!c || cancelled) return;
      const ctx = c.getContext('2d')!;
      ctx.clearRect(0, 0, SIZE.w, SIZE.h);
      const dark = bg !== 'sand';
      const ink = dark ? '#ffffff' : '#26241f';
      const accent = dark ? '#a6d86e' : '#4d6143';

      // Background
      if (bg === 'photo' && photo) {
        drawCover(ctx, photo);
      } else if (bg === 'sea') {
        drawCover(ctx, await loadImage('/placeholders/sea.svg'));
      } else {
        ctx.fillStyle = bg === 'sand' ? '#f3ece1' : '#4d6143';
        ctx.fillRect(0, 0, SIZE.w, SIZE.h);
        ctx.strokeStyle = bg === 'sand' ? '#dccdb6' : '#7e9471';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(90, 250); ctx.lineTo(SIZE.w - 90, 250); ctx.stroke();
      }
      if (dark) {
        // Contrast scrim behind text over imagery.
        const s = ctx.createLinearGradient(0, SIZE.h * 0.38, 0, SIZE.h);
        s.addColorStop(0, 'rgba(20,18,15,0)');
        s.addColorStop(1, bg === 'sage' ? 'rgba(20,18,15,0.35)' : 'rgba(20,18,15,0.82)');
        ctx.fillStyle = s;
        ctx.fillRect(0, 0, SIZE.w, SIZE.h);
        const top = ctx.createLinearGradient(0, 0, 0, 300);
        top.addColorStop(0, 'rgba(20,18,15,0.35)'); top.addColorStop(1, 'rgba(20,18,15,0)');
        ctx.fillStyle = top; ctx.fillRect(0, 0, SIZE.w, 300);
      }

      ctx.direction = rtl ? 'rtl' : 'ltr';
      ctx.textAlign = rtl ? 'right' : 'left';
      ctx.textBaseline = 'alphabetic';
      const X = rtl ? SIZE.w - 90 : 90;
      const sign = rtl ? -1 : 1;

      // Small brand mark
      ctx.fillStyle = dark ? 'rgba(255,253,248,0.92)' : '#7e9471';
      ctx.beginPath(); ctx.arc(X + sign * 30, 132, 30, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = dark ? '#4d6143' : '#ffffff';
      ctx.font = '700 34px "Frank Ruhl Libre"';
      ctx.textAlign = 'center';
      ctx.fillText('T', X + sign * 30, 144);
      ctx.textAlign = rtl ? 'right' : 'left';
      ctx.fillStyle = ink;
      ctx.font = '700 36px "Frank Ruhl Libre"';
      ctx.fillText('Movement by Talya', X + sign * 78, 145);

      if (user.is_demo || d.log.is_demo || (bg === 'sea')) {
        ctx.font = '500 30px Heebo';
        ctx.fillText([user.is_demo || d.log.is_demo ? t('common.demo') : '', bg === 'sea' ? t('img.placeholder') : ''].filter(Boolean).join(' · '), X, 205);
      }

      // Content block, laid out bottom-up so the achievement sits in the lower third.
      ctx.font = '700 104px "Frank Ruhl Libre"';
      const titleLines = show.workoutName ? wrap(ctx, d.log.title, SIZE.w - 180, 3) : [];
      const statRows = Math.ceil(statItems.length / 3);
      let h = 60 + titleLines.length * 116 + (show.date ? 64 : 0) + (statRows ? 60 + statRows * 210 : 0) + (show.note && note ? 140 : 0) + (show.name ? 70 : 0);
      let y = SIZE.h - 210 - h;

      ctx.fillStyle = accent;
      ctx.font = '700 42px Heebo';
      ctx.fillText(d.log.status === 'partial' ? t('status.partial') : t('share.done'), X, y + 42);
      y += 60;
      ctx.fillStyle = ink;
      ctx.font = '700 104px "Frank Ruhl Libre"';
      for (const line of titleLines) { y += 116; ctx.fillText(line, X, y - 16); }
      if (show.date) {
        ctx.font = '500 40px Heebo';
        ctx.globalAlpha = 0.9;
        y += 64;
        ctx.fillText(fmtDate(d.log.date, { weekday: 'long', day: 'numeric', month: 'long' }), X, y - 8);
        ctx.globalAlpha = 1;
      }
      if (statRows) {
        y += 60;
        statItems.forEach(([, v], i) => {
          const col = i % 3, row = Math.floor(i / 3);
          const cx = X + sign * col * 310;
          const cy = y + row * 210;
          ctx.fillStyle = ink;
          ctx.font = '700 124px Heebo';
          ctx.save(); ctx.direction = 'ltr'; ctx.textAlign = rtl ? 'right' : 'left';
          ctx.fillText(fmtNum(v as number, 0), cx, cy + 120);
          ctx.restore();
          ctx.font = '500 36px Heebo';
          ctx.globalAlpha = 0.88;
          ctx.fillText(statItems[i][2], cx, cy + 172);
          ctx.globalAlpha = 1;
        });
        y += statRows * 210;
      }
      if (show.note && note) {
        ctx.font = '500 46px Heebo';
        ctx.fillStyle = ink;
        wrap(ctx, `“${note}”`, SIZE.w - 180, 2).forEach((l, i) => ctx.fillText(l, X, y + 70 + i * 60));
        y += 140;
      }
      if (show.name) {
        ctx.font = '500 40px Heebo';
        ctx.fillText(`— ${user.name.split(' ')[0]}`, X, y + 56);
      }
      // Handle
      ctx.font = '500 34px Heebo';
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = ink;
      ctx.save(); ctx.direction = 'ltr';
      ctx.fillText('@talyavaxbaum', X, SIZE.h - 110);
      ctx.restore();
      ctx.globalAlpha = 1;
      if (!cancelled) setReady(true);
      c.toBlob((b) => {
        if (!b) return;
        const f = new File([b], 'movement-by-talya.png', { type: 'image/png' });
        setCanShare(!!navigator.canShare?.({ files: [f] }));
      });
    })();
    return () => { cancelled = true; };
  }, [bg, photo, show, note, d, rtl, t, fmtDate, fmtNum, user.name, statItems.length]);

  const blob = () => new Promise<Blob>((res) => canvas.current!.toBlob((b) => res(b!), 'image/png'));
  const download = async () => {
    const url = URL.createObjectURL(await blob());
    const a = document.createElement('a');
    a.href = url; a.download = 'movement-by-talya.png'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const share = async () => {
    const file = new File([await blob()], 'movement-by-talya.png', { type: 'image/png' });
    await navigator.share({ files: [file] }).catch(() => undefined);
  };

  const toggles: [StatKey, string, boolean][] = [
    ['workoutName', t('share.workoutName'), true], ['date', t('share.date'), true],
    ['duration', t('share.duration'), stats.minutes != null], ['exercises', t('share.exercises'), stats.exercises != null],
    ['sets', t('share.sets'), stats.sets != null], ['volume', t('share.volume'), stats.volume != null], ['effort', t('share.effort'), stats.effort != null],
  ];
  const bgs: { k: Bg; label: string; style: React.CSSProperties }[] = [
    { k: 'sage', label: t('share.bg.sage'), style: { background: '#4d6143' } },
    { k: 'sand', label: t('share.bg.sand'), style: { background: '#f3ece1' } },
    { k: 'sea', label: t('share.bg.sea'), style: { backgroundImage: 'url(/placeholders/sea.svg)' } },
  ];

  return (
    <div>
      <h1>{t('share.title')}</h1>
      <div className="share-layout">
        <div>
          <canvas ref={canvas} width={SIZE.w} height={SIZE.h} className="share-preview" role="img"
            aria-label={`${t('share.done')}: ${d.log.title}`} />
        </div>
        <div className="stack">
          <div className="card stack">
            <h3>{t('share.bg')}</h3>
            <div className="bgpick" role="group" aria-label={t('share.bg')}>
              {bgs.map((b) => <button key={b.k} type="button" aria-pressed={bg === b.k} aria-label={b.label} title={b.label} style={b.style} onClick={() => setBg(b.k)} />)}
              <label className="btn small" style={{ alignSelf: 'center' }}>
                <Icon name="image" size={18} /> {t('share.photo')}
                <input type="file" accept="image/*" hidden onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setPhoto(await loadImage(URL.createObjectURL(f)));
                  setBg('photo');
                }} />
              </label>
            </div>
            <div className="tiny muted">{t('share.photoNote')}</div>
          </div>
          <div className="card stack">
            <h3>{t('share.include')}</h3>
            <div className="chips">
              {toggles.filter(([, , avail]) => avail).map(([k, label]) => (
                <button key={k} type="button" className="chip" aria-pressed={show[k]} onClick={() => setShow({ ...show, [k]: !show[k] })}>{show[k] && <Icon name="check" size={16} />}{label}</button>
              ))}
            </div>
            <div className="divider" />
            <div className="chips">
              <button type="button" className="chip" aria-pressed={show.name} onClick={() => setShow({ ...show, name: !show.name })}>{show.name && <Icon name="check" size={16} />}{t('share.name')}</button>
              <button type="button" className="chip" aria-pressed={show.note} onClick={() => setShow({ ...show, note: !show.note })}>{show.note && <Icon name="check" size={16} />}{t('share.note')}</button>
            </div>
            {show.note && <Input value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} placeholder={t('share.note')} />}
            <div className="tiny muted">{t('share.privacy')}</div>
          </div>
          <div className="row">
            <button className="btn primary grow" onClick={download} disabled={!ready}><Icon name="download" /> {t('share.download')}</button>
            {canShare && <button className="btn grow" onClick={share} disabled={!ready}><Icon name="share" /> {t('share.shareBtn')}</button>}
          </div>
          <div className="tiny muted center">{t('share.noAuto')}</div>
        </div>
      </div>
    </div>
  );
}
