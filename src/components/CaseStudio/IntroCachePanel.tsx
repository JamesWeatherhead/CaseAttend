/**
 * Author-time intro-cache panel for Case Studio (issue #70).
 *
 * Shown on the "Preview and save" step once a case has been saved locally.
 * Walks the educator through:
 *   1. Auto-generation (BYOK OpenRouter, same prompt as the backfill).
 *   2. Review + optional hand-edit of the draft.
 *   3. Approval with reviewer name + credentials (byte-compatible with the
 *      offline `scripts/introCache/review.mts` contract).
 *
 * Deliberately additive: this panel does not gate saving the case, exporting,
 * or opening the viewer. The runtime falls back to the lesson opening when no
 * approved cache is present, so nothing regresses for authors who skip it.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, RefreshCw, Sparkles, Wand2 } from 'lucide-react';

import type { LearnerLevel } from '../../constants';
import { INTRO_CACHE_LEARNER_LEVELS, type IntroCacheV1 } from '../../core/introCache';
import type { IntroCacheStatus } from '../../services/caseStudioController';

interface IntroCachePanelProps {
  caseId: string;
  status: IntroCacheStatus;
  busy: boolean;
  generate: () => Promise<void>;
  regenerate: () => Promise<void>;
  approve: (reviewer: { name: string; credentials: string }) => Promise<void>;
  saveDraft: (draft: IntroCacheV1) => Promise<void>;
  onConnectOpenRouter?: () => void;
  hasApiKey: boolean;
}

const LEVEL_LABELS: Record<LearnerLevel, string> = {
  highschool: 'High school',
  undergrad: 'Undergrad',
  ms_preclinical: 'Pre-Step 1',
  ms_clinical: 'Post-Step 1',
  resident: 'Resident',
};

function statusHeadline(status: IntroCacheStatus, hasApiKey: boolean): string {
  switch (status.kind) {
    case 'idle':
      return hasApiKey
        ? 'Generate the pre-cached first round so a no-key learner can open this case with a tailored intro and one instant answer per level.'
        : 'Connect an OpenRouter key to generate the pre-cached first round for this case.';
    case 'generating':
      return 'Generating tailored intros and pre-cached answers for all five learner levels...';
    case 'ready-for-review':
      return 'Draft ready. Review each level, hand-edit if needed, then approve to make it available to no-key learners.';
    case 'approved':
      return 'Intro cache approved. A no-key learner will now see per-level intros and instant answers on click.';
    case 'stale':
      return 'The case or its media changed since the intro cache was generated. Regenerate to re-align the cache with the current lesson.';
    case 'error':
      return status.message;
  }
}

function statusTone(status: IntroCacheStatus): 'idle' | 'busy' | 'ready' | 'ok' | 'warn' | 'error' {
  switch (status.kind) {
    case 'idle': return 'idle';
    case 'generating': return 'busy';
    case 'ready-for-review': return 'ready';
    case 'approved': return 'ok';
    case 'stale': return 'warn';
    case 'error': return 'error';
  }
}

const IntroCachePanel: React.FC<IntroCachePanelProps> = ({
  caseId,
  status,
  busy,
  generate,
  regenerate,
  approve,
  saveDraft,
  onConnectOpenRouter,
  hasApiKey,
}) => {
  const activeCache = useMemo<IntroCacheV1 | null>(() => {
    if (status.kind === 'ready-for-review') return status.draft;
    if (status.kind === 'approved') return status.cache;
    if (status.kind === 'stale') return status.cache;
    return null;
  }, [status]);

  const [expanded, setExpanded] = useState<LearnerLevel | null>(() => (
    activeCache ? INTRO_CACHE_LEARNER_LEVELS[0] : null
  ));
  const [reviewerName, setReviewerName] = useState('');
  const [reviewerCredentials, setReviewerCredentials] = useState('');
  const [editingCache, setEditingCache] = useState<IntroCacheV1 | null>(activeCache);
  const [dirty, setDirty] = useState(false);
  const [approving, setApproving] = useState(false);
  const [savingEdits, setSavingEdits] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setEditingCache(activeCache);
    setDirty(false);
    setLocalError(null);
  }, [activeCache]);

  const canEdit = status.kind === 'ready-for-review';
  const canApprove = status.kind === 'ready-for-review'
    && !!editingCache
    && reviewerName.trim().length > 0
    && reviewerCredentials.trim().length > 0
    && !approving
    && !savingEdits;

  const updateLevelField = useCallback(<K extends keyof IntroCacheV1['levels'][LearnerLevel]>(
    level: LearnerLevel,
    field: K,
    value: IntroCacheV1['levels'][LearnerLevel][K],
  ) => {
    setEditingCache((current) => {
      if (!current) return current;
      return {
        ...current,
        levels: {
          ...current.levels,
          [level]: { ...current.levels[level], [field]: value },
        },
      } as IntroCacheV1;
    });
    setDirty(true);
  }, []);

  const updateQuestionField = useCallback((
    level: LearnerLevel,
    questionIndex: number,
    field: 'label' | 'prompt' | 'cachedAnswer',
    value: string,
  ) => {
    setEditingCache((current) => {
      if (!current) return current;
      const nextQuestions = current.levels[level].introQuestions.map((question, index) => (
        index === questionIndex ? { ...question, [field]: value } : question
      ));
      return {
        ...current,
        levels: {
          ...current.levels,
          [level]: { ...current.levels[level], introQuestions: nextQuestions },
        },
      } as IntroCacheV1;
    });
    setDirty(true);
  }, []);

  const handleSaveEdits = useCallback(async () => {
    if (!editingCache) return;
    setLocalError(null);
    setSavingEdits(true);
    try {
      await saveDraft(editingCache);
      setDirty(false);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Could not save your edits.');
    } finally {
      setSavingEdits(false);
    }
  }, [editingCache, saveDraft]);

  const handleApprove = useCallback(async () => {
    if (!editingCache) return;
    setLocalError(null);
    setApproving(true);
    try {
      if (dirty) await saveDraft(editingCache);
      await approve({ name: reviewerName, credentials: reviewerCredentials });
      setDirty(false);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Approval failed.');
    } finally {
      setApproving(false);
    }
  }, [approve, dirty, editingCache, reviewerCredentials, reviewerName, saveDraft]);

  const tone = statusTone(status);
  const headline = statusHeadline(status, hasApiKey);
  const generatingBusy = status.kind === 'generating' || busy;

  return (
    <section className={`case-studio-intro-cache case-studio-intro-cache--${tone}`} aria-labelledby="intro-cache-heading">
      <header className="case-studio-intro-cache__header">
        <div className="case-studio-intro-cache__icon" aria-hidden="true"><Sparkles /></div>
        <div>
          <p className="case-studio-eyebrow">Intro cache · no-key first round</p>
          <h3 id="intro-cache-heading">Pre-cached opening for {caseId}</h3>
          <p>{headline}</p>
        </div>
        <div className="case-studio-intro-cache__actions">
          {status.kind === 'idle' && (
            hasApiKey
              ? (
                <button
                  type="button"
                  className="case-studio-button primary"
                  disabled={generatingBusy}
                  onClick={() => { void generate(); }}
                >
                  <Wand2 aria-hidden="true" /> Generate intro cache
                </button>
              )
              : onConnectOpenRouter && (
                <button
                  type="button"
                  className="case-studio-button primary"
                  onClick={onConnectOpenRouter}
                >
                  Connect OpenRouter
                </button>
              )
          )}
          {(status.kind === 'stale' || status.kind === 'error') && (
            <button
              type="button"
              className="case-studio-button primary"
              disabled={generatingBusy || (status.kind === 'error' && !status.retryable)}
              onClick={() => { void regenerate(); }}
            >
              <RefreshCw aria-hidden="true" /> Regenerate
            </button>
          )}
          {(status.kind === 'approved' || status.kind === 'ready-for-review') && (
            <button
              type="button"
              className="case-studio-button secondary"
              disabled={generatingBusy}
              onClick={() => { void regenerate(); }}
            >
              <RefreshCw aria-hidden="true" /> Regenerate
            </button>
          )}
        </div>
      </header>

      {localError && (
        <div className="case-studio-intro-cache__error" role="alert">{localError}</div>
      )}

      {editingCache && (
        <>
          <div className="case-studio-intro-cache__provenance">
            <span><strong>Model:</strong> {editingCache.provenance.modelId}</span>
            <span><strong>Generated:</strong> {editingCache.provenance.generatedAt}</span>
            <span><strong>Lesson SHA:</strong> {editingCache.lessonPlanSha256.slice(0, 12)}…</span>
            <span><strong>Media SHA:</strong> {editingCache.provenance.mediaSha.slice(0, 12)}…</span>
          </div>

          <div className="case-studio-intro-cache__levels" role="group" aria-label="Per-learner-level intros">
            {INTRO_CACHE_LEARNER_LEVELS.map((level) => {
              const entry = editingCache.levels[level];
              const isOpen = expanded === level;
              return (
                <details
                  key={level}
                  className="case-studio-intro-cache__level"
                  open={isOpen}
                  onToggle={(event) => {
                    if ((event.target as HTMLDetailsElement).open) setExpanded(level);
                    else if (expanded === level) setExpanded(null);
                  }}
                >
                  <summary>
                    <span>{LEVEL_LABELS[level]}</span>
                    <small>{entry.introQuestions.length} pre-cached question{entry.introQuestions.length === 1 ? '' : 's'}</small>
                  </summary>
                  <div className="case-studio-intro-cache__level-body">
                    <label>
                      <span>Intro prompt (Markdown)</span>
                      <textarea
                        className="case-studio-input"
                        rows={4}
                        value={entry.introPrompt}
                        disabled={!canEdit}
                        onChange={(event) => updateLevelField(level, 'introPrompt', event.target.value)}
                      />
                    </label>
                    <ol className="case-studio-intro-cache__questions">
                      {entry.introQuestions.map((question, index) => (
                        <li key={question.id}>
                          <div className="case-studio-intro-cache__question">
                            <p><strong>{question.id}</strong></p>
                            <label>
                              <span>Chip label</span>
                              <input
                                className="case-studio-input"
                                value={question.label}
                                disabled={!canEdit}
                                onChange={(event) => updateQuestionField(level, index, 'label', event.target.value)}
                              />
                            </label>
                            <label>
                              <span>Prompt (what would be sent live)</span>
                              <textarea
                                className="case-studio-input"
                                rows={2}
                                value={question.prompt}
                                disabled={!canEdit}
                                onChange={(event) => updateQuestionField(level, index, 'prompt', event.target.value)}
                              />
                            </label>
                            <label>
                              <span>Cached answer (must end with the safety footer)</span>
                              <textarea
                                className="case-studio-input"
                                rows={6}
                                value={question.cachedAnswer}
                                disabled={!canEdit}
                                onChange={(event) => updateQuestionField(level, index, 'cachedAnswer', event.target.value)}
                              />
                            </label>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                </details>
              );
            })}
          </div>

          {status.kind === 'ready-for-review' && (
            <div className="case-studio-intro-cache__review">
              <h4>Approve this draft</h4>
              <p>
                Your name and credentials will be stamped as the reviewer, exactly as the
                shipped-corpus review script records them. The artifact schema requires an
                approved review before it ships to a learner.
              </p>
              <div className="case-studio-field-grid">
                <label className="case-studio-field">
                  <span>Reviewer name</span>
                  <input
                    className="case-studio-input"
                    value={reviewerName}
                    onChange={(event) => setReviewerName(event.target.value)}
                  />
                </label>
                <label className="case-studio-field">
                  <span>Credentials</span>
                  <input
                    className="case-studio-input"
                    value={reviewerCredentials}
                    onChange={(event) => setReviewerCredentials(event.target.value)}
                    placeholder="e.g. MD, PhD candidate"
                  />
                </label>
              </div>
              <div className="case-studio-intro-cache__review-actions">
                <button
                  type="button"
                  className="case-studio-button secondary"
                  disabled={!dirty || savingEdits || !editingCache}
                  onClick={() => { void handleSaveEdits(); }}
                >
                  Save edits
                </button>
                <button
                  type="button"
                  className="case-studio-button primary"
                  disabled={!canApprove}
                  onClick={() => { void handleApprove(); }}
                >
                  <Check aria-hidden="true" /> Approve intro cache
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default IntroCachePanel;
