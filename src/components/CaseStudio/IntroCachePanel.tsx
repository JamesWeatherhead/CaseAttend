/**
 * Author-time intro-cache panel for Case Studio (issue #70).
 *
 * Shown on the "Preview and save" step once a case has been saved locally.
 * Walks the educator through:
 *   1. Optional generation requested by the educator (BYOK OpenRouter, same prompt as the backfill).
 *   2. Review + optional hand-edit of the draft.
 *   3. Approval with reviewer name + credentials (byte-compatible with the
 *      offline `scripts/introCache/review.mts` contract).
 *
 * Deliberately additive: this panel does not gate saving the case, exporting,
 * or opening the viewer. The runtime falls back to the lesson opening when no
 * approved cache is present, so nothing regresses for authors who skip it.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, RefreshCw, Sparkles, Wand2 } from 'lucide-react';

import { INTRO_CACHE_LEARNER_LEVELS, type IntroCacheV1, type IntroCacheLearnerLevel as LearnerLevel } from '../../core/introCache';
import type { IntroCacheStatus } from '../../services/caseStudioController';

interface IntroCachePanelProps {
  caseId: string;
  status: IntroCacheStatus;
  busy: boolean;
  generate: () => Promise<void>;
  regenerate: () => Promise<void>;
  approve: (reviewer: { name: string; credentials: string }) => Promise<void>;
  saveDraft: (draft: IntroCacheV1) => Promise<void>;
  onReviewBusyChange?: (busy: boolean) => void;
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
        ? 'Create opening questions and answers for five learner levels. After your review, learners can try them without an AI account.'
        : 'Your case is ready to use. Connect OpenRouter only if you want AI-drafted starter questions and answers.';
    case 'generating':
      return 'Creating draft questions and answers for five learner levels…';
    case 'ready-for-review':
      return 'Draft ready. Review every level, edit as needed, then approve the answers for learners.';
    case 'approved':
      return 'Starter answers approved. Learners can now use them without an AI account.';
    case 'stale':
      return 'The case or lesson has changed. Generate and review fresh answers before learners use them.';
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
  onReviewBusyChange,
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
  const incomingKey = JSON.stringify(activeCache);
  const [acceptedKey, setAcceptedKey] = useState(incomingKey);
  const [refreshConflict, setRefreshConflict] = useState(false);
  const mountedRef = useRef(true);
  const reviewOperationRef = useRef<symbol | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (reviewOperationRef.current) onReviewBusyChange?.(false);
      reviewOperationRef.current = null;
    };
  }, [onReviewBusyChange]);

  useEffect(() => {
    if (incomingKey === acceptedKey) return;
    if (dirty && JSON.stringify(editingCache) !== incomingKey) {
      setRefreshConflict(true);
      return;
    }
    setEditingCache(activeCache);
    setAcceptedKey(incomingKey);
    setDirty(false);
    setRefreshConflict(false);
    setLocalError(null);
  }, [activeCache, incomingKey, acceptedKey, dirty, editingCache]);

  const canEdit = status.kind === 'ready-for-review' && !busy && !approving && !savingEdits;
  const canApprove = status.kind === 'ready-for-review'
    && !!editingCache
    && reviewerName.trim().length > 0
    && reviewerCredentials.trim().length > 0
    && !approving
    && !savingEdits
    && !busy
    && !refreshConflict;

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
    if (!editingCache || busy || refreshConflict || reviewOperationRef.current) return;
    const operation = Symbol('save-edits');
    reviewOperationRef.current = operation;
    onReviewBusyChange?.(true);
    setLocalError(null);
    setSavingEdits(true);
    try {
      await saveDraft(editingCache);
      if (!mountedRef.current || reviewOperationRef.current !== operation) return;
      setDirty(false);
    } catch (error) {
      if (mountedRef.current) setLocalError(error instanceof Error ? error.message : 'Could not save your edits.');
    } finally {
      if (reviewOperationRef.current === operation) {
        reviewOperationRef.current = null;
        onReviewBusyChange?.(false);
        if (mountedRef.current) setSavingEdits(false);
      }
    }
  }, [busy, editingCache, onReviewBusyChange, refreshConflict, saveDraft]);

  const handleApprove = useCallback(async () => {
    if (!canApprove || !editingCache || reviewOperationRef.current) return;
    const operation = Symbol('approve');
    reviewOperationRef.current = operation;
    onReviewBusyChange?.(true);
    setLocalError(null);
    setApproving(true);
    try {
      if (dirty) await saveDraft(editingCache);
      if (!mountedRef.current || reviewOperationRef.current !== operation) return;
      await approve({ name: reviewerName, credentials: reviewerCredentials });
      if (!mountedRef.current || reviewOperationRef.current !== operation) return;
      setDirty(false);
    } catch (error) {
      if (mountedRef.current) setLocalError(error instanceof Error ? error.message : 'Approval failed.');
    } finally {
      if (reviewOperationRef.current === operation) {
        reviewOperationRef.current = null;
        onReviewBusyChange?.(false);
        if (mountedRef.current) setApproving(false);
      }
    }
  }, [approve, canApprove, dirty, editingCache, onReviewBusyChange, reviewerCredentials, reviewerName, saveDraft]);

  const tone = statusTone(status);
  const headline = statusHeadline(status, hasApiKey);
  const reviewingBusy = approving || savingEdits;
  const generatingBusy = status.kind === 'generating' || busy;

  return (
    <section className={`case-studio-intro-cache case-studio-intro-cache--${tone}`} aria-labelledby="intro-cache-heading" data-case-id={caseId}>
      <header className="case-studio-intro-cache__header">
        <div className="case-studio-intro-cache__icon" aria-hidden="true"><Sparkles /></div>
        <div>
          <p className="case-studio-eyebrow">Optional AI assistance</p>
          <h3 id="intro-cache-heading">Create starter questions</h3>
          <p role="status">{headline}</p>
        </div>
        <div className="case-studio-intro-cache__actions">
          <p id="intro-generation-disclosure">Generating sends this case’s text and selected images to OpenRouter and your chosen model provider. Model charges may apply. Review and approve the answers before learners use them.</p>
          {dirty && !refreshConflict && <p>Save your edits before generating another draft.</p>}
          {status.kind !== 'generating' && (hasApiKey ? (
            <button type="button" className="case-studio-button secondary"
              aria-describedby="intro-generation-disclosure"
              disabled={generatingBusy || reviewingBusy || dirty || refreshConflict || (status.kind === 'error' && !status.retryable)}
              onClick={() => { void (status.kind === 'idle' ? generate() : regenerate()); }}>
              {status.kind === 'idle' ? <Wand2 aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
              {status.kind === 'idle' ? 'Generate draft answers' : 'Regenerate draft answers'}
            </button>
          ) : onConnectOpenRouter && (
            <button type="button" className="case-studio-button secondary" disabled={reviewingBusy || generatingBusy} onClick={onConnectOpenRouter}>Connect OpenRouter</button>
          ))}
        </div>
      </header>

      {localError && (
        <div className="case-studio-intro-cache__error" role="alert">{localError}</div>
      )}

      {refreshConflict && (
        <div className="case-studio-intro-cache__error" role="alert">
          <p>Stored answers changed while you were editing. Your edits are still shown. Copy anything you want to keep, then load the latest answers before saving or approving.</p>
          <button type="button" className="case-studio-button secondary" disabled={reviewingBusy || generatingBusy}
            onClick={() => {
              setEditingCache(activeCache);
              setAcceptedKey(incomingKey);
              setDirty(false);
              setRefreshConflict(false);
              setLocalError(null);
            }}>Load latest answers</button>
        </div>
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
                    <small>{entry.introQuestions.length} starter question{entry.introQuestions.length === 1 ? '' : 's'}</small>
                  </summary>
                  <div className="case-studio-intro-cache__level-body">
                    <label>
                      <span>Opening question</span>
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
                              <span>Question button label</span>
                              <input
                                className="case-studio-input"
                                value={question.label}
                                disabled={!canEdit}
                                onChange={(event) => updateQuestionField(level, index, 'label', event.target.value)}
                              />
                            </label>
                            <label>
                              <span>Learner question</span>
                              <textarea
                                className="case-studio-input"
                                rows={2}
                                value={question.prompt}
                                disabled={!canEdit}
                                onChange={(event) => updateQuestionField(level, index, 'prompt', event.target.value)}
                              />
                            </label>
                            <label>
                              <span>Starter answer (keep the educational-use footer)</span>
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
                Review all five levels for accuracy and teaching quality. Your name and credentials will be recorded with your approval. Learners cannot use these answers until you approve them.
              </p>
              <div className="case-studio-field-grid">
                <label className="case-studio-field">
                  <span>Reviewer name</span>
                  <input
                    className="case-studio-input"
                    value={reviewerName}
                    disabled={reviewingBusy || generatingBusy}
                    onChange={(event) => setReviewerName(event.target.value)}
                  />
                </label>
                <label className="case-studio-field">
                  <span>Credentials</span>
                  <input
                    className="case-studio-input"
                    value={reviewerCredentials}
                    disabled={reviewingBusy || generatingBusy}
                    onChange={(event) => setReviewerCredentials(event.target.value)}
                    placeholder="e.g. MD, PhD candidate"
                  />
                </label>
              </div>
              <div className="case-studio-intro-cache__review-actions">
                <button
                  type="button"
                  className="case-studio-button secondary"
                  disabled={!dirty || savingEdits || approving || busy || refreshConflict || !editingCache}
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
                  <Check aria-hidden="true" /> Approve starter answers
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
