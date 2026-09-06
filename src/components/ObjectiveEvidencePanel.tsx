import { useState } from 'react';
import type { LessonObjective } from '../core/lessonPlan';
import type { EvidenceRow } from '../hooks/useGuidedPractice';

const STATUS_LABELS: Record<EvidenceRow['status'], string> = {
  observed: 'Evidence observed', partial: 'Partial', not_observed: 'Not yet observed',
  needs_review: 'Needs review', not_assessed: 'Not assessed',
};

export default function ObjectiveEvidencePanel({ objectives, rows, assessing, unavailable, checksEnabled, onChecksEnabledChange, busy, evaluatorModelLabel, practiceComplete }: {
  objectives: readonly LessonObjective[];
  rows: Readonly<Record<string, EvidenceRow>>;
  assessing: boolean;
  unavailable: boolean;
  checksEnabled: boolean;
  onChecksEnabledChange: (enabled: boolean) => void;
  busy: boolean;
  evaluatorModelLabel: string;
  practiceComplete: boolean;
}) {
  const [expanded, setExpanded] = useState(() => typeof window !== 'undefined'
    && typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 64rem)').matches);
  return <aside className="ca-objective-evidence" aria-label="Objective evidence">
    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs font-medium text-slate-200">
      <input type="checkbox" checked={checksEnabled} onChange={event => onChecksEnabledChange(event.target.checked)} disabled={busy}
        className="h-4 w-4 accent-blue-400 focus-visible:outline-2 focus-visible:outline-blue-300" />
      Check objective evidence
    </label>
    <p className="text-xs leading-relaxed text-slate-400">Uses a separate paid model ({evaluatorModelLabel}) through your OpenRouter balance, even with a free tutor model.</p>
    {!checksEnabled && <p className="mt-1 text-xs text-slate-300">Checks are off. New attempts are not assessed; coaching continues.</p>}
    <div role="status" className="text-xs leading-relaxed text-slate-300">
      {assessing ? 'Checking your submitted attempt…' : unavailable ? 'This attempt could not be assessed. No new evidence was credited.' : ''}
    </div>
    <details open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
      <summary className="min-h-11 cursor-pointer py-2 font-semibold text-blue-100 focus-visible:outline-2 focus-visible:outline-blue-300">
        Objective evidence <span className="text-xs font-normal text-slate-400">({objectives.length})</span>
      </summary>
      <p className="mb-3 text-xs leading-relaxed text-slate-400">Formative evidence from your attempts, not mastery. Objective numbers keep the answer key private. Evidence stays in this conversation.</p>
      {practiceComplete && <p className="mb-3 text-xs leading-relaxed text-emerald-200">Practice complete for this level: evidence was observed for each objective. Assisted practice counts; independent retention has not been established.</p>}
      <ol className="space-y-3">
        {objectives.map((objective, index) => {
          const row = rows[objective.id];
          return <li key={objective.id} className="rounded-lg border border-white/10 bg-[#111923] p-3">
            <h3 className="text-sm font-medium text-slate-100">Objective {index + 1}</h3>
            <p className={`mt-1 text-xs ${row?.status === 'observed' ? 'text-emerald-200' : 'text-slate-300'}`}>{row ? STATUS_LABELS[row.status] : 'Not yet observed'}</p>
            {row && <p className="mt-1 text-xs text-slate-400">Turn {row.turnNumber} · {row.assistance === 'none' ? 'Before help in this visit' : row.assistance === 'hint' ? 'After a hint' : 'After tutor feedback'}</p>}
            {row?.quote && <blockquote className="mt-2 border-l-2 border-blue-400/30 pl-2 text-xs leading-relaxed text-slate-200 [overflow-wrap:anywhere]">“{row.quote}”</blockquote>}
          </li>;
        })}
      </ol>
      <p className="mt-3 text-xs leading-relaxed text-slate-400">Practice after help is marked as assisted. A different case is needed to check transfer; this view does not establish durable retention.</p>
    </details>
  </aside>;
}
