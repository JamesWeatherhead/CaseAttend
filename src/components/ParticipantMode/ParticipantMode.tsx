import React, { useRef, useState } from 'react';
import { AlertTriangle, LockKeyhole, LogOut } from 'lucide-react';
import type { LearnerLevel } from '../../constants';
import type { ResearchParticipantInformationV1 } from '../../core/researchManifest';
import { validateResearchParticipantCode } from '../../core/researchParticipant';
import ParticipantTaskFlow, {
  type ParticipantTaskRecorder,
  type ParticipantTaskSet,
} from '../ParticipantTaskFlow/ParticipantTaskFlow';
import './ParticipantMode.css';

export interface ParticipantArmLaunchConfig {
  id: string;
  label: string;
  caseRef: {
    id: string;
    manifestSha256: string;
  };
  lessonRef: {
    id: string;
    version: string;
    sha256: string;
  };
  provider: string;
  model: string;
  temperature: number;
  topP: number;
  learnerLevel: LearnerLevel;
  captureSummary: string;
}

export interface ParticipantLaunchConfig {
  studyTitle: string;
  manifestRef: {
    id: string;
    version: string;
    sha256: string;
  };
  assignmentSummary: string;
  arms: readonly ParticipantArmLaunchConfig[];
  /** Every possible inference recipient, without revealing its arm mapping. */
  providerDestinations: readonly {
    gateway: 'OpenRouter';
    gatewayUrl: string;
    upstreamProvider: string;
    policyUrl: string;
  }[];
  participantInformation: ResearchParticipantInformationV1;
  dataFields: readonly string[];
  rawChatEnabled: boolean;
  retentionSummary: string;
  institutionDetermined: boolean;
}

export interface ParticipantStartResult {
  /** Derived pseudonymous reference. The raw participant code must not be returned. */
  participantReference: string;
  /** Exact arm selected by the frozen assignment rule. */
  armId: string;
  /**
   * Structured tasks and the already-started pseudonymous recorder. This is
   * returned only after assignment; no raw participant code is retained.
   */
  taskFlow?: {
    tasks: ParticipantTaskSet;
    recorder: ParticipantTaskRecorder;
  };
}

export interface ParticipantModeProps {
  config: ParticipantLaunchConfig;
  storageStatus: {
    persistent: boolean;
    launchAllowed: boolean;
    message: string;
  };
  /** Browser-local readiness only. The credential itself must never cross this boundary. */
  inferenceReady: boolean;
  /** True until an active model request has a persisted terminal event. */
  inferenceBusy?: boolean;
  /** Aborts the active request and resolves only after its terminal event is persisted. */
  cancelInferenceAndWait?: () => Promise<void>;
  onStart: (participantCode: string) => Promise<ParticipantStartResult>;
  onExit: () => void | Promise<void>;
  renderActivity?: (context: {
    participantReference: string;
    config: ParticipantLaunchConfig;
    arm: ParticipantArmLaunchConfig;
  }) => React.ReactNode;
}

const ParticipantMode: React.FC<ParticipantModeProps> = ({
  config,
  storageStatus,
  inferenceReady,
  inferenceBusy = false,
  cancelInferenceAndWait,
  onStart,
  onExit,
  renderActivity,
}) => {
  const [participantCode, setParticipantCode] = useState('');
  const [informationAcknowledged, setInformationAcknowledged] = useState(false);
  const [participantReference, setParticipantReference] = useState('');
  const [assignedArmId, setAssignedArmId] = useState('');
  const [taskFlow, setTaskFlow] = useState<ParticipantStartResult['taskFlow']>();
  const [busy, setBusy] = useState(false);
  const [exitBusy, setExitBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const errorRef = useRef<HTMLDivElement>(null);

  const launchBlocked = !storageStatus.persistent
    || !storageStatus.launchAllowed
    || !config.institutionDetermined
    || config.rawChatEnabled
    || !inferenceReady;
  const acknowledgementRequired = config.participantInformation.acknowledgement.kind === 'required';
  const waivedDeterminationReference = config.participantInformation.acknowledgement.kind === 'institutionally-waived'
    ? config.participantInformation.acknowledgement.determinationReference
    : '';

  const start = async () => {
    const normalizedCode = participantCode.trim();
    const codeValidation = validateResearchParticipantCode(normalizedCode);
    if (!codeValidation.valid) {
      setError(codeValidation.errors[0] ?? 'Enter the valid pseudonymous code supplied by the study team.');
      queueMicrotask(() => errorRef.current?.focus());
      return;
    }
    if (acknowledgementRequired && !informationAcknowledged) {
      setError('Confirm that you read the participant information before starting.');
      queueMicrotask(() => errorRef.current?.focus());
      return;
    }
    if (launchBlocked) {
      setError(!config.institutionDetermined
        ? 'This study cannot launch until the required institutional determination is documented outside CaseAttend.'
        : config.rawChatEnabled
          ? 'This browser-local participant mode cannot launch a study configured to collect raw conversation content.'
        : 'This study cannot launch without persistent browser storage. Ask the study team for help.');
      queueMicrotask(() => errorRef.current?.focus());
      return;
    }

    setBusy(true);
    setError('');
    setStatus('Starting the configured study session.');
    try {
      const result = await onStart(normalizedCode);
      if (!result.participantReference.trim()) {
        throw new Error('The study store did not return a pseudonymous participant reference.');
      }
      if (!config.arms.some((arm) => arm.id === result.armId)) {
        throw new Error('The study store returned an arm that is not in the frozen configuration.');
      }
      setParticipantCode('');
      setAssignedArmId(result.armId);
      setTaskFlow(result.taskFlow);
      setParticipantReference(result.participantReference);
      setStatus('Study session started.');
    } catch (startError: unknown) {
      setError(startError instanceof Error
        ? startError.message
        : 'The study session could not be started. No participant activity has begun.');
      queueMicrotask(() => errorRef.current?.focus());
      setStatus('');
    } finally {
      setBusy(false);
    }
  };

  const exit = async () => {
    if (exitBusy) return;
    setExitBusy(true);
    setError('');
    setStatus(inferenceBusy
      ? 'Stopping the active AI request and saving its terminal record before ending the study.'
      : 'Ending the study session.');
    try {
      // Always await the registered seam. This also closes the narrow window
      // before React has painted the latest busy state after Send.
      if (cancelInferenceAndWait) {
        await cancelInferenceAndWait();
      } else if (inferenceBusy) {
        throw new Error('The active AI request cannot be stopped safely. Wait for it to finish, then try Exit study again.');
      }
      await onExit();
    } catch (exitError: unknown) {
      setError(exitError instanceof Error
        ? exitError.message
        : 'The study could not be ended safely. Try Exit study again or ask the study team for help.');
      setStatus('The study remains open because its final browser record was not saved.');
      queueMicrotask(() => errorRef.current?.focus());
      setExitBusy(false);
    }
  };

  if (participantReference) {
    const assignedArm = config.arms.find((arm) => arm.id === assignedArmId);
    if (!assignedArm) return null;
    const assignedActivity = renderActivity
      ? renderActivity({ participantReference, config, arm: assignedArm })
      : (
        <div className="participant-mode-main">
          <h1>Study session ready</h1>
          <p className="participant-intro">The configured activity has started. The study team must connect its participant workspace here.</p>
        </div>
      );
    return (
      <main className="participant-mode-shell participant-active" aria-label="Participant Mode">
        <header className="participant-mode-header">
          <div className="participant-mode-brand">
            <img src="/logo.svg" alt="" />
            <div><strong>Participant Mode</strong><span>{config.studyTitle}</span></div>
          </div>
          <button type="button" className="participant-exit" onClick={() => { void exit(); }} disabled={exitBusy} aria-describedby="participant-active-exit-status">
            <LogOut aria-hidden="true" /><span>{exitBusy ? 'Stopping…' : 'Exit study'}</span>
          </button>
        </header>
        <div id="participant-active-exit-status" className="participant-active-banner" role="status" aria-live="polite">
          {exitBusy
            ? 'Stopping safely. CaseAttend will save the active model request terminal record before it ends the run.'
            : inferenceBusy
              ? `Study configuration is locked to manifest ${config.manifestRef.sha256}. Exit study remains available and will first cancel the active AI request safely.`
              : `Study configuration is locked to manifest ${config.manifestRef.sha256}. Use Exit study at any time to stop this activity.`}
        </div>
        {error && <div className="participant-error participant-active-error" role="alert" tabIndex={-1} ref={errorRef}>{error}</div>}
        <section className="participant-assigned-summary" aria-labelledby="participant-assigned-heading">
          <h1 id="participant-assigned-heading">Your assigned study activity</h1>
          <p>{assignedArm.label}</p>
          <dl>
            <div><dt>Teaching case</dt><dd>{assignedArm.caseRef.id}</dd></div>
            <div><dt>AI provider and model</dt><dd>{assignedArm.provider} / {assignedArm.model}, temperature {assignedArm.temperature}, top P {assignedArm.topP}</dd></div>
            <div><dt>Image sharing</dt><dd>{assignedArm.captureSummary}</dd></div>
            <div><dt>Exact content</dt><dd>Case {assignedArm.caseRef.manifestSha256}; lesson {assignedArm.lessonRef.sha256}</dd></div>
          </dl>
        </section>
        <section className="participant-activity-slot" aria-label="Configured study activity">
          {taskFlow ? (
            <ParticipantTaskFlow
              tasks={taskFlow.tasks}
              recorder={taskFlow.recorder}
              renderActivity={assignedActivity}
              activityBusy={inferenceBusy}
            />
          ) : assignedActivity}
        </section>
      </main>
    );
  }

  return (
    <main className="participant-mode-shell" aria-labelledby="participant-title">
      <header className="participant-mode-header">
        <div className="participant-mode-brand">
          <img src="/logo.svg" alt="" />
          <div><strong>Participant Mode</strong><span>Locked research configuration</span></div>
        </div>
        <button type="button" className="participant-exit" onClick={() => { void exit(); }} disabled={exitBusy}>
          <LogOut aria-hidden="true" /><span>{exitBusy ? 'Stopping…' : 'Exit study'}</span>
        </button>
      </header>

      <div className="participant-mode-main">
        <h1 id="participant-title">{config.studyTitle}</h1>
        <p className="participant-intro">
          Read the study information below before entering the pseudonymous code supplied by the study team.
          Do not enter your name, email, student ID, patient information, or another direct identifier.
        </p>

        <div className="participant-lock-note" role="note">
          <LockKeyhole aria-hidden="true" />
          <p>
            This participant view is locked to one frozen study configuration. Its recorded assignment rule selects one exact arm after your code is transformed into a study-scoped pseudonymous reference.
            Catalog, authoring, model, learner-level, and unrelated data controls are not available here.
          </p>
        </div>

        {launchBlocked && (
          <div className="participant-blocker" role="alert">
            <AlertTriangle aria-hidden="true" />
            <p>
              {!inferenceReady
                ? 'Participant launch is blocked because this browser does not have an OpenRouter key. Exit Participant Mode and ask the study team how to connect an approved key in this browser before returning. Participant Mode does not open a key connection flow after a research run starts.'
                : !config.institutionDetermined
                  ? 'Participant launch is blocked until the study team documents the institution\'s required determination outside CaseAttend.'
                : config.rawChatEnabled
                  ? 'Participant launch is blocked because browser-local Participant Mode does not collect raw conversation content. The study team must turn raw chat off or use a separately reviewed institution-managed implementation.'
                : `Participant launch is blocked because persistent browser storage is unavailable. ${storageStatus.message}`}
            </p>
          </div>
        )}

        <section className="participant-information" aria-labelledby="participant-information-heading">
          <h2 id="participant-information-heading">Participant information</h2>
          <h3>Key information</h3><p>{config.participantInformation.keyInformation}</p>
          <h3>Purpose</h3><p>{config.participantInformation.purpose}</p>
          <h3>What you will do</h3><p>{config.participantInformation.procedures}</p>
          <h3>Risks</h3><p>{config.participantInformation.risks}</p>
          <h3>Benefits</h3><p>{config.participantInformation.benefits}</p>
          <h3>Privacy</h3><p>{config.participantInformation.privacy}</p>
          <h3>Voluntary participation</h3><p>{config.participantInformation.voluntaryParticipation}</p>
          <h3>Compensation</h3><p>{config.participantInformation.compensation}</p>
          <h3>About the AI</h3>
          <p>{config.participantInformation.vlmDisclosure.plainLanguage}</p>
          <p>{config.participantInformation.vlmDisclosure.limitations} This activity is educational and is not medical advice.</p>
          <h3>Contacts</h3>
          <ul>{config.participantInformation.contacts.map((contact) => <li key={`${contact.email}:${contact.role}`}>{contact.name}, {contact.role}: <a href={`mailto:${contact.email}`}>{contact.email}</a></li>)}</ul>
        </section>

        <section className="participant-summary" aria-labelledby="participant-summary-heading">
          <h2 id="participant-summary-heading">What this configured session uses and records</h2>
          <dl>
            <div><dt>Assignment</dt><dd>The frozen study may assign different activities. Your assigned condition is intentionally hidden until the session starts.</dd></div>
            <div><dt>Inference data flow</dt><dd>When you send a message, the system prompt, your message, and the visible current-view image are sent to OpenRouter and the assigned upstream model provider. A model response is returned. The assigned provider and model are shown after start.</dd></div>
            <div>
              <dt>Possible data recipients</dt>
              <dd>
                <ul>
                  {config.providerDestinations.map((destination) => (
                    <li key={`${destination.upstreamProvider}:${destination.policyUrl}`}>
                      <a href={destination.gatewayUrl} target="_blank" rel="noreferrer">{destination.gateway}</a>
                      {' and '}
                      <a href={destination.policyUrl} target="_blank" rel="noreferrer">{destination.upstreamProvider}</a>
                    </li>
                  ))}
                </ul>
                This list shows every possible recipient without revealing which study condition you may receive.
              </dd>
            </div>
            <div><dt>Browser-held API key</dt><dd>Your OpenRouter key is stored in this browser and sent only to OpenRouter for authentication. CaseAttend servers do not receive it, and it is never stored as research data. This protects the credential, not the message or image payload sent to the recipients above.</dd></div>
            <div><dt>Image sharing</dt><dd>The visible current view is sent only when you send a message. It is not stored in research session events or exports. Whether participant annotations are enabled is fixed by the assigned condition and shown after start.</dd></div>
            <div><dt>Recorded fields</dt><dd>{config.dataFields.length > 0 ? config.dataFields.join(', ') : 'No optional participant fields selected'}</dd></div>
            <div><dt>Raw conversation content</dt><dd>{config.rawChatEnabled ? 'Recorded under the frozen study policy' : 'Not recorded'}</dd></div>
            <div><dt>Retention and deletion</dt><dd>{config.retentionSummary}</dd></div>
          </dl>
        </section>

        <form className="participant-start-form" onSubmit={(event) => { event.preventDefault(); void start(); }}>
          <fieldset disabled={busy || launchBlocked}>
            <legend>Start the configured session</legend>
            <p>Your raw code is used only to derive a pseudonymous reference. It must not be stored with the session.</p>
            <p>The code must be issued by the study team outside CaseAttend. CaseAttend cannot verify eligibility, prevent code reuse, or enforce one participation per person; the study team must manage those controls separately.</p>
            <div className="participant-field">
              <label htmlFor="participant-code">Pseudonymous participant code</label>
              <input
                id="participant-code"
                className="participant-input"
                value={participantCode}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => { setParticipantCode(event.target.value); setError(''); }}
                aria-describedby="participant-code-hint"
                required
              />
              <small id="participant-code-hint">Enter the 20-character Crockford Base32 code supplied by the study team. Spaces and grouping hyphens are accepted. Do not invent a code from personal information.</small>
            </div>
            {acknowledgementRequired ? (
              <label className="participant-confirmation">
                <input
                  type="checkbox"
                  checked={informationAcknowledged}
                  onChange={(event) => { setInformationAcknowledged(event.target.checked); setError(''); }}
                />
                <span>I read the participant information and understand what this configured session sends and records.</span>
              </label>
            ) : (
              <p>The responsible institution recorded that an acknowledgement is waived under determination {waivedDeterminationReference}. CaseAttend does not make or verify that determination.</p>
            )}
            <button type="submit" className="participant-start-button">Start study session</button>
          </fieldset>
          {error && <div className="participant-error" role="alert" tabIndex={-1} ref={errorRef}>{error}</div>}
          <p className="participant-status" role="status" aria-live="polite">{status}</p>
        </form>
      </div>
    </main>
  );
};

export default ParticipantMode;
