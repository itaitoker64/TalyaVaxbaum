import { useState } from 'react';
import { useI18n } from '../i18n/index.tsx';
import { useApi, POST, PUT } from '../api.ts';
import { Modal, Field, Input, TextArea, Select, NumInput, ErrorBox } from '../components/ui.tsx';
import { todayISO } from '../../../shared/dates.ts';
import type { StringKey } from '../i18n/strings.ts';

const KINDS = ['performance', 'mobility', 'adherence', 'body', 'quality', 'other'] as const;

/** Create or revise a goal. Revisions are recorded server-side with the previous values. */
export function GoalForm({ clientId, goal, onClose, onSaved }: { clientId: string; goal?: any; onClose: () => void; onSaved: (id: string) => void }) {
  const { t } = useI18n();
  const exercises = useApi<any[]>('/exercises');
  const [g, setG] = useState<any>(() =>
    goal
      ? { ...goal, conditions: goal.conditions ?? {}, criteriaText: (goal.criteria ?? []).join('\n') }
      : { title: '', description: '', kind: 'performance', metric: '', unit: '', direction: 'increase', baseline_value: null, baseline_date: todayISO(), target_value: null, target_min: null, target_max: null, review_date: '', procedure: '', conditions: {}, criteriaText: '', client_can_record: true, show_on_today: false, status: 'active' },
  );
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<unknown>(null);
  const set = (k: string) => (v: any) => setG({ ...g, [k]: v });
  const setC = (k: string, v: any) => setG({ ...g, conditions: { ...g.conditions, [k]: v === '' || v == null ? undefined : v } });
  const numeric = g.kind !== 'quality';
  const methodChanged = goal && (g.procedure !== goal.procedure || g.unit !== goal.unit || g.metric !== goal.metric || JSON.stringify(g.conditions) !== JSON.stringify(goal.conditions ?? {}));

  const save = async () => {
    setErr(null);
    const ex = exercises.data?.find((e) => e.id === g.conditions.exerciseId);
    const cond = Object.fromEntries(Object.entries({ ...g.conditions, exerciseName: ex?.name }).filter(([, v]) => v !== undefined && v !== ''));
    const body: any = {
      title: g.title, description: g.description || null, kind: g.kind, metric: g.metric || null, unit: g.unit || null, direction: g.direction,
      baseline_value: numeric ? g.baseline_value : null, baseline_date: g.baseline_date || null,
      target_value: g.direction !== 'range' ? g.target_value : null, target_min: g.direction === 'range' ? g.target_min : null, target_max: g.direction === 'range' ? g.target_max : null,
      review_date: g.review_date || null, procedure: g.procedure || null, conditions: Object.keys(cond).length ? cond : null,
      criteria: g.kind === 'quality' ? g.criteriaText.split('\n').map((s: string) => s.trim()).filter(Boolean) : null,
      client_can_record: !!g.client_can_record, show_on_today: !!g.show_on_today, status: g.status,
    };
    try {
      if (goal) {
        await PUT(`/goals/${goal.id}`, { ...body, reason: reason || undefined });
        onSaved(goal.id);
      } else {
        const r = await POST(`/clients/${clientId}/goals`, body);
        onSaved(r.id);
      }
    } catch (e) {
      setErr(e);
    }
  };

  return (
    <Modal title={goal ? t('common.edit') : t('goal.new')} onClose={onClose}>
      <div className="stack">
        <Field label={t('goal.title')}><Input value={g.title} onChange={(e) => set('title')(e.target.value)} /></Field>
        <Field label={t('common.description')}><TextArea value={g.description ?? ''} onChange={(e) => set('description')(e.target.value)} /></Field>
        <div className="grid2">
          <Field label={t('goal.kind')}><Select value={g.kind} onChange={(e) => set('kind')(e.target.value)} disabled={!!goal}>{KINDS.map((k) => <option key={k} value={k}>{t(('kind.' + k) as StringKey)}</option>)}</Select></Field>
          {numeric && <Field label={t('goal.direction')}><Select value={g.direction} onChange={(e) => set('direction')(e.target.value)}>{(['increase', 'decrease', 'range'] as const).map((k) => <option key={k} value={k}>{t(('dir.' + k) as StringKey)}</option>)}</Select></Field>}
        </div>
        {numeric && (
          <div className="grid2">
            <Field label={t('goal.metric')}><Input value={g.metric ?? ''} onChange={(e) => set('metric')(e.target.value)} placeholder="e.g. reps / cm / sessions per week" /></Field>
            <Field label={t('goal.unit')}><Input value={g.unit ?? ''} onChange={(e) => set('unit')(e.target.value)} /></Field>
          </div>
        )}
        {numeric && g.kind !== 'adherence' && (
          <div className="grid2">
            <Field label={t('goal.baselineValue')}><NumInput value={g.baseline_value} onChange={set('baseline_value')} /></Field>
            <Field label={t('goal.baselineDate')}><Input type="date" value={g.baseline_date ?? ''} onChange={(e) => set('baseline_date')(e.target.value)} disabled={!!goal} /></Field>
          </div>
        )}
        {g.kind === 'adherence' && <Field label={t('goal.baselineDate')}><Input type="date" value={g.baseline_date ?? ''} onChange={(e) => set('baseline_date')(e.target.value)} /></Field>}
        {numeric && (g.direction === 'range' ? (
          <div className="grid2">
            <Field label={t('goal.targetMin')}><NumInput value={g.target_min} onChange={set('target_min')} /></Field>
            <Field label={t('goal.targetMax')}><NumInput value={g.target_max} onChange={set('target_max')} /></Field>
          </div>
        ) : <Field label={t('goal.targetValue')}><NumInput value={g.target_value} onChange={set('target_value')} /></Field>)}
        <Field label={t('progress.reviewDate')}><Input type="date" value={g.review_date ?? ''} onChange={(e) => set('review_date')(e.target.value)} /></Field>
        <Field label={t('progress.procedure')}><TextArea value={g.procedure ?? ''} onChange={(e) => set('procedure')(e.target.value)} /></Field>
        {(g.kind === 'performance' || g.kind === 'mobility' || g.kind === 'quality') && (
          <div className="card soft stack">
            <div className="small bold">{t('progress.conditions')}</div>
            <Field label={t('goal.exercise')}>
              <Select value={g.conditions.exerciseId ?? ''} onChange={(e) => setC('exerciseId', e.target.value)}>
                <option value="">{t('lib.none')}</option>
                {(exercises.data ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </Select>
            </Field>
            <div className="grid3">
              <Field label={t('goal.variant')}><Input value={g.conditions.variant ?? ''} onChange={(e) => setC('variant', e.target.value)} /></Field>
              <Field label={t('goal.load')}><NumInput value={g.conditions.load} onChange={(v) => setG({ ...g, conditions: { ...g.conditions, load: v ?? undefined, loadUnit: v != null ? 'kg' : undefined } })} /></Field>
              <Field label={t('goal.side')}><Input value={g.conditions.side ?? ''} onChange={(e) => setC('side', e.target.value)} /></Field>
            </div>
          </div>
        )}
        {g.kind === 'quality' && <Field label={t('goal.criteria')}><TextArea value={g.criteriaText} onChange={(e) => set('criteriaText')(e.target.value)} /></Field>}
        <label className="check"><input type="checkbox" checked={!!g.client_can_record} onChange={(e) => set('client_can_record')(e.target.checked)} /><span>{t('goal.clientCanRecord')}</span></label>
        <label className="check"><input type="checkbox" checked={!!g.show_on_today} onChange={(e) => set('show_on_today')(e.target.checked)} /><span>{t('goal.showOnToday')}</span></label>
        {goal && (
          <>
            <Field label={t('common.status')}><Select value={g.status} onChange={(e) => set('status')(e.target.value)}>{['active', 'achieved', 'paused', 'archived'].map((s) => <option key={s} value={s}>{s}</option>)}</Select></Field>
            {methodChanged && <div className="alert">{t('goal.methodWarning')}</div>}
            <Field label={t('goal.reason')}><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          </>
        )}
        {!!err && <ErrorBox error={err} />}
        <button className="btn primary big" disabled={!g.title} onClick={save}>{t('common.save')}</button>
      </div>
    </Modal>
  );
}
