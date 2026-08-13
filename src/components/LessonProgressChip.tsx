import React from 'react';
import type { LessonProgress } from '../core/lessonTurnBudget';

interface LessonProgressChipProps {
  progress: LessonProgress | null;
  /**
   * When false the chip renders nothing. Kept as an explicit prop so the
   * parent can drive it from the SHOW_TURN_BUDGET_CHIP constant, an educator
   * setting, or a study-condition flag without duplicating that logic here.
   */
  visible: boolean;
}

const LessonProgressChip: React.FC<LessonProgressChipProps> = ({ progress, visible }) => {
  if (!visible || !progress || progress.objectivesTotal === 0) return null;
  const remaining = Math.max(0, progress.turnBudget - progress.turnsUsed);
  const label = progress.completed
    ? progress.completionReason === 'objectives_met'
      ? 'Lesson complete'
      : 'Wrapping up'
    : `${remaining} of ${progress.turnBudget} exchanges left`;
  return (
    <span
      role="status"
      aria-live="polite"
      className="lesson-progress-chip"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 11,
        lineHeight: '16px',
        color: 'var(--muted-fg, #64748b)',
        background: 'var(--muted-bg, rgba(148, 163, 184, 0.12))',
        border: '1px solid var(--muted-border, rgba(148, 163, 184, 0.3))',
      }}
    >
      {label}
    </span>
  );
};

export default LessonProgressChip;
