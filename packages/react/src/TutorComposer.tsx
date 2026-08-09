import { useId, useRef, useState, type FormEvent } from 'react';
import type {
  ArtifactReference,
  CaseAttendEngine,
  CaseMaterial,
  LearnerLevel,
  RunTurnResult,
  TeachingMode,
} from '@caseattend/core';

export interface TutorComposerLabels {
  readonly heading: string;
  readonly messageLabel: string;
  readonly messageInstructions: string;
  readonly messagePlaceholder: string;
  readonly send: string;
  readonly sending: string;
  readonly clear: string;
  readonly currentView: string;
  readonly learner: string;
  readonly tutor: string;
  readonly conversation: string;
  readonly readyStatus: string;
  readonly workingStatus: string;
  readonly successStatus: string;
  readonly emptyMessageError: string;
  readonly captureError: string;
  readonly requestError: string;
}

export interface TutorComposerTurn {
  readonly turnId: string;
  readonly learnerMessage: string;
  readonly tutorResponse: string;
  readonly artifactLabel: string;
  readonly result: RunTurnResult;
}

type TutorEngine = Pick<CaseAttendEngine, 'runTurn'>;

export interface TutorComposerProps {
  readonly engine: TutorEngine;
  readonly material: CaseMaterial;
  /**
   * Called synchronously from the native form submit path. The host must take
   * its current-view snapshot before returning the reference that its injected
   * ArtifactLoader resolves. The composer never captures in an effect.
   */
  readonly captureCurrentView: () => ArtifactReference | null;
  readonly lessonId?: string;
  readonly learnerLevel?: LearnerLevel;
  readonly mode?: TeachingMode;
  readonly labels?: Partial<TutorComposerLabels>;
  readonly onTurnComplete?: (turn: TutorComposerTurn) => void;
  readonly maxMessageLength?: number;
  readonly className?: string;
}

const DEFAULT_LABELS: TutorComposerLabels = Object.freeze({
  heading: 'Ask the visual tutor',
  messageLabel: 'Your observation or question',
  messageInstructions: 'The current visual view is captured only when you send this message.',
  messagePlaceholder: 'Describe what you notice, or ask for one guided hint.',
  send: 'Send with current view',
  sending: 'Sending current view',
  clear: 'Clear conversation',
  currentView: 'Current view',
  learner: 'You',
  tutor: 'Tutor',
  conversation: 'Tutor conversation',
  readyStatus: 'Ready for a question.',
  workingStatus: 'Preparing the current view and tutor response.',
  successStatus: 'Tutor response received.',
  emptyMessageError: 'Enter an observation or question before sending.',
  captureError: 'The current view could not be captured. Keep the case open and try again.',
  requestError: 'The tutor could not complete this request. Try again.',
});

function safeErrorMessage(error: unknown, labels: TutorComposerLabels): string {
  // Never render an arbitrary adapter/provider error. It can contain a URL,
  // payload fragment, or credential even when the engine contract does not.
  void error;
  return labels.requestError;
}

export function TutorComposer({
  engine,
  material,
  captureCurrentView,
  lessonId,
  learnerLevel = 'general',
  mode = 'chat',
  labels: labelOverrides,
  onTurnComplete,
  maxMessageLength = 4_000,
  className = '',
}: TutorComposerProps) {
  const labels = { ...DEFAULT_LABELS, ...labelOverrides };
  const messageId = useId();
  const instructionsId = useId();
  const statusId = useId();
  const [message, setMessage] = useState('');
  const [turns, setTurns] = useState<readonly TutorComposerTurn[]>([]);
  const [status, setStatus] = useState(labels.readyStatus);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitInFlight = useRef(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitInFlight.current) return;

    const learnerMessage = message.trim();
    if (!learnerMessage) {
      setError(labels.emptyMessageError);
      setStatus(labels.readyStatus);
      return;
    }

    // This must stay before the first state change or await. The reference is
    // bound to the pixels/view that existed at the exact submit boundary.
    let capturedArtifact: ArtifactReference | null;
    try {
      capturedArtifact = captureCurrentView();
    } catch {
      capturedArtifact = null;
    }
    if (!capturedArtifact) {
      setError(labels.captureError);
      setStatus(labels.readyStatus);
      return;
    }
    const artifact: ArtifactReference = Object.freeze({
      id: capturedArtifact.id,
      ...(capturedArtifact.label === undefined ? {} : { label: capturedArtifact.label }),
      ...(capturedArtifact.mimeType === undefined ? {} : { mimeType: capturedArtifact.mimeType }),
      ...(capturedArtifact.sha256 === undefined ? {} : { sha256: capturedArtifact.sha256 }),
    });

    submitInFlight.current = true;
    setBusy(true);
    setError(null);
    setStatus(labels.workingStatus);
    try {
      const historyWindowMessages = turns
        .flatMap((turn) => [
          { role: 'learner' as const, text: turn.learnerMessage },
          { role: 'assistant' as const, text: turn.tutorResponse },
        ])
        .slice(-64);
      const result = await engine.runTurn({
        caseId: material.id,
        learnerMessage,
        lessonId: lessonId ?? material.lessonId,
        artifact,
        learnerLevel,
        mode,
        hasImage: true,
        historyWindowMessages,
      });
      const turn: TutorComposerTurn = Object.freeze({
        turnId: result.turnId,
        learnerMessage,
        tutorResponse: result.text,
        artifactLabel: artifact.label ?? labels.currentView,
        result,
      });
      setTurns((current) => [...current, turn]);
      setMessage('');
      setStatus(labels.successStatus);
      try {
        onTurnComplete?.(turn);
      } catch {
        // A host analytics callback cannot turn a completed teaching response
        // into a learner-facing failure or expose its thrown value.
      }
    } catch (caught) {
      setError(safeErrorMessage(caught, labels));
      setStatus(labels.readyStatus);
    } finally {
      submitInFlight.current = false;
      setBusy(false);
    }
  };

  const clearConversation = () => {
    setTurns([]);
    setError(null);
    setStatus(labels.readyStatus);
  };

  return (
    <section className={`caseattend-tutor ${className}`.trim()} aria-labelledby={`${messageId}-heading`}>
      <header className="caseattend-tutor__header">
        <div>
          <p className="caseattend-tutor__eyebrow">{material.title}</p>
          <h2 id={`${messageId}-heading`}>{labels.heading}</h2>
        </div>
        {turns.length > 0 ? (
          <button className="caseattend-tutor__secondary" type="button" onClick={clearConversation} disabled={busy}>
            {labels.clear}
          </button>
        ) : null}
      </header>

      <div
        className="caseattend-tutor__transcript"
        role="log"
        aria-label={labels.conversation}
        aria-live="polite"
        aria-relevant="additions text"
      >
        {turns.map((turn) => (
          <article className="caseattend-tutor__turn" key={turn.turnId}>
            <div className="caseattend-tutor__message caseattend-tutor__message--learner">
              <h3>{labels.learner}</h3>
              <p>{turn.learnerMessage}</p>
              <p className="caseattend-tutor__attachment">{labels.currentView}: {turn.artifactLabel}</p>
            </div>
            <div className="caseattend-tutor__message caseattend-tutor__message--tutor">
              <h3>{labels.tutor}</h3>
              <p>{turn.tutorResponse}</p>
            </div>
          </article>
        ))}
      </div>

      <form className="caseattend-tutor__form" onSubmit={handleSubmit} aria-busy={busy}>
        <label htmlFor={messageId}>{labels.messageLabel}</label>
        <p id={instructionsId} className="caseattend-tutor__instructions">{labels.messageInstructions}</p>
        <textarea
          id={messageId}
          value={message}
          onChange={(event) => setMessage(event.currentTarget.value)}
          placeholder={labels.messagePlaceholder}
          aria-describedby={`${instructionsId} ${statusId}`}
          maxLength={maxMessageLength}
          rows={4}
          disabled={busy}
        />
        {error ? <p className="caseattend-tutor__error" role="alert">{error}</p> : null}
        <div className="caseattend-tutor__actions">
          <p id={statusId} className="caseattend-tutor__status" role="status" aria-live="polite">
            {status}
          </p>
          <button className="caseattend-tutor__submit" type="submit" aria-disabled={busy}>
            {busy ? labels.sending : labels.send}
          </button>
        </div>
      </form>
    </section>
  );
}
