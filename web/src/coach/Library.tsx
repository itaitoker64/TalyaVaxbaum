import { useState } from 'react';
import { useI18n } from '../i18n/index.tsx';
import { useApi, POST, PUT } from '../api.ts';
import { Async, Field, Input, TextArea, Select, NumInput, Seg, Modal, ErrorBox, Empty, DemoBadge } from '../components/ui.tsx';
import { Uploader, VideoButton } from '../components/media.tsx';
import { CATEGORIES, LOG_TYPES } from '../../../shared/types.ts';
import type { StringKey } from '../i18n/strings.ts';

export function Library() {
  const { t } = useI18n();
  const [tab, setTab] = useState<'exercises' | 'videos' | 'foods'>('exercises');
  return (
    <div>
      <div className="row between"><h1>{t('coach.library')}</h1>
        <Seg value={tab} onChange={setTab} options={[{ value: 'exercises', label: t('lib.exercises') }, { value: 'videos', label: t('lib.videos') }, { value: 'foods', label: t('lib.foods') }]} />
      </div>
      {tab === 'exercises' && <Exercises />}
      {tab === 'videos' && <Videos />}
      {tab === 'foods' && <Foods />}
    </div>
  );
}

function Exercises() {
  const { t } = useI18n();
  const q = useApi<any[]>('/exercises');
  const media = useApi<any[]>('/media');
  const [edit, setEdit] = useState<any>(null);
  const [cat, setCat] = useState('');
  return (
    <div>
      <div className="row" style={{ marginBottom: '0.75rem' }}>
        <button className="btn primary" onClick={() => setEdit({ name: '', category: 'strength', log_type: 'strength', alternatives: [] })}>{t('lib.newExercise')}</button>
        <Select value={cat} onChange={(e) => setCat(e.target.value)} style={{ width: 'auto' }}><option value="">{t('common.all')}</option>{CATEGORIES.map((c) => <option key={c} value={c}>{t(('cat.' + c) as StringKey)}</option>)}</Select>
      </div>
      <Async q={q}>
        {(list) => list.length === 0 ? <Empty>{t('common.none')}</Empty> : (
          <div className="card">
            <ul className="list">
              {list.filter((e) => !cat || e.category === cat).map((e) => (
                <li key={e.id} className="row between" style={{ opacity: e.archived ? 0.55 : 1 }}>
                  <div className="grow">
                    <div className="bold">{e.name} <DemoBadge show={e.is_demo} /></div>
                    <div className="tiny muted">{t(('cat.' + e.category) as StringKey)} · {t(('logtype.' + e.log_type) as StringKey)}{e.alternatives.length ? ` · ${t('lib.alternatives')}: ${e.alternatives.map((a: any) => a.name).join(', ')}` : ''}{e.archived ? ` · ${t('lib.archived')}` : ''}</div>
                  </div>
                  <button className="btn small" onClick={() => setEdit(e)}>{t('common.edit')}</button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Async>
      {edit && <ExerciseForm ex={edit} all={q.data ?? []} media={media.data ?? []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); q.reload(); }} />}
    </div>
  );
}

function ExerciseForm({ ex, all, media, onClose, onSaved }: { ex: any; all: any[]; media: any[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const [e, setE] = useState<any>({ ...ex, alternatives: ex.alternatives ?? [] });
  const [err, setErr] = useState<unknown>(null);
  const set = (k: string) => (ev: { target: { value: string } }) => setE({ ...e, [k]: ev.target.value });
  const fields = ['purpose', 'prerequisites', 'starting_prescription', 'cues', 'progression_criteria'] as const;
  const labels: Record<string, StringKey> = { purpose: 'training.purpose', prerequisites: 'lib.prerequisites', starting_prescription: 'lib.startingPrescription', cues: 'training.cues', progression_criteria: 'lib.progression' };
  const ready = media.filter((m) => m.status === 'ready');
  const save = async () => {
    const body = {
      name: e.name, category: e.category, log_type: e.log_type, equipment: e.equipment || null, level: e.level || null,
      ...Object.fromEntries(fields.map((f) => [f, e[f] || null])),
      demo_media_id: e.demo_media_id || null, practice_media_id: e.practice_media_id || null,
      alternatives: e.alternatives.map((a: any) => ({ id: a.id, note: a.note ?? null })), archived: !!e.archived,
    };
    try {
      if (ex.id) await PUT(`/exercises/${ex.id}`, body);
      else await POST('/exercises', body);
      onSaved();
    } catch (er) { setErr(er); }
  };
  return (
    <Modal title={ex.id ? ex.name : t('lib.newExercise')} onClose={onClose}>
      <div className="stack">
        <Field label={t('common.name')}><Input value={e.name} onChange={set('name')} /></Field>
        <div className="grid2">
          <Field label={t('lib.category')}><Select value={e.category} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c} value={c}>{t(('cat.' + c) as StringKey)}</option>)}</Select></Field>
          <Field label={t('lib.logType')}><Select value={e.log_type} onChange={set('log_type')}>{LOG_TYPES.map((c) => <option key={c} value={c}>{t(('logtype.' + c) as StringKey)}</option>)}</Select></Field>
          <Field label={t('lib.equipment')}><Input value={e.equipment ?? ''} onChange={set('equipment')} /></Field>
          <Field label={t('lib.level')}><Input value={e.level ?? ''} onChange={set('level')} /></Field>
        </div>
        {fields.map((f) => <Field key={f} label={t(labels[f])}><TextArea value={e[f] ?? ''} onChange={set(f)} style={{ minHeight: 60 }} /></Field>)}
        <div className="grid2">
          <Field label={t('lib.demoVideo')}><Select value={e.demo_media_id ?? ''} onChange={set('demo_media_id')}><option value="">{t('lib.none')}</option>{ready.filter((m) => m.kind === 'demo').map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}</Select></Field>
          <Field label={t('lib.practiceVideo')}><Select value={e.practice_media_id ?? ''} onChange={set('practice_media_id')}><option value="">{t('lib.none')}</option>{ready.filter((m) => m.kind === 'follow_along').map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}</Select></Field>
        </div>
        <Field label={t('lib.alternatives')}>
          <div className="stack">
            {e.alternatives.map((a: any, i: number) => (
              <div key={a.id} className="row nowrap">
                <span className="grow">{all.find((x) => x.id === a.id)?.name ?? a.name}</span>
                <Input placeholder={t('common.notes')} value={a.note ?? ''} onChange={(ev) => setE({ ...e, alternatives: e.alternatives.map((x: any, j: number) => (j === i ? { ...x, note: ev.target.value } : x)) })} style={{ flex: 1 }} />
                <button className="btn small ghost" onClick={() => setE({ ...e, alternatives: e.alternatives.filter((_: any, j: number) => j !== i) })}>✕</button>
              </div>
            ))}
            <Select value="" onChange={(ev) => ev.target.value && setE({ ...e, alternatives: [...e.alternatives, { id: ev.target.value, note: '' }] })}>
              <option value="">+ {t('lib.alternatives')}</option>
              {all.filter((x) => x.id !== ex.id && !x.archived && !e.alternatives.some((a: any) => a.id === x.id)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </Select>
          </div>
        </Field>
        {ex.id && <label className="check"><input type="checkbox" checked={!!e.archived} onChange={(ev) => setE({ ...e, archived: ev.target.checked })} /><span>{t('lib.archive')}</span></label>}
        {!!err && <ErrorBox error={err} />}
        <button className="btn primary big" disabled={!e.name} onClick={save}>{t('common.save')}</button>
      </div>
    </Modal>
  );
}

function Videos() {
  const { t } = useI18n();
  const q = useApi<any[]>('/media');
  const [meta, setMeta] = useState({ kind: 'demo', title: '', purpose: '', duration_sec: null as number | null, equipment: '', level: '', instructions: '', external_url: '' });
  const [err, setErr] = useState<unknown>(null);
  const [key, setKey] = useState(0);
  const metaBody = { ...meta, purpose: meta.purpose || null, equipment: meta.equipment || null, level: meta.level || null, instructions: meta.instructions || null, external_url: undefined };
  return (
    <div className="grid2">
      <div className="card stack">
        <h3>{t('lib.newVideo')}</h3>
        <p className="tiny muted">{t('lib.reuse')}</p>
        <Seg value={meta.kind} onChange={(kind) => setMeta({ ...meta, kind })} options={(['demo', 'follow_along', 'recipe', 'other'] as const).map((k) => ({ value: k, label: t(('lib.kind.' + k) as StringKey) }))} />
        <Field label={t('goal.title')}><Input value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} /></Field>
        <Field label={t('training.purpose')}><Input value={meta.purpose} onChange={(e) => setMeta({ ...meta, purpose: e.target.value })} /></Field>
        <div className="grid3">
          <Field label={t('lib.durationSec')}><NumInput value={meta.duration_sec} onChange={(v) => setMeta({ ...meta, duration_sec: v })} /></Field>
          <Field label={t('lib.equipment')}><Input value={meta.equipment} onChange={(e) => setMeta({ ...meta, equipment: e.target.value })} /></Field>
          <Field label={t('lib.level')}><Input value={meta.level} onChange={(e) => setMeta({ ...meta, level: e.target.value })} /></Field>
        </div>
        <Field label={t('nutrition.instructions')}><TextArea value={meta.instructions} onChange={(e) => setMeta({ ...meta, instructions: e.target.value })} /></Field>
        <Uploader key={key} createPath="/media" meta={metaBody} accept={meta.kind === 'recipe' ? 'image/*,video/*' : 'video/*,image/*'} label={t('lib.file')} onDone={() => { setKey(key + 1); setMeta({ ...meta, title: '' }); q.reload(); }} />
        <Field label={t('lib.externalUrl')}><Input type="url" value={meta.external_url} onChange={(e) => setMeta({ ...meta, external_url: e.target.value })} placeholder="https://" /></Field>
        <button className="btn" disabled={!meta.title || !meta.external_url.startsWith('https://')} onClick={async () => { try { await POST('/media', { ...metaBody, external_url: meta.external_url }); setMeta({ ...meta, title: '', external_url: '' }); q.reload(); } catch (e) { setErr(e); } }}>{t('common.save')}</button>
        {!!err && <ErrorBox error={err} />}
      </div>
      <Async q={q}>
        {(list) => list.length === 0 ? <Empty>{t('common.none')}</Empty> : (
          <div className="card">
            <ul className="list">
              {list.map((m) => (
                <li key={m.id} className="row between">
                  <div className="grow"><div>{m.title} <DemoBadge show={m.is_demo} /></div><div className="tiny muted">{t(('lib.kind.' + m.kind) as StringKey)}{m.status !== 'ready' ? ` · ${t(m.status === 'failed' ? 'lib.statusFailed' : 'lib.statusUploading')}` : ''}</div></div>
                  {m.status === 'ready' && <VideoButton media={m} label={t('common.open')} />}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Async>
    </div>
  );
}

function Foods() {
  const { t, fmtNum } = useI18n();
  const [search, setSearch] = useState('');
  const q = useApi<any[]>(`/foods?q=${encodeURIComponent(search)}`);
  const [f, setF] = useState<any>({ name: '', brand: '', kcal: null, protein: null, carbs: null, fat: null, serving_g: null, serving_label: '', source: 'label', source_ref: '' });
  const [err, setErr] = useState<unknown>(null);
  return (
    <div className="grid2">
      <div className="card stack">
        <h3>{t('nutrition.newFood')}</h3>
        <Field label={t('common.name')}><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Brand"><Input value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })} /></Field>
        <div className="small muted">{t('nutrition.per100')}</div>
        <div className="grid3">
          {(['kcal', 'protein', 'carbs', 'fat'] as const).map((k) => <Field key={k} label={t(('nutrition.' + k) as StringKey)}><NumInput value={f[k]} onChange={(v) => setF({ ...f, [k]: v })} /></Field>)}
          <Field label={t('nutrition.servingSize')}><NumInput value={f.serving_g} onChange={(v) => setF({ ...f, serving_g: v })} /></Field>
        </div>
        <Field label="Source"><Select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}><option value="label">{t('nutrition.source.label')}</option><option value="database">database</option><option value="custom">custom</option></Select></Field>
        {f.source === 'database' && <Field label="Reference"><Input value={f.source_ref} onChange={(e) => setF({ ...f, source_ref: e.target.value })} /></Field>}
        {!!err && <ErrorBox error={err} />}
        <button className="btn primary" disabled={!f.name || f.kcal == null} onClick={async () => { try { await POST('/foods', { ...f, brand: f.brand || null, serving_label: f.serving_label || null, source_ref: f.source_ref || null }); setF({ ...f, name: '', brand: '', kcal: null, protein: null, carbs: null, fat: null }); q.reload(); } catch (e) { setErr(e); } }}>{t('common.save')}</button>
      </div>
      <div>
        <Input placeholder={t('common.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <Async q={q}>
          {(list) => (
            <div className="card" style={{ marginTop: 8 }}>
              <table className="table">
                <thead><tr><th>{t('common.name')}</th><th>kcal</th><th>P</th><th>C</th><th>F</th></tr></thead>
                <tbody>{list.map((x) => <tr key={x.id}><td>{x.name} <DemoBadge show={x.is_demo} />{x.source === 'demo' && <div className="tiny muted">{t('nutrition.source.demo')}</div>}</td><td className="num">{fmtNum(x.kcal, 0)}</td><td className="num">{fmtNum(x.protein)}</td><td className="num">{fmtNum(x.carbs)}</td><td className="num">{fmtNum(x.fat)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </Async>
      </div>
    </div>
  );
}
