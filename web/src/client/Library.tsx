import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useI18n } from '../i18n/index.tsx';
import { useUser } from '../auth.tsx';
import { useApi, POST } from '../api.ts';
import { Async, Chip, Empty, Field, Seg, TextArea, NumInput, ErrorBox, Icon, DemoBadge } from '../components/ui.tsx';
import { Cover } from '../components/imagery.tsx';
import { MediaPlayer } from '../components/media.tsx';
import { WorkoutCard, useLevelLabel } from '../components/cards.tsx';
import { todayISO, addDays } from '../../../shared/dates.ts';
import type { StringKey } from '../i18n/strings.ts';

type Dur = 'short' | 'mid' | 'long';
const durOf = (sec?: number | null): Dur | null => (sec == null ? null : sec <= 15 * 60 ? 'short' : sec <= 30 * 60 ? 'mid' : 'long');
const LEVELS = ['beginner', 'intermediate', 'advanced'];

/** Guided (follow-along) practices: visual cards, categories, and filters for duration, level and equipment. */
export function PracticeLibrary() {
  const { t } = useI18n();
  const user = useUser();
  const q = useApi<any[]>('/media?kind=follow_along');
  const logs = useApi<any[]>(`/clients/${user.id}/logs?limit=100`);
  const [cat, setCat] = useState<string | null>(null);
  const [dur, setDur] = useState<Dur | null>(null);
  const [level, setLevel] = useState<string | null>(null);
  const [equip, setEquip] = useState<'none' | 'some' | null>(null);
  const recent = useMemo(() => {
    const since = addDays(todayISO(), -6);
    return new Set((logs.data ?? []).filter((l) => l.media_id && l.date >= since).map((l) => l.media_id));
  }, [logs.data]);
  const toggle = <T,>(cur: T | null, v: T, set: (x: T | null) => void) => set(cur === v ? null : v);

  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>{t('lib.guidedIntro')}</p>
      <Async q={q}>
        {(all) => {
          const cats = [...new Set(all.map((m) => m.category).filter(Boolean))] as string[];
          const list = all.filter((m) =>
            (!cat || m.category === cat) && (!dur || durOf(m.duration_sec) === dur) && (!level || (m.level ?? '').toLowerCase() === level) &&
            (!equip || (equip === 'none' ? !m.equipment : !!m.equipment)));
          const filtered = !!(cat || dur || level || equip);
          return (
            <>
              <div className="chips scroll" role="group" aria-label={t('lib.category')} style={{ marginBottom: '0.6rem' }}>
                <Chip on={!cat} onClick={() => setCat(null)}>{t('common.all')}</Chip>
                {cats.map((c) => <Chip key={c} on={cat === c} onClick={() => toggle(cat, c, setCat)}>{t(('cat.' + c) as StringKey)}</Chip>)}
              </div>
              <details className="card soft" style={{ padding: '0.6rem 0.9rem' }}>
                <summary className="row" style={{ cursor: 'pointer', minHeight: 'var(--tap)' }}>
                  <Icon name="filter" size={18} /> <span className="bold">{t('lib.filterDuration')} · {t('lib.filterLevel')} · {t('lib.filterEquipment')}</span>
                </summary>
                <div className="stack" style={{ marginTop: '0.5rem' }}>
                  <div className="chips" role="group" aria-label={t('lib.filterDuration')}>
                    {(['short', 'mid', 'long'] as const).map((d) => <Chip key={d} on={dur === d} onClick={() => toggle(dur, d, setDur)}>{t(('dur.' + d) as StringKey)}</Chip>)}
                  </div>
                  <div className="chips" role="group" aria-label={t('lib.filterLevel')}>
                    {LEVELS.map((l) => <Chip key={l} on={level === l} onClick={() => toggle(level, l, setLevel)}>{t(('level.' + l) as StringKey)}</Chip>)}
                  </div>
                  <div className="chips" role="group" aria-label={t('lib.filterEquipment')}>
                    {(['none', 'some'] as const).map((e) => <Chip key={e} on={equip === e} onClick={() => toggle(equip, e, setEquip)}>{t(('equip.' + e) as StringKey)}</Chip>)}
                  </div>
                </div>
              </details>
              <div className="row between" style={{ margin: '0.25rem 0 0.6rem' }}>
                <span className="small muted" aria-live="polite">{t('lib.results', { n: list.length })}</span>
                {filtered && <button className="btn small ghost" onClick={() => { setCat(null); setDur(null); setLevel(null); setEquip(null); }}>{t('lib.clear')}</button>}
              </div>
              {list.length === 0 ? <Empty>{all.length ? t('lib.noResults') : t('common.none')}</Empty> : (
                <div className="wgrid">
                  {list.map((m) => (
                    <WorkoutCard key={m.id} to={`/training/practice/${m.id}`} title={m.title} category={m.category} coverMediaId={m.cover_media_id}
                      minutes={m.duration_sec ? Math.round(m.duration_sec / 60) : null} level={m.level} equipment={m.equipment}
                      status={recent.has(m.id) ? 'completed' : null} hasVideo={m.hasFile || !!m.external_url} demo={m.is_demo} />
                  ))}
                </div>
              )}
            </>
          );
        }}
      </Async>
    </div>
  );
}

/** Practice details: large video preview, essentials, equipment tags, and an easy start. */
export function PracticeDetail() {
  const { id } = useParams();
  const q = useApi<any>(`/media/${id}`);
  return <Async q={q}>{(m) => <Detail m={m} />}</Async>;
}

function Detail({ m }: { m: any }) {
  const { t } = useI18n();
  const user = useUser();
  const nav = useNavigate();
  const levelLabel = useLevelLabel();
  const hasVideo = m.hasFile || !!m.external_url;
  const [playing, setPlaying] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [minutes, setMinutes] = useState<number | null>(m.duration_sec ? Math.round(m.duration_sec / 60) : null);
  const [difficulty, setDifficulty] = useState<'easy' | 'ok' | 'hard' | ''>('');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<unknown>(null);

  const save = async () => {
    try {
      const r = await POST(`/clients/${user.id}/practice-logs`, { media_id: m.id, date: todayISO(), durationSec: minutes != null ? minutes * 60 : null, completed: true, difficulty: difficulty || null, notes: notes || null });
      nav(`/training/log/${r.id}?done=1`);
    } catch (e) { setErr(e); }
  };

  return (
    <div>
      <div className="preview">
        {playing && hasVideo ? <MediaPlayer media={m} autoPlay /> : (
          <Cover category={m.category} mediaId={m.cover_media_id} scrim>
            {hasVideo ? (
              <button className="bigplay" onClick={() => { setPlaying(true); setFinishing(true); }} aria-label={t('practice.play')}><Icon name="play" size={30} filled /></button>
            ) : <div className="note"><Icon name="video" size={18} /> {t('practice.videoSoon')}</div>}
          </Cover>
        )}
      </div>
      <div className="eyebrow">{m.category ? t(('cat.' + m.category) as StringKey) : t('lib.kind.follow_along')} <DemoBadge show={m.is_demo} /></div>
      <h1>{m.title}</h1>
      <div className="row" style={{ gap: '0.4rem', marginBottom: '0.9rem' }}>
        {m.duration_sec ? <span className="tag"><Icon name="clock" /><bdi>{Math.round(m.duration_sec / 60)} {t('common.min')}</bdi></span> : null}
        {m.level && <span className="tag"><Icon name="level" />{levelLabel(m.level)}</span>}
        {(m.equipment ? m.equipment.split(',') : [t('equip.none')]).map((e: string) => <span key={e} className="tag"><Icon name="equipment" />{e.trim()}</span>)}
        {m.captions_media_id && <span className="tag"><Icon name="captions" />{t('practice.captions')}</span>}
      </div>
      {(m.purpose || m.instructions) && (
        <div className="card">
          <h3>{t('practice.about')}</h3>
          {m.purpose && <p>{m.purpose}</p>}
          {m.instructions && <p className="pre muted">{m.instructions}</p>}
        </div>
      )}
      {finishing ? (
        <div className="card sage stack">
          <Field label={t('training.duration')}><NumInput value={minutes} onChange={setMinutes} /></Field>
          <div>
            <div className="label">{t('training.difficulty')}</div>
            <Seg value={difficulty as any} onChange={(v) => setDifficulty(v as any)} options={(['easy', 'ok', 'hard'] as const).map((k) => ({ value: k, label: t(('diff.' + k) as StringKey) }))} />
          </div>
          <Field label={t('common.notes')}><TextArea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          {!!err && <ErrorBox error={err} />}
          <button className="btn primary big" onClick={save}><Icon name="check" /> {t('practice.done')}</button>
        </div>
      ) : (
        <div className="savebar">
          <button className="btn accent big" onClick={() => { if (hasVideo) setPlaying(true); setFinishing(true); }}><Icon name="play" filled /> {t('practice.start')}</button>
        </div>
      )}
    </div>
  );
}
