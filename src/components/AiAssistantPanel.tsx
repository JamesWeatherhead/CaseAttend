
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Sparkles, Globe, BrainCircuit, X, ImageIcon, Trash2, AlertTriangle, RotateCcw, ArrowDown, HelpCircle, KeyRound, LockKeyhole } from 'lucide-react';
import type { AiMode, AIProvider, LockedTutorRuntime } from '../services/aiClient';
import { hasKey, getModel, modelLabel, BYOK_CHANGED_EVENT } from '../services/byokStore';
import ConnectKeyModal from './ConnectKeyModal';
import { ChatMessage, CursorContext, AiPointer, type CapturedTutorView } from '../types';
import { MarkdownText } from '../utils/markdownUtils';
import { LearnerLevel } from '../constants';
import { getDomain } from '../lib/domains';
import type { DomainKey } from '../lib/domains';
import { getLessonPlanRef, getLessonSocraticOpening, type LessonPlanV1 } from '../core/lessonPlan';
import type { IntroCacheV1 } from '../core/introCache';
import { loadIntroCache } from '../services/introCacheStore';
import { requireCasePackage } from '../data/caseRegistry';
import { requireLessonPlanForCase } from '../data/lessonRegistry';
import {
  CASE_SESSION_EXIT_EVENT,
  SessionRecorder,
  clearCaseTransition,
  consumeCaseTransition,
  rememberCaseTransition,
  type SessionRecorderContext,
  type SessionTransitionLink,
} from '../services/sessionRecorder';
import {
  SESSION_DATA_DELETED_EVENT,
  type SessionDataDeletedDetail,
  type SessionStore,
} from '../services/sessionStore';
import { getPreference, PREFERENCE_KEYS, setPreference } from '../services/preferenceStore';
import { fingerprintResearchCapture } from '../core/researchCapture';
import type { ResearchRecorder } from '../services/researchRecorder';
import type { ResearchInferenceErrorCode } from '../services/researchStore';
import {
  compatibilityTeachingEngine,
  type TeachingEnginePort,
} from '../services/browserTeachingEngine';

interface AiAssistantPanelProps {
  teachingEngine?: TeachingEnginePort;
  captureCurrentView: () => CapturedTutorView | null;
  sessionContext?: SessionRecorderContext;
  sessionEventStore?: Pick<SessionStore, 'append'>;

  studyMetadata?: {
    studyId: string;
    description: string;
    modality: string;
    domain: DomainKey;
  };
  cursor?: CursorContext;
  onJumpToSlice?: (index: number) => void;
  activeSeriesInfo?: {
    description: string;
    instanceCount: number;
  };
  onStartTour?: () => void;
  onPointers?: (pointers: AiPointer[]) => void;
  /** Reports whether a request still lacks a persisted terminal event. */
  onInferenceBusyChange?: (busy: boolean) => void;
  /** Registers a privacy-safe cancellation seam for the participant lifecycle. */
  onCancelInferenceReady?: (cancelAndWait: (() => Promise<void>) | null) => void;
  lockedTutor?: {
    manifestSha256: string;
    learnerLevel: LearnerLevel;
    mode: Exclude<AiMode, 'search'>;
    runtime: LockedTutorRuntime;
    research: {
      recorder: Pick<ResearchRecorder, 'record'>;
      caseStepId: string;
      inferenceConfigSha256: string;
    };
  };
}

function safeSessionModelId(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0
    && trimmed.length <= 200
    && !trimmed.includes('://')
    && /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(trimmed)
    ? trimmed
    : 'unknown';
}

const INFERENCE_FAILURE_MESSAGES: Readonly<Record<ResearchInferenceErrorCode, string>> = Object.freeze({
  missing_key: 'Connect your OpenRouter account, then try again.',
  missing_case: 'This teaching session is missing a registered case. Return to the case list and reopen it.',
  prompt_resolution_failed: 'The verified teaching prompt could not be prepared. Return to the case list and reopen the case.',
  request_aborted: 'The AI request was cancelled.',
  timeout: 'The AI request timed out. Try again or choose a faster model.',
  network_error: 'The AI service could not be reached. Check your connection and try again.',
  unauthorized: 'OpenRouter rejected this browser\'s key. Reconnect your OpenRouter account.',
  payment_required: 'The connected OpenRouter account is out of credit. Choose a free model or add credit.',
  forbidden: 'The selected model is not available to the connected OpenRouter account.',
  rate_limited: 'The AI service is busy. Please try again in a moment.',
  provider_unavailable: 'The AI service is temporarily unavailable. Please try again.',
  provider_error: 'The AI service could not complete this request. Try again or choose another model.',
  invalid_response: 'The AI service returned an unreadable response. Please try again.',
  empty_response: 'The AI service returned an empty response. Try again or choose another model.',
  protocol_deviation: 'The model response did not match the frozen study condition and was discarded.',
  unexpected_error: 'The AI request could not be completed. Please try again.',
});

type InferenceProtocolDeviationCode =
  | 'case_mismatch'
  | 'lesson_mismatch'
  | 'model_mismatch'
  | 'provider_mismatch'
  | 'inference_parameter_mismatch'
  | 'storage_unavailable';

interface NormalizedInferenceFailure {
  code: ResearchInferenceErrorCode;
  retryable: boolean;
  httpStatus?: number;
  deviation?: {
    code: InferenceProtocolDeviationCode;
    expectedId?: string;
    observedId?: string;
  };
  displayMessage: string;
}

function ownDataProperty(value: unknown, key: string): unknown {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    return undefined;
  }
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    // Never invoke an accessor supplied by an adapter error object.
    return descriptor && 'value' in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function safeInferenceIdentifier(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0
    && trimmed.length <= 200
    && !trimmed.includes('://')
    && !/\bBearer\b/i.test(trimmed)
    && !/\bsk-[A-Za-z0-9_-]{8,}/i.test(trimmed)
    && /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(trimmed)
    ? trimmed
    : undefined;
}

function normalizedDeviation(value: unknown): NormalizedInferenceFailure['deviation'] {
  const code = ownDataProperty(value, 'code');
  const supported = new Set<InferenceProtocolDeviationCode>([
    'case_mismatch',
    'lesson_mismatch',
    'model_mismatch',
    'provider_mismatch',
    'inference_parameter_mismatch',
    'storage_unavailable',
  ]);
  if (typeof code !== 'string' || !supported.has(code as InferenceProtocolDeviationCode)) {
    return undefined;
  }
  const expectedId = safeInferenceIdentifier(ownDataProperty(value, 'expectedId'));
  const observedId = safeInferenceIdentifier(ownDataProperty(value, 'observedId'));
  return {
    code: code as InferenceProtocolDeviationCode,
    ...(expectedId && observedId ? { expectedId, observedId } : {}),
  };
}

/**
 * Rebuild a closed, display-safe failure instead of trusting an adapter's
 * Error.message, cause, response body, headers, or enumerable properties.
 */
function normalizeInferenceFailure(value: unknown): NormalizedInferenceFailure {
  const code = ownDataProperty(value, 'code');
  const retryable = ownDataProperty(value, 'retryable');
  const supportedCode = typeof code === 'string'
    && Object.prototype.hasOwnProperty.call(INFERENCE_FAILURE_MESSAGES, code)
    ? code as ResearchInferenceErrorCode
    : 'unexpected_error';
  const httpStatusValue = ownDataProperty(value, 'httpStatus');
  const httpStatus = Number.isSafeInteger(httpStatusValue)
    && (httpStatusValue as number) >= 100
    && (httpStatusValue as number) <= 599
    ? httpStatusValue as number
    : undefined;
  const deviation = supportedCode === 'protocol_deviation'
    ? normalizedDeviation(ownDataProperty(value, 'deviation'))
    : undefined;
  return {
    code: supportedCode,
    retryable: supportedCode === 'unexpected_error'
      ? true
      : typeof retryable === 'boolean' ? retryable : false,
    ...(httpStatus === undefined ? {} : { httpStatus }),
    ...(deviation ? { deviation } : {}),
    displayMessage: INFERENCE_FAILURE_MESSAGES[supportedCode],
  };
}

function sessionContextIdentity(context?: SessionRecorderContext): string {
  return context
    ? [
        context.casePackageRef.id,
        context.casePackageRef.schemaVersion,
        context.casePackageRef.sha256,
        context.lessonPlanRef.id,
        context.lessonPlanRef.version,
        context.lessonPlanRef.sha256,
      ].join(':')
    : '';
}

const AiAssistantPanel: React.FC<AiAssistantPanelProps> = ({
  teachingEngine = compatibilityTeachingEngine,
  captureCurrentView,
  sessionContext,
  sessionEventStore,
  studyMetadata,
  cursor,
  onJumpToSlice,
  activeSeriesInfo,
  onStartTour,
  onPointers,
  onInferenceBusyChange,
  onCancelInferenceReady,
  lockedTutor,
}) => {
  // Learner Level State (must be before messages so welcome adapts)
  const [learnerLevel, setLearnerLevel] = useState<LearnerLevel>(() => {
    if (lockedTutor) return lockedTutor.learnerLevel;
    const stored = getPreference(PREFERENCE_KEYS.learnerLevel) ?? '';
    // Migrate old 'medstudent' value to new default
    if (stored === 'medstudent') return 'ms_preclinical';
    const supported: readonly LearnerLevel[] = [
      'highschool',
      'undergrad',
      'ms_preclinical',
      'ms_clinical',
      'resident',
    ];
    return supported.includes(stored as LearnerLevel)
      ? stored as LearnerLevel
      : 'ms_preclinical';
  });

  const domain = getDomain(studyMetadata?.domain ?? 'radiology');
  const sessionContextKey = sessionContextIdentity(sessionContext);

  const [lessonPlan, setLessonPlan] = useState<LessonPlanV1 | null>(null);
  const [lessonLoadError, setLessonLoadError] = useState<string | null>(null);
  const [introCache, setIntroCache] = useState<IntroCacheV1 | null>(null);
  const introPromptForLevel = introCache?.levels[learnerLevel]?.introPrompt;
  const welcomeText = introPromptForLevel
    ?? (lessonPlan
      ? getLessonSocraticOpening(lessonPlan, learnerLevel)
      : domain.welcomeMessage(learnerLevel, studyMetadata?.studyId));

  const initMsg: ChatMessage[] = [
    { id: 'welcome', role: 'model', text: welcomeText }
  ];
  const [messages, setMessages] = useState(initMsg);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [showMedPicker, setShowMedPicker] = useState(false);
  const [mode, setMode] = useState<AiMode>(() => lockedTutor?.mode ?? 'chat');
  const [provider, setProvider] = useState<AIProvider>('openrouter');
  const [dynamicSuggestionsMap, setDynamicSuggestionsMap] = useState<Record<LearnerLevel, string[]> | null>(null);
  const lockedTutorKey = lockedTutor
    ? [
        lockedTutor.manifestSha256,
        lockedTutor.runtime.casePackage.manifest.sha256,
        lockedTutor.runtime.lessonPlan.manifest.sha256,
        lockedTutor.runtime.expectedSystemPromptSha256,
        lockedTutor.runtime.historyWindowMessages,
        lockedTutor.runtime.requestTemplateVersion,
        lockedTutor.runtime.openRouterPolicy.model,
        lockedTutor.runtime.openRouterPolicy.upstreamProviderId,
        lockedTutor.learnerLevel,
        lockedTutor.mode,
      ].join(':')
    : '';

  useEffect(() => {
    if (!lockedTutor) return;
    setLearnerLevel(lockedTutor.learnerLevel);
    setMode(lockedTutor.mode);
    setProvider('openrouter');
    setShowMedPicker(false);
  }, [lockedTutorKey]);

  useEffect(() => {
    let active = true;
    setLessonPlan(null);
    setLessonLoadError(null);
    if (!studyMetadata?.studyId) return () => { active = false; };

    if (lockedTutor) {
      const frozenCase = lockedTutor.runtime.casePackage;
      if (frozenCase.id !== studyMetadata.studyId || frozenCase.domain !== studyMetadata.domain) {
        setLessonLoadError('The frozen research case does not match this participant activity.');
      } else {
        setLessonPlan(lockedTutor.runtime.lessonPlan);
      }
      return () => { active = false; };
    }

    (async () => {
      try {
        const casePackage = await requireCasePackage(studyMetadata.studyId);
        if (casePackage.domain !== studyMetadata.domain) {
          throw new Error(`Case domain mismatch for '${studyMetadata.studyId}'.`);
        }
        const plan = await requireLessonPlanForCase(casePackage);
        if (active) setLessonPlan(plan);
      } catch (error) {
        if (active) {
          setLessonLoadError(error instanceof Error ? error.message : 'The versioned lesson could not be loaded.');
        }
      }
    })();
    return () => { active = false; };
  }, [lockedTutorKey, sessionContextKey, studyMetadata?.domain, studyMetadata?.studyId]);

  // Intro cache lives outside the research/lockedTutor code path: research uses
  // the pinned live model. For public-education mode, fetch the shipped cache
  // for this lesson so a no-key learner sees a per-level opening + at least
  // one clickable, pre-answered question with no network at click time.
  useEffect(() => {
    let active = true;
    setIntroCache(null);
    if (lockedTutor) return () => { active = false; };
    const caseId = studyMetadata?.studyId;
    if (!caseId || !lessonPlan) return () => { active = false; };
    void loadIntroCache(caseId, { lessonPlanSha256: lessonPlan.manifest.sha256 })
      .then((cache) => { if (active) setIntroCache(cache); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [lockedTutorKey, lessonPlan, studyMetadata?.studyId]);

  // A case switch starts a new versioned teaching session. Never retain another
  // case's welcome, dynamic suggestions, or transcript in the next case.
  useEffect(() => {
    setMessages([{ id: 'welcome', role: 'model', text: welcomeText }]);
    setInput('');
    setDynamicSuggestionsMap(null);
    setCaptureError(null);
  }, [sessionContextKey, studyMetadata?.domain, studyMetadata?.studyId]);

  // Update the untouched welcome when the resolved lesson or learner level changes.
  useEffect(() => {
    setMessages(prev => {
      if (prev.length === 1 && prev[0].id === 'welcome') {
        return [{
          id: 'welcome',
          role: 'model',
          text: welcomeText,
          lessonPlanRef: lessonPlan ? getLessonPlanRef(lessonPlan) : undefined,
        }];
      }
      return prev;
    });
  }, [welcomeText, lessonPlan, learnerLevel]);

  // BYOK is the launch model: every visitor uses their own OpenRouter balance, so
  // no inference is billed to a shared developer key. (setProvider retained for a
  // possible future owner-funded tier.)

  // BYOK connection state, kept in sync via BYOK_CHANGED_EVENT so the status bar
  // and model label update the instant the user connects or switches model.
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [byokConnected, setByokConnected] = useState<boolean>(() => hasKey());
  const [byokModelLabel, setByokModelLabel] = useState<string>(() => (
    modelLabel(lockedTutor?.runtime.openRouterPolicy.model ?? getModel())
  ));

  useEffect(() => {
    const sync = () => {
      setByokConnected(hasKey());
      setByokModelLabel(modelLabel(lockedTutor?.runtime.openRouterPolicy.model ?? getModel()));
    };
    sync();
    window.addEventListener(BYOK_CHANGED_EVENT, sync);
    return () => window.removeEventListener(BYOK_CHANGED_EVENT, sync);
  }, [lockedTutorKey]);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const requestSequenceRef = useRef(0);
  const mountedRef = useRef(true);
  const studySessionKey = [
    studyMetadata?.domain ?? 'radiology',
    studyMetadata?.studyId ?? '',
    sessionContextKey,
    lockedTutorKey,
  ].join(':');
  const studySessionKeyRef = useRef(studySessionKey);
  studySessionKeyRef.current = studySessionKey;

  type ActiveRequest = {
    id: number;
    studySessionKey: string;
    cancelled: boolean;
    abortController: AbortController;
    turnId: string;
    recorder: SessionRecorder | null;
    requestedModelId: string;
    expectedSystemPromptSha256?: string;
    startedAt: number;
    terminalRecorded: boolean;
    terminalRecordPromise?: Promise<void>;
    research?: NonNullable<AiAssistantPanelProps['lockedTutor']>['research'];
    botMessageId?: string;
    inputToRestore?: string;
  };
  const activeRequestRef = useRef<ActiveRequest | null>(null);
  const sessionRecorderRef = useRef<SessionRecorder | null>(null);
  const previousSessionRef = useRef<SessionTransitionLink | null>(null);

  const recordSessionEvent = (
    recorder: SessionRecorder | null,
    event: Parameters<SessionRecorder['record']>[0],
  ) => {
    if (!recorder || recorder.isEnded) return;
    try {
      void recorder.record(event).catch(() => undefined);
    } catch {
      // Metadata recording is fail-closed and must never block the learner's
      // explicit model request.
    }
  };

  const recordResearchFailure = (
    request: ActiveRequest,
    errorCode: ResearchInferenceErrorCode,
    retryable: boolean,
    httpStatus?: number,
  ): Promise<unknown> => {
    if (!request.research) return Promise.resolve();
    return request.research.recorder.record({
      type: 'model_turn_failed',
      caseStepId: request.research.caseStepId,
      ...(request.expectedSystemPromptSha256
        ? { systemPromptSha256: request.expectedSystemPromptSha256 }
        : {}),
      inferenceConfigSha256: request.research.inferenceConfigSha256,
      requestedModelId: request.requestedModelId,
      errorCode,
      ...(httpStatus ? { httpStatus } : {}),
      latencyMs: Math.max(0, Date.now() - request.startedAt),
      retryable,
    });
  };

  const writeResearchTerminal = (
    request: ActiveRequest,
    write: () => Promise<unknown>,
  ): Promise<void> => {
    if (request.terminalRecorded) return Promise.resolve();
    if (request.terminalRecordPromise) return request.terminalRecordPromise;
    const pending = write()
      .then(() => {
        request.terminalRecorded = true;
      })
      .catch((error: unknown) => {
        if (request.terminalRecordPromise === pending) {
          request.terminalRecordPromise = undefined;
        }
        throw error;
      });
    request.terminalRecordPromise = pending;
    return pending;
  };

  const recordCancellation = (request: ActiveRequest): Promise<void> => {
    if (request.terminalRecorded) return Promise.resolve();
    if (request.terminalRecordPromise) return request.terminalRecordPromise;
    recordSessionEvent(request.recorder, {
      type: 'turn_cancelled',
      turnId: request.turnId,
    });
    if (request.research) {
      return writeResearchTerminal(
        request,
        () => recordResearchFailure(request, 'request_aborted', true),
      );
    }
    request.terminalRecorded = true;
    return Promise.resolve();
  };
  const recordCancellationRef = useRef(recordCancellation);
  recordCancellationRef.current = recordCancellation;
  const sessionContextRef = useRef(sessionContext);
  const sessionEffectGenerationRef = useRef(0);
  sessionContextRef.current = sessionContext;

  const startSessionRecorder = (
    context: SessionRecorderContext,
    previous: SessionTransitionLink | null,
  ): SessionRecorder => {
    const options = { ...(sessionEventStore ? { store: sessionEventStore } : {}) };
    if (!previous) return SessionRecorder.start(context, 'case_opened', undefined, options);
    return SessionRecorder.start(context, previous.startReason, previous.sessionId, options);
  };

  const ensureSessionRecorder = (): SessionRecorder | null => {
    if (lockedTutor) return null;
    const existing = sessionRecorderRef.current;
    if (existing && !existing.isEnded) return existing;
    if (!sessionContext) return null;
    const previous = previousSessionRef.current ?? consumeCaseTransition();
    previousSessionRef.current = null;
    const recorder = startSessionRecorder(sessionContext, previous);
    sessionRecorderRef.current = recorder;
    return recorder;
  };

  const isCurrentRequest = (request: ActiveRequest): boolean => (
    mountedRef.current
    && !request.cancelled
    && activeRequestRef.current === request
    && request.studySessionKey === studySessionKeyRef.current
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const request = activeRequestRef.current;
      if (request) {
        request.cancelled = true;
        request.abortController.abort();
        void recordCancellation(request).catch(() => undefined);
      }
      activeRequestRef.current = null;
    };
  }, []);

  useEffect(() => {
    const request = activeRequestRef.current;
    if (request) {
      request.cancelled = true;
      request.abortController.abort();
      void recordCancellation(request).catch(() => undefined);
      if (request.botMessageId) {
        setMessages((previous) => previous.filter(
          (message) => message.id !== request.botMessageId,
        ));
      }
    }
    activeRequestRef.current = null;
    setIsThinking(false);
    onPointers?.([]);
  }, [lockedTutorKey, sessionContextKey, studyMetadata?.domain, studyMetadata?.studyId]);

  useEffect(() => {
    if (!sessionContext || lockedTutor) return;
    const generation = ++sessionEffectGenerationRef.current;
    const existing = sessionRecorderRef.current;
    const recorder = existing
      && !existing.isEnded
      && sessionContextIdentity(existing.context) === sessionContextKey
      ? existing
      : startSessionRecorder(
          sessionContext,
          previousSessionRef.current ?? consumeCaseTransition(),
        );
    previousSessionRef.current = null;
    sessionRecorderRef.current = recorder;

    return () => {
      const request = activeRequestRef.current;
      if (
        request?.recorder
        && sessionContextIdentity(request.recorder.context) === sessionContextKey
      ) {
        request.cancelled = true;
        request.abortController.abort();
        void recordCancellation(request).catch(() => undefined);
        activeRequestRef.current = null;
        setIsThinking(false);
        onPointers?.([]);
        if (request.botMessageId) {
          setMessages((previous) => previous.filter(
            (message) => message.id !== request.botMessageId,
          ));
        }
      }

      const nextContext = sessionContextRef.current;
      const contextChanged = Boolean(nextContext && sessionContextIdentity(nextContext) !== sessionContextKey);
      const endReason = contextChanged
        ? nextContext!.casePackageRef.id !== sessionContext.casePackageRef.id
            || nextContext!.casePackageRef.sha256 !== sessionContext.casePackageRef.sha256
          ? 'case_switched'
          : 'lesson_changed'
        : 'navigation';
      const finishSession = () => {
        const recorderToEnd = sessionRecorderRef.current
          && sessionContextIdentity(sessionRecorderRef.current.context) === sessionContextKey
          ? sessionRecorderRef.current
          : recorder;
        void recorderToEnd.end(endReason).catch(() => undefined);
        if (contextChanged) {
          previousSessionRef.current = {
            sessionId: recorderToEnd.sessionId,
            context: recorderToEnd.context,
            startReason: endReason === 'lesson_changed' ? 'lesson_changed' : 'case_switched',
          };
        }
        if (sessionRecorderRef.current === recorderToEnd) sessionRecorderRef.current = null;
      };

      if (contextChanged) {
        finishSession();
      } else {
        // React StrictMode immediately replays effects in development. Defer a
        // same-context navigation end by one microtask so the replay can reuse
        // the recorder instead of creating a throwaway session.
        queueMicrotask(() => {
          if (sessionEffectGenerationRef.current === generation) finishSession();
        });
      }
    };
  }, [lockedTutorKey, sessionContextKey, sessionEventStore]);

  useEffect(() => {
    const stopActiveRequest = (recordTerminal: boolean) => {
      const request = activeRequestRef.current;
      if (!request) return;
      request.cancelled = true;
      if (recordTerminal) {
        void recordCancellation(request).catch(() => undefined);
      } else {
        request.terminalRecorded = true;
      }
      request.abortController.abort();
      activeRequestRef.current = null;
      setIsThinking(false);
      onPointers?.([]);
      if (request.inputToRestore !== undefined) setInput(request.inputToRestore);
      if (request.botMessageId) {
        setMessages((previous) => previous.filter(
          (message) => message.id !== request.botMessageId,
        ));
      }
    };

    const handleSessionDataDeleted = (event: Event) => {
      const detail = (event as CustomEvent<SessionDataDeletedDetail>).detail;
      const recorder = sessionRecorderRef.current;
      if (!recorder || (!detail?.all && detail?.sessionId !== recorder.sessionId)) return;
      stopActiveRequest(false);
      recorder.abandon();
      clearCaseTransition(recorder.sessionId);
      if (sessionRecorderRef.current === recorder) sessionRecorderRef.current = null;
    };

    const handleCaseExit = () => {
      const recorder = sessionRecorderRef.current;
      if (!recorder) return;
      stopActiveRequest(true);
      void recorder.end('case_switched').catch(() => undefined);
      rememberCaseTransition(recorder);
      if (sessionRecorderRef.current === recorder) sessionRecorderRef.current = null;
    };

    const handlePageHide = () => {
      const recorder = sessionRecorderRef.current;
      if (!recorder) return;
      stopActiveRequest(true);
      void recorder.end('page_hidden').catch(() => undefined);
      if (sessionRecorderRef.current === recorder) sessionRecorderRef.current = null;
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) ensureSessionRecorder();
    };

    window.addEventListener(SESSION_DATA_DELETED_EVENT, handleSessionDataDeleted);
    window.addEventListener(CASE_SESSION_EXIT_EVENT, handleCaseExit);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);
    return () => {
      window.removeEventListener(SESSION_DATA_DELETED_EVENT, handleSessionDataDeleted);
      window.removeEventListener(CASE_SESSION_EXIT_EVENT, handleCaseExit);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [lockedTutorKey, sessionContextKey, sessionEventStore, onPointers]);

  // Scroll State
  const [isUserNearBottom, setIsUserNearBottom] = useState(true);
  const [isPinnedToBottom, setIsPinnedToBottom] = useState(true);
  
  useEffect(() => {
    if (!lockedTutor) setPreference(PREFERENCE_KEYS.learnerLevel, learnerLevel);
  }, [learnerLevel, lockedTutorKey]);

  useEffect(() => {
    if (!lockedTutor) setPreference(PREFERENCE_KEYS.provider, provider);
  }, [provider, lockedTutorKey]);

  // Scroll welcome message to top on first render
  const hasScrolledWelcome = useRef(false);
  useEffect(() => {
    if (!hasScrolledWelcome.current && chatContainerRef.current && messages.length === 1 && messages[0].id === 'welcome') {
      chatContainerRef.current.scrollTop = 0;
      hasScrolledWelcome.current = true;
    }
  }, [messages]);

  // Track whether user has interacted during streaming
  const userInteractedRef = useRef(false);

  // Any user interaction inside the chat kills auto-scroll
  useEffect(() => {
    const el = chatContainerRef.current;
    if (!el) return;
    const stopAutoScroll = () => {
      userInteractedRef.current = true;
      setIsPinnedToBottom(false);
    };
    el.addEventListener('wheel', stopAutoScroll, { passive: true });
    el.addEventListener('touchstart', stopAutoScroll, { passive: true });
    el.addEventListener('pointerdown', stopAutoScroll);
    return () => {
      el.removeEventListener('wheel', stopAutoScroll);
      el.removeEventListener('touchstart', stopAutoScroll);
      el.removeEventListener('pointerdown', stopAutoScroll);
    };
  }, []);

  // Re-enable auto-scroll when a NEW message starts streaming (user sends a message)
  const prevMessageCount = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevMessageCount.current && isThinking) {
      userInteractedRef.current = false;
      setIsPinnedToBottom(true);
    }
    prevMessageCount.current = messages.length;
  }, [messages.length, isThinking]);

  // Smart Auto-Scroll Effect
  useEffect(() => {
    if (chatContainerRef.current && isPinnedToBottom && !userInteractedRef.current && messages.length > 1) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, isThinking, isPinnedToBottom]);

  const handleScroll = () => {
    if (!chatContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    setIsUserNearBottom(distanceFromBottom < 80);
  };

  const scrollToBottom = () => {
    if (chatContainerRef.current) {
        chatContainerRef.current.scrollTo({ top: chatContainerRef.current.scrollHeight, behavior: 'smooth' });
    }
    setIsPinnedToBottom(true);
  };

  // Derived suggestions: prefer pre-cached intro Q&A (free, instant, no key),
  // else dynamic model suggestions, else lesson hints, else the domain default.
  // Auto-capture means the panel always has a view to reference, so the
  // with-image suggestions are always the right starting set when a study is loaded.
  type IntroSuggestion = {
    key: string;
    label: string;
    prompt: string;
    cachedAnswer?: string;
    source: 'intro-cache' | 'lesson-hint' | 'domain' | 'dynamic';
  };
  const introQuestionsForLevel = introCache?.levels[learnerLevel]?.introQuestions;
  const currentSuggestions: IntroSuggestion[] = (introQuestionsForLevel && introQuestionsForLevel.length > 0)
    ? introQuestionsForLevel.map((q) => ({
        key: `intro-cache:${q.id}`,
        label: q.label,
        prompt: q.prompt,
        cachedAnswer: q.cachedAnswer,
        source: 'intro-cache' as const,
      }))
    : dynamicSuggestionsMap
      ? (dynamicSuggestionsMap[learnerLevel] ?? []).map((s, i) => ({
          key: `dynamic:${i}`, label: s, prompt: s, source: 'dynamic' as const,
        }))
      : lessonPlan
        ? lessonPlan.allowedHints.slice(0, 3).map((hint) => ({
            key: `hint:${hint.id}`, label: hint.text, prompt: hint.text, source: 'lesson-hint' as const,
          }))
        : (domain.getInitialSuggestions(learnerLevel, !!studyMetadata, studyMetadata?.studyId) ?? []).map((s, i) => ({
            key: `domain:${i}`, label: s, prompt: s, source: 'domain' as const,
          }));

  const renderCachedIntroAnswer = (suggestion: IntroSuggestion): void => {
    if (suggestion.cachedAnswer === undefined) return;
    const requestId = ++requestSequenceRef.current;
    const userMessageId = `intro-cache-${requestId}-user`;
    const botMessageId = `intro-cache-${requestId}-model`;
    const knownLessonRef = lessonPlan ? getLessonPlanRef(lessonPlan) : undefined;
    setMessages((previous) => [
      ...previous,
      {
        id: userMessageId,
        role: 'user',
        text: suggestion.prompt,
        lessonPlanRef: knownLessonRef,
      },
      {
        id: botMessageId,
        role: 'model',
        text: suggestion.cachedAnswer!,
        lessonPlanRef: knownLessonRef,
      },
    ]);
    setIsPinnedToBottom(true);
  };

  const sendSuggestion = (suggestion: IntroSuggestion) => {
    // Pre-cached intro questions render instantly with zero network and no
    // OpenRouter key. This is the free path documented in issue #68.
    if (suggestion.cachedAnswer !== undefined) {
      renderCachedIntroAnswer(suggestion);
      return;
    }
    const lessonHint = suggestion.source === 'lesson-hint'
      ? lessonPlan?.allowedHints.find((hint) => hint.text === suggestion.prompt)
      : undefined;
    void handleSendMessage(
      suggestion.prompt,
      undefined,
      lessonHint ? 'lesson_hint' : 'typed',
      lessonHint?.id,
    );
  };

  const handleClearChat = () => {
    // Abort active request if clearing
    const request = activeRequestRef.current;
    if (request) {
      request.cancelled = true;
      request.abortController.abort();
      void recordCancellation(request).catch(() => undefined);
      activeRequestRef.current = null;
      setIsThinking(false);
      onPointers?.([]);
    }

    const previousRecorder = sessionRecorderRef.current;
    if (previousRecorder && !previousRecorder.isEnded) {
      void previousRecorder.end('user_restarted').catch(() => undefined);
      const restarted = SessionRecorder.start(
        previousRecorder.context,
        'user_restarted',
        previousRecorder.sessionId,
        { ...(sessionEventStore ? { store: sessionEventStore } : {}) },
      );
      sessionRecorderRef.current = restarted;
    }

    setMessages([{
      id: 'welcome',
      role: 'model',
      text: welcomeText,
      lessonPlanRef: lessonPlan ? getLessonPlanRef(lessonPlan) : undefined,
    }]);

    setInput('');
    setDynamicSuggestionsMap(null);
    setIsPinnedToBottom(true);
  };

  const cancelActiveInferenceAndWait = useCallback(async () => {
    const request = activeRequestRef.current;
    if (!request) return;
    request.cancelled = true;
    request.abortController.abort();
    try {
      await recordCancellationRef.current(request);
    } catch (error: unknown) {
      setCaptureError(error instanceof Error
        ? `The cancelled request could not be finalized in research storage: ${error.message}`
        : 'The cancelled request could not be finalized in research storage.');
      throw error;
    }
    if (activeRequestRef.current === request) activeRequestRef.current = null;
    setIsThinking(false);
    onPointers?.([]);
    if (request.inputToRestore !== undefined) setInput(request.inputToRestore);

    // Remove only this request's placeholder. A later request must never be
    // affected if the cancelled promise settles after a case switch.
    if (request.botMessageId) {
      setMessages(prev => prev.filter(message => message.id !== request.botMessageId));
    }
  }, [onPointers]);

  const handleCancel = () => {
    void cancelActiveInferenceAndWait().catch(() => undefined);
  };

  useEffect(() => {
    onInferenceBusyChange?.(isThinking);
  }, [isThinking, onInferenceBusyChange]);

  useEffect(() => {
    onCancelInferenceReady?.(cancelActiveInferenceAndWait);
    return () => onCancelInferenceReady?.(null);
  }, [cancelActiveInferenceAndWait, onCancelInferenceReady]);

  const handleSendMessage = async (
    text: string = input,
    promptOverride?: string,
    inputSource: 'typed' | 'lesson_hint' | 'retry' = 'typed',
    hintId?: string,
  ) => {
    const finalText = promptOverride || text;
    if (!finalText.trim()) return;

    // A study change invalidates the old request during render, before effects
    // run. Let the new study proceed, but reject duplicate events for one study.
    const existingRequest = activeRequestRef.current;
    if (existingRequest && existingRequest.studySessionKey !== studySessionKey) {
      existingRequest.cancelled = true;
      existingRequest.abortController.abort();
      void recordCancellation(existingRequest).catch(() => undefined);
      activeRequestRef.current = null;
    }
    if (activeRequestRef.current) return;

    // BYOK gate: if the visitor hasn't connected OpenRouter yet, open the Connect
    // modal instead of erroring — they've already seen the case; this is the ask.
    if (provider === 'openrouter' && !hasKey()) {
      if (lockedTutor) {
        setCaptureError('The frozen study cannot send a model request because OpenRouter is not connected. Exit the study and ask the study team for help.');
        return;
      }
      setShowConnectModal(true);
      return;
    }

    const turnId = crypto.randomUUID();
    // Research Mode writes only to its isolated ResearchStore. It must never
    // dual-write participant activity into the ordinary SessionStore.
    const turnRecorder = lockedTutor ? null : ensureSessionRecorder();

    // Capture in the same synchronous event turn as Send/Enter. Lesson lookup is
    // asynchronous, so capturing after it could attach a later frame or miss an
    // annotation that was present when the learner submitted.
    const capture = captureCurrentView();
    if (!capture?.image) {
      recordSessionEvent(turnRecorder, {
        type: 'view_capture_failed',
        turnId,
        reason: activeSeriesInfo?.instanceCount ? 'viewer_loading' : 'no_frame',
      });
      setCaptureError('The current view is still loading. Wait for the image to appear, then submit again.');
      return;
    }

    recordSessionEvent(turnRecorder, {
      type: 'view_capture_succeeded',
      turnId,
      ...capture.viewSnapshot,
    });

    // React state is not a synchronous mutex. Own all later work with a unique
    // request identity acquired before the first await.
    const request: ActiveRequest = {
      id: ++requestSequenceRef.current,
      studySessionKey,
      cancelled: false,
      abortController: new AbortController(),
      turnId,
      recorder: turnRecorder,
      requestedModelId: safeSessionModelId(
        lockedTutor?.runtime.openRouterPolicy.model ?? getModel(),
      ),
      ...(lockedTutor
        ? { expectedSystemPromptSha256: lockedTutor.runtime.expectedSystemPromptSha256 }
        : {}),
      startedAt: Date.now(),
      terminalRecorded: false,
      ...(lockedTutor ? { research: lockedTutor.research } : {}),
      inputToRestore: promptOverride ? undefined : input,
    };
    activeRequestRef.current = request;
    // Close the sibling Finish-button race in the same event turn as Send.
    onInferenceBusyChange?.(true);
    setIsThinking(true);
    setCaptureError(null);
    onPointers?.([]);
    if (!promptOverride) setInput('');
    if (inputSource === 'lesson_hint') {
      if (hintId) {
        recordSessionEvent(turnRecorder, {
          type: 'learner_message_submitted',
          turnId,
          inputSource,
          hintId,
          learnerLevel,
          mode,
        });
      }
    } else {
      recordSessionEvent(turnRecorder, {
        type: 'learner_message_submitted',
        turnId,
        inputSource,
        learnerLevel,
        mode,
      });
    }

    if (request.research) {
      try {
        const fingerprint = await fingerprintResearchCapture(capture);
        if (!isCurrentRequest(request)) return;
        const annotation = capture.viewSnapshot.annotation;
        await request.research.recorder.record({
          type: 'capture_recorded',
          caseStepId: request.research.caseStepId,
          artifactKind: capture.viewSnapshot.artifactKind,
          frameIndex: capture.viewSnapshot.frameIndex,
          frameCount: capture.viewSnapshot.frameCount,
          ...fingerprint,
          annotation: {
            present: annotation.present,
            measurementCount: annotation.measurementCount,
            segmentedFrameCount: annotation.segmentedFrameCount,
            activeFrameLabelCount: annotation.activeFrameLabelCount,
            revision: annotation.revision,
          },
        });
        if (!isCurrentRequest(request)) return;
        await request.research.recorder.record({
          type: 'learner_turn_submitted',
          caseStepId: request.research.caseStepId,
          inputSource,
          mode: lockedTutor!.mode,
          ...(inputSource === 'lesson_hint' && hintId ? { hintId } : {}),
        });
        if (!isCurrentRequest(request)) return;
      } catch (error) {
        if (!isCurrentRequest(request)) return;
        request.terminalRecorded = true;
        request.abortController.abort();
        activeRequestRef.current = null;
        setIsThinking(false);
        if (request.inputToRestore !== undefined) setInput(request.inputToRestore);
        setCaptureError(error instanceof Error
          ? `Research collection stopped before inference: ${error.message}`
          : 'Research collection stopped before inference because persistent storage failed.');
        return;
      }
    }

    const imageToSend = capture.image;
    const capturedSliceInfo = { slice: capture.slice, total: capture.total, label: capture.label };
    let capturedViewLabel = capturedSliceInfo.label || studyMetadata?.description;
    if (!capturedViewLabel || capturedViewLabel === 'No Description' || capturedViewLabel === 'OT') {
      capturedViewLabel = domain.captureLabel(studyMetadata?.modality || '');
    }
    const userMessageId = `request-${request.id}-user`;
    const knownLessonRef = lessonPlan ? getLessonPlanRef(lessonPlan) : undefined;

    // Keep the exact send-time evidence on the learner's message. It remains
    // visible while inference is pending and if prompt resolution or inference
    // later fails.
    setMessages((previous) => [...previous, {
      id: userMessageId,
      role: 'user',
      text: finalText,
      hasAttachment: true,
      ...(knownLessonRef ? { lessonPlanRef: knownLessonRef } : {}),
      attachedSliceThumbnailDataUrl: imageToSend,
      attachedSliceIndex: capturedSliceInfo.slice,
      attachedFrameCount: capturedSliceInfo.total,
      attachedSequenceLabel: capturedViewLabel,
    }]);
    setIsPinnedToBottom(true);

    let activeLesson = lockedTutor?.runtime.lessonPlan ?? lessonPlan;
    if (!activeLesson && studyMetadata?.studyId && !lockedTutor) {
      try {
        const casePackage = await requireCasePackage(studyMetadata.studyId);
        if (!isCurrentRequest(request)) return;
        activeLesson = await requireLessonPlanForCase(casePackage);
        if (!isCurrentRequest(request)) return;
        setLessonPlan(activeLesson);
        setLessonLoadError(null);
      } catch (error) {
        if (!isCurrentRequest(request)) return;
        const message = error instanceof Error ? error.message : 'The versioned lesson could not be loaded.';
        if (!request.terminalRecorded) {
          request.terminalRecorded = true;
          if (request.research) {
            await recordResearchFailure(request, 'prompt_resolution_failed', false)
              .catch(() => undefined);
          } else {
            recordSessionEvent(request.recorder, {
              type: 'model_response_failed',
              turnId: request.turnId,
              gateway: 'openrouter',
              requestedModelId: request.requestedModelId,
              errorCode: 'prompt_resolution_failed',
              latencyMs: Math.max(0, Date.now() - request.startedAt),
              retryable: false,
            });
          }
        }
        setLessonLoadError(message);
        setCaptureError(`Lesson unavailable: ${message}`);
        if (request.inputToRestore !== undefined) setInput(request.inputToRestore);
        setIsThinking(false);
        activeRequestRef.current = null;
        return;
      }
    }
    if (!activeLesson) {
      if (!isCurrentRequest(request)) return;
      if (!request.terminalRecorded) {
        request.terminalRecorded = true;
        if (request.research) {
          await recordResearchFailure(request, 'prompt_resolution_failed', false)
            .catch(() => undefined);
        } else {
          recordSessionEvent(request.recorder, {
            type: 'model_response_failed',
            turnId: request.turnId,
            gateway: 'openrouter',
            requestedModelId: request.requestedModelId,
            errorCode: 'prompt_resolution_failed',
            latencyMs: Math.max(0, Date.now() - request.startedAt),
            retryable: false,
          });
        }
      }
      setCaptureError('Lesson unavailable. Return to the case list and open a registered teaching case.');
      if (request.inputToRestore !== undefined) setInput(request.inputToRestore);
      setIsThinking(false);
      activeRequestRef.current = null;
      return;
    }
    if (!isCurrentRequest(request)) return;
    const activeLessonRef = getLessonPlanRef(activeLesson);
    setMessages((previous) => previous.map((message) => (
      message.id === userMessageId
        ? { ...message, lessonPlanRef: activeLessonRef }
        : message
    )));

    // Build conversation history as context (include welcome message + prior exchanges)
    const historyWindowMessages = lockedTutor?.runtime.historyWindowMessages ?? 10;
    const historyMessages = historyWindowMessages === 0
      ? []
      : messages.slice(-historyWindowMessages);
    const historyLines = historyMessages
      .filter(m => m.text) // skip empty thinking placeholders
      .map(m => m.role === 'user' ? `Student: ${m.text}` : `Tutor: ${m.text}`)
      .join('\n\n');

    let promptToSend = `[CONVERSATION HISTORY]\n${historyLines}\n\n[CURRENT MESSAGE]\nStudent: ${finalText}`;

    // Only mention image context if the student references the image or tries to discuss a specific finding
    if (!imageToSend) {
      promptToSend += '\n\n[NOTE: No image is currently captured. Only ask the student to capture an image if they specifically reference something they see in the viewer. If they are answering a general question or discussing concepts, respond normally without mentioning image capture.]';
    }
    
    // Inject study/series metadata as context for all modes
    if (studyMetadata) {
        const modalityLabel = domain.contextLabel(studyMetadata.modality);
        promptToSend += `\n\n[Study Context: ${modalityLabel}, ${studyMetadata.description}`;
        if (activeSeriesInfo) promptToSend += `, Series: ${activeSeriesInfo.description}`;
        if (capturedSliceInfo) promptToSend += `, Captured: ${capturedSliceInfo.label || 'slice'} ${capturedSliceInfo.slice}/${capturedSliceInfo.total || '?'}`;
        else if (cursor) promptToSend += `, Current frame: ${cursor.frameIndex + 1}`;
        promptToSend += ']';
    }

    const botMsgId = `request-${request.id}-model`;
    request.botMessageId = botMsgId;

    // 2. Add "Thinking" Placeholder (Initially empty text triggers thinking bubble)
    setMessages(prev => [...prev, { 
        id: botMsgId, 
        role: 'model', 
        text: '', 
        isThinking: mode === 'deep_think',
        lessonPlanRef: activeLessonRef,
    }]);

    try {
        let fullText = '';
        const inferenceResult = await teachingEngine.runTurn(
            promptToSend,
            mode,
            learnerLevel,
            imageToSend,
            (chunk, sources, toolCalls, suggestionsPayload, fullTextReplace, pointersPayload) => {
                // Every stream side effect is owned by this exact request. An
                // older promise cannot write into a switched case or later turn.
                if (!isCurrentRequest(request)) return;

                if (toolCalls && onJumpToSlice) {
                    toolCalls.forEach(call => {
                        if (call.name === 'set_cursor_frame') {
                            const idx = Math.round(call.args.index);
                            if (!isNaN(idx)) onJumpToSlice(idx);
                        }
                    });
                }

                // Handle Inline Suggestions from Stream
                if (suggestionsPayload) {
                    setDynamicSuggestionsMap(suggestionsPayload);
                }

                // Handle AI Pointers (visual indicators on the image)
                if (pointersPayload && onPointers) {
                    onPointers(pointersPayload);
                }

                if (fullTextReplace !== undefined) {
                    fullText = fullTextReplace;
                } else {
                    fullText += chunk;
                }

                setMessages(prev => prev.map(m => m.id === botMsgId ? {
                    ...m,
                    text: fullText,
                    sources: sources || m.sources
                } : m));
            },
            provider,
            domain.key,
            studyMetadata?.studyId,
            request.abortController.signal,
            request.requestedModelId,
            lockedTutor?.runtime,
        );
        if (isCurrentRequest(request) && !request.terminalRecorded) {
          if (request.research) {
            await writeResearchTerminal(request, () => request.research!.recorder.record({
                type: 'model_turn_completed',
                caseStepId: request.research!.caseStepId,
                systemPromptSha256: inferenceResult.promptSha256,
                inferenceConfigSha256: request.research!.inferenceConfigSha256,
                requestedModelId: request.requestedModelId,
                ...(inferenceResult.resolvedModelId
                  ? { resolvedModelId: inferenceResult.resolvedModelId }
                  : {}),
                ...(inferenceResult.upstreamProviderId
                  ? { upstreamProviderId: inferenceResult.upstreamProviderId }
                  : {}),
                latencyMs: inferenceResult.latencyMs,
                ...(inferenceResult.usage?.promptTokens !== undefined
                  ? { promptTokens: inferenceResult.usage.promptTokens }
                  : {}),
                ...(inferenceResult.usage?.completionTokens !== undefined
                  ? { completionTokens: inferenceResult.usage.completionTokens }
                  : {}),
                ...(inferenceResult.usage?.totalTokens !== undefined
                  ? { totalTokens: inferenceResult.usage.totalTokens }
                  : {}),
                ...(inferenceResult.finishReason
                  ? { finishReason: inferenceResult.finishReason }
                  : {}),
              }));
            if (!isCurrentRequest(request)) return;
          }
          if (!request.research) {
            request.terminalRecorded = true;
            recordSessionEvent(request.recorder, {
              type: 'model_response_completed',
              turnId: request.turnId,
              promptSha256: inferenceResult.promptSha256,
              gateway: 'openrouter',
              requestedModelId: request.requestedModelId,
              ...(inferenceResult.resolvedModelId
                ? { resolvedModelId: inferenceResult.resolvedModelId }
                : {}),
              ...(inferenceResult.upstreamProviderId
                ? { upstreamProviderId: inferenceResult.upstreamProviderId }
                : {}),
              latencyMs: inferenceResult.latencyMs,
              ...(inferenceResult.usage ? { usage: inferenceResult.usage } : {}),
              ...(inferenceResult.finishReason ? { finishReason: inferenceResult.finishReason } : {}),
            });
          }
        }
    } catch (error: unknown) {
        // If cancelled, do not render error
        if (!isCurrentRequest(request)) return;

        const safeError = normalizeInferenceFailure(error);
        if (!request.terminalRecorded) {
          if (request.research) {
            if (safeError?.deviation) {
              await request.research.recorder.record({
                type: 'protocol_deviation',
                caseStepId: request.research.caseStepId,
                code: safeError.deviation.code,
                ...(safeError.deviation.expectedId && safeError.deviation.observedId
                  ? {
                      expectedId: safeError.deviation.expectedId,
                      observedId: safeError.deviation.observedId,
                    }
                  : {}),
              }).catch(() => undefined);
            }
            await writeResearchTerminal(
              request,
              () => recordResearchFailure(
                request,
                safeError.code,
                safeError.retryable,
                safeError?.httpStatus,
              ),
            ).catch(() => undefined);
          } else {
            request.terminalRecorded = true;
            recordSessionEvent(request.recorder, {
              type: 'model_response_failed',
              turnId: request.turnId,
              gateway: 'openrouter',
              requestedModelId: request.requestedModelId,
              errorCode: safeError.code,
              ...(safeError?.httpStatus ? { httpStatus: safeError.httpStatus } : {}),
              latencyMs: Math.max(0, Date.now() - request.startedAt),
              retryable: safeError.retryable,
            });
          }
        }

        // 1. Remove the placeholder bot message
        setMessages(prev => prev.filter(m => m.id !== botMsgId));
        
        // 2. Restore input if it was typed by user (not a suggestion click)
        if (request.inputToRestore !== undefined) {
            setInput(request.inputToRestore);
        }

        // 3. Add Error Message Card
        const errorMessage: ChatMessage = {
            id: Date.now().toString(),
            role: 'error',
            text: safeError.displayMessage,
            originalPrompt: finalText,
            lessonPlanRef: activeLessonRef,
        };
        setMessages(prev => [...prev, errorMessage]);
        setIsPinnedToBottom(true);
    } finally {
        if (isCurrentRequest(request)) {
            if (request.research && !request.terminalRecorded) {
                setCaptureError('The model request ended, but its terminal research record could not be saved. Finish is blocked. Use Exit study to retry a safe terminal write, or ask the study team for help.');
                return;
            }
            setIsThinking(false);
            activeRequestRef.current = null;
        }
    }
  };

  const getProviderLabel = () => {
      switch(provider) {
          case 'openrouter': return byokModelLabel;
          case 'claude': return 'Claude Opus';
          case 'openai': return 'GPT-5.4 Pro';
          case 'gemini': return 'Gemini Pro';
          default: return provider;
      }
  };

  const getLearnerLevelShortLabel = (id: string) => {
      switch(id) {
          case 'highschool': return "HS";
          case 'undergrad': return "Undergrad";
          case 'ms_preclinical': return "Pre-Step 1";
          case 'ms_clinical': return "Post-Step 1";
          case 'resident': return "Resident";
          default: return "Gen";
      }
  };

  const getLearnerLevelTooltip = (id: string) => {
      switch(id) {
          case 'highschool': return "High school level explanation";
          case 'undergrad': return "Undergraduate biology/pre-med";
          case 'ms_preclinical': return "Pre-clinical medical student (MS1-MS2, Step 1 focus)";
          case 'ms_clinical': return "Clinical medical student (MS3-MS4, Step 2 focus)";
          case 'resident': return "Resident level explanation";
          default: return "";
      }
  };

  return (
    <div data-tour-id="ai-panel" className="flex flex-col h-full bg-[#0f1011]">
      {/* Main Header */}
      <div className="h-14 bg-[#161718] border-b border-white/[0.06] px-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 text-[#f7f8f8] font-bold">
          <Sparkles className="w-4 h-4 text-blue-400" /> <span>AI Tutor</span>
          {onStartTour && !lockedTutor && (
              <button
                  onClick={onStartTour}
                  className="ml-1 min-h-11 min-w-11 text-[10px] text-blue-300 hover:text-white inline-flex items-center justify-center rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                  title="Tour the AI tutor"
                  aria-label="Tour the AI tutor"
              >
                  <HelpCircle className="w-3.5 h-3.5" />
              </button>
          )}
        </div>
        {!lockedTutor && <button
            data-tour-id="ai-trash"
            onClick={handleClearChat}
            className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg bg-[#1e1f21] border border-white/[0.08] text-[#8a8f98] hover:text-red-400 hover:border-red-500/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            title="Clear Chat / New Conversation"
            aria-label="Clear chat and start a new conversation"
        >
            <Trash2 className="w-4 h-4" />
        </button>}
      </div>
      
      {/* Status Bar */}
      <div className="bg-[#161718]/50 border-b border-white/[0.06] p-2 flex flex-col items-start gap-2 text-[10px] flex-shrink-0">
          <div className="flex flex-wrap items-center gap-2">
              <span data-tour-id="ai-provider" className="text-[10px] text-blue-300/70 font-medium">
                {byokConnected ? `Powered by ${byokModelLabel}` : 'Bring your own AI'}
              </span>
              {!lockedTutor ? <button
                onClick={() => setShowConnectModal(true)}
                className="min-h-11 flex items-center gap-1 text-[10px] font-semibold text-blue-400 hover:text-blue-300 px-2 rounded border border-blue-500/30 hover:border-blue-400/50 bg-blue-500/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                title={byokConnected ? 'Change model or disconnect' : 'Connect your OpenRouter account'}
              >
                <KeyRound className="w-2.5 h-2.5" />
                {byokConnected ? 'Change' : 'Connect'}
              </button> : (
                <span
                  className="inline-flex min-h-11 items-center gap-1 rounded border border-violet-500/30 bg-violet-500/5 px-2 text-[10px] font-semibold text-violet-200"
                  aria-label={`Frozen research model ${lockedTutor.runtime.openRouterPolicy.model}`}
                >
                  <LockKeyhole className="h-3 w-3" aria-hidden="true" /> Frozen condition
                </span>
              )}
              {lessonPlan && (
                <span
                  className="text-[9px] text-[#8a8f98]"
                  title={`Lesson ${lessonPlan.id} version ${lessonPlan.version}, SHA-256 ${lessonPlan.manifest.sha256}`}
                >
                  Lesson v{lessonPlan.version} {lessonPlan.manifest.sha256.slice(0, 7)}
                </span>
              )}
          </div>
          <div className="flex items-start gap-1">
               <span className="flex items-center gap-1 text-emerald-400 font-medium">
                   <ImageIcon className="w-3 h-3" />
                   Nothing is sent to a model until you submit a question
               </span>
          </div>
      </div>

      {lessonLoadError && (
        <div role="alert" className="border-b border-red-500/20 bg-red-950/30 px-3 py-2 text-[11px] text-red-200">
          Versioned lesson unavailable: {lessonLoadError}
        </div>
      )}

      {/* Messages Container with Independent Scrolling Context */}
      <div className="flex-1 overflow-hidden relative flex flex-col">
        <div className="flex-1 relative min-h-0">
            <div 
                className="absolute inset-0 overflow-y-auto p-4 space-y-5 no-scrollbar" 
                ref={chatContainerRef}
                onScroll={handleScroll}
                role="log"
                aria-live="polite"
                aria-relevant="additions text"
                aria-label="AI tutor conversation"
                aria-busy={isThinking}
            >
                {messages.map((m) => {
                    if (m.role === 'error') {
                        return (
                            <div key={m.id} className="flex flex-col items-center animate-in fade-in slide-in-from-bottom-2">
                                <div className="max-w-[90%] w-full bg-red-950/40 border border-red-500/30 rounded-xl p-3 flex items-start gap-3 shadow-lg">
                                    <div className="mt-0.5 p-1 bg-red-500/10 rounded-full">
                                        <AlertTriangle className="w-4 h-4 text-red-400" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-xs font-bold text-red-300 mb-1">AI Request Failed</div>
                                        <div className="text-xs text-red-200/80 leading-relaxed mb-2">
                                            {m.text}
                                        </div>
                                        <div className="text-[10px] text-red-400/60 mb-2">
                                            Your question has been preserved above.
                                        </div>
                                        {m.originalPrompt && (
                                            <button 
                                                onClick={() => handleSendMessage(m.originalPrompt, undefined, 'retry')}
                                                className="min-h-11 flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-300 text-xs rounded-md border border-red-500/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                                                aria-label="Retry question with current view"
                                            >
                                                <RotateCcw className="w-3 h-3" /> Retry with current view
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    }

                    // THINKING BUBBLE (Render if role=model and text is empty)
                    if (m.role === 'model' && !m.text) {
                        let subtitleText = "";
                        const pLabel = getProviderLabel();
                        if (mode === 'deep_think') {
                            subtitleText = `${pLabel} is reasoning step by step before answering.`;
                        } else if (mode === 'search') {
                            subtitleText = `${pLabel} is searching and synthesizing key findings.`;
                        } else {
                            const levelLabels: Record<string, string> = {
                                highschool: "High school",
                                undergrad: "Undergrad",
                                ms_preclinical: "Pre-Step 1",
                                ms_clinical: "Post-Step 1",
                                resident: "Resident"
                            };
                            const label = levelLabels[learnerLevel] || "Med";
                            subtitleText = `${pLabel} is preparing a ${label}-level explanation.`;
                        }

                        return (
                            <div key={m.id} className="flex flex-col items-start animate-in fade-in slide-in-from-bottom-2 duration-300 w-full">
                                <div className="max-w-[95%] rounded-xl p-4 shadow-sm bg-[#161718] border border-white/[0.06]">

                                   {/* Title Row */}
                                   <div className="flex items-center gap-2 mb-2">
                                       <Sparkles className="w-4 h-4 text-blue-400 animate-pulse" />
                                       <span className="text-blue-100 font-bold text-sm">Teaching in progress</span>
                                   </div>

                                   {/* Subtitle */}
                                   <div className="text-xs text-[#d0d6e0] mb-3 leading-relaxed font-medium">
                                       {subtitleText}
                                   </div>

                                   {/* Status Row */}
                                   <div className="flex items-center gap-2 text-xs text-[#8a8f98]">
                                       <div className="flex space-x-1">
                                            <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-[bounce_1s_infinite_-0.3s]"></div>
                                            <div className="w-1.5 h-1.5 bg-blue-300 rounded-full animate-[bounce_1s_infinite_-0.15s]"></div>
                                            <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-[bounce_1s_infinite]"></div>
                                       </div>
                                       <span className="text-blue-200/60">Generating your answer...</span>
                                   </div>
                                </div>
                            </div>
                        );
                    }

                    return (
                    <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                        <div className={`max-w-[95%] rounded-xl p-3 shadow-sm ${m.role === 'user' ? 'bg-[#1e1f21] text-[#d0d6e0] border-l-2 border-blue-500/30' : 'bg-[#161718] text-[#d0d6e0] border border-white/[0.06]'}`}>
                            
                            {m.role === 'user' && m.attachedSliceThumbnailDataUrl && (
                                <div className="flex items-center gap-3 mb-3 pb-3 border-b border-white/10">
                                    <img 
                                        src={m.attachedSliceThumbnailDataUrl} 
                                        className="w-16 h-16 rounded object-contain border border-white/10 bg-black/50"
                                        alt={`Captured view sent with this question${m.attachedSequenceLabel ? `: ${m.attachedSequenceLabel}` : ''}`}
                                    />
                                    <div className="flex flex-col">
                                        <span className="text-[10px] uppercase font-bold text-slate-400 mb-0.5">Captured view</span>
                                        <span className="text-[11px] text-slate-300 font-medium">
                                        View {m.attachedSliceIndex ?? 1} of {m.attachedFrameCount ?? 1} • {m.attachedSequenceLabel || 'Medical image'}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {m.hasAttachment && m.role === 'user' && !m.attachedSliceThumbnailDataUrl && (
                                <div
                                    className="mb-2 text-xs text-blue-300 bg-blue-950/50 px-2 py-1 rounded w-fit flex gap-1 cursor-help"
                                    title="The AI is using the view you captured for this question."
                                >
                                    <ImageIcon className="w-3 h-3"/> Using captured view
                                </div>
                            )}
                            
                            <MarkdownText content={m.text} />
                            {m.sources && m.sources.length > 0 && (
                                <div className="mt-3 pt-2 border-t border-white/10">
                                    <div className="text-[10px] font-bold text-slate-500 mb-1 flex items-center gap-1"><Globe className="w-3 h-3"/> Sources</div>
                                    {m.sources.map((src, i) => <a key={i} href={src.uri} target="_blank" className="block text-xs text-blue-400 truncate hover:underline">{src.title || src.uri}</a>)}
                                </div>
                            )}
                        </div>
                    </div>
                )})}

                {!isThinking && currentSuggestions.length > 0 && (
                    <div data-tour-id="ai-suggestions" className="mt-3 animate-in fade-in duration-300">
                        <div className="mb-2 text-[10px] text-slate-500 uppercase font-bold ml-1 flex items-center gap-2">
                            <span>Suggested Follow-ups</span>
                            {introQuestionsForLevel && introQuestionsForLevel.length > 0 && (
                                <span
                                    className="text-emerald-400 normal-case font-medium"
                                    title="These are pre-cached, human-reviewed answers. Clicking is free and instant."
                                >
                                    Free · instant · no key
                                </span>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-2 mb-4">
                            {currentSuggestions.map((sugg) => (
                                <button
                                    key={sugg.key}
                                    onClick={() => sendSuggestion(sugg)}
                                    className="min-h-11 text-left text-xs bg-[#1e1f21] hover:bg-[#28282c] text-blue-200 px-3 py-1.5 rounded-full border border-white/[0.08] transition-all active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                                    aria-label={
                                        sugg.cachedAnswer !== undefined
                                            ? `Show pre-cached answer for: ${sugg.label}`
                                            : `Send suggested question with current view: ${sugg.label}`
                                    }
                                >
                                    {sugg.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Jump To Latest Pill */}
            {!isPinnedToBottom && (
                <button
                    onClick={scrollToBottom}
                    className="absolute bottom-4 left-1/2 -translate-x-1/2 min-h-11 bg-[#1e1f21]/90 hover:bg-[#28282c] text-blue-300 border border-blue-500/30 shadow-lg rounded-full px-4 py-1.5 text-xs font-bold flex items-center gap-2 transition-all animate-in fade-in slide-in-from-bottom-2 z-10 backdrop-blur-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                    <ArrowDown className="w-3.5 h-3.5" />
                    Jump to latest
                </button>
            )}
        </div>

        <div className="p-4 bg-[#161718] border-t border-white/[0.06] flex-shrink-0">
            {/* Compact Learner Level Row */}
            {!lockedTutor && <div data-tour-id="teaching-levels" className="flex items-center justify-end mb-2 gap-2 text-[11px] text-[#8a8f98]">
                <div className="inline-flex items-center rounded-lg bg-[#0f1011]/50 border border-white/[0.08] p-0.5 gap-0.5">
                    <button type="button" onClick={() => { setLearnerLevel('highschool'); setShowMedPicker(false); }}
                      className={`min-h-11 px-2 py-0.5 rounded-md text-[10px] font-bold transition-all ${learnerLevel === 'highschool' ? 'bg-blue-600 text-white shadow-sm' : 'text-[#8a8f98] hover:bg-[#1e1f21] hover:text-[#d0d6e0]'}`}>
                      HS
                    </button>
                    <button type="button" onClick={() => { setLearnerLevel('undergrad'); setShowMedPicker(false); }}
                      className={`min-h-11 px-2 py-0.5 rounded-md text-[10px] font-bold transition-all ${learnerLevel === 'undergrad' ? 'bg-blue-600 text-white shadow-sm' : 'text-[#8a8f98] hover:bg-[#1e1f21] hover:text-[#d0d6e0]'}`}>
                      Undergrad
                    </button>
                    {/* Med button with popover */}
                    <div className="relative">
                      <button type="button" onClick={() => setShowMedPicker(prev => !prev)}
                        className={`min-h-11 px-2 py-0.5 rounded-md text-[10px] font-bold transition-all ${(learnerLevel === 'ms_preclinical' || learnerLevel === 'ms_clinical') ? 'bg-blue-600 text-white shadow-sm' : 'text-[#8a8f98] hover:bg-[#1e1f21] hover:text-[#d0d6e0]'}`}>
                        Med{(learnerLevel === 'ms_preclinical' || learnerLevel === 'ms_clinical') ? (learnerLevel === 'ms_preclinical' ? ' (Pre)' : ' (Post)') : ''}
                      </button>
                      {showMedPicker && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 flex gap-1 bg-[#1e1f21] border border-white/[0.12] rounded-lg p-1 shadow-xl z-30 whitespace-nowrap">
                          <button type="button" onClick={() => { setLearnerLevel('ms_preclinical'); setShowMedPicker(false); }}
                            className={`min-h-11 px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${learnerLevel === 'ms_preclinical' ? 'bg-blue-600 text-white' : 'text-[#8a8f98] hover:bg-[#2a2d35] hover:text-white'}`}>
                            Pre-Step 1
                          </button>
                          <button type="button" onClick={() => { setLearnerLevel('ms_clinical'); setShowMedPicker(false); }}
                            className={`min-h-11 px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${learnerLevel === 'ms_clinical' ? 'bg-blue-600 text-white' : 'text-[#8a8f98] hover:bg-[#2a2d35] hover:text-white'}`}>
                            Post-Step 1
                          </button>
                          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-[#1e1f21]" />
                        </div>
                      )}
                    </div>
                    <button type="button" onClick={() => { setLearnerLevel('resident'); setShowMedPicker(false); }}
                      className={`min-h-11 px-2 py-0.5 rounded-md text-[10px] font-bold transition-all ${learnerLevel === 'resident' ? 'bg-blue-600 text-white shadow-sm' : 'text-[#8a8f98] hover:bg-[#1e1f21] hover:text-[#d0d6e0]'}`}>
                      Resident
                    </button>
                </div>
            </div>}

            {/* Input Area */}
            <div className="relative flex-1">
                {(() => {
                    const freeTypingLocked = !lockedTutor && !byokConnected;
                    const placeholder = freeTypingLocked
                        ? 'Connect OpenRouter to type a new question'
                        : mode === 'deep_think'
                            ? 'Ask complex question...'
                            : 'Ask a question...';
                    return (
                        <input
                            className="w-full min-h-11 bg-[#0f1011] border border-white/[0.08] rounded-lg pr-12 pl-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none text-[#d0d6e0] placeholder:text-[#62666d] shadow-inner disabled:opacity-60 disabled:cursor-not-allowed"
                            placeholder={placeholder}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                if (freeTypingLocked) {
                                  setShowConnectModal(true);
                                  return;
                                }
                                void handleSendMessage();
                              }
                            }}
                            onFocus={() => {
                                if (freeTypingLocked) setShowConnectModal(true);
                            }}
                            disabled={isThinking}
                            aria-label="Question for the AI tutor"
                        />
                    );
                })()}
                <button
                    onClick={() => handleSendMessage()}
                    disabled={!input.trim() || isThinking}
                    className="absolute right-0 top-1/2 -translate-y-1/2 min-h-11 min-w-11 inline-flex items-center justify-center text-blue-500 hover:text-blue-400 disabled:opacity-50 transition-colors rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                    aria-label="Send view and question"
                >
                    <Send className="w-4 h-4" />
                </button>
            </div>

            {/* Dynamic Status / Hint Footer */}
            <div data-tour-id="image-status" className="mt-2 text-[11px] text-[#8a8f98] leading-tight min-h-[20px] flex items-center justify-between">
                {captureError ? (
                    <div role="alert" className="w-full text-red-300 bg-red-950/30 border border-red-500/20 rounded-lg px-3 py-2">
                        {captureError}
                    </div>
                ) : isThinking ? (
                    <div className="w-full flex items-center justify-between bg-blue-900/10 border border-blue-500/20 rounded-lg px-3 py-2 animate-in fade-in">
                        <div className="flex items-center gap-2.5">
                            <div className="relative flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
                            </div>
                            <span className="text-blue-200 font-medium">{getProviderLabel()} is thinking... <span className="text-blue-400/70 text-[10px] ml-1">(~10s)</span></span>
                        </div>
                        <button
                            onClick={handleCancel}
                            className="min-h-11 flex items-center gap-1.5 px-2 py-1 hover:bg-white/5 rounded text-[#8a8f98] hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                            aria-label="Cancel AI response"
                        >
                            <span className="text-[10px] font-bold uppercase tracking-wider">Cancel</span>
                            <X className="w-3 h-3" />
                        </button>
                    </div>
                ) : (
                    <div className="w-full">
                        <span>Submitting a question includes the current view. The image and chat go directly to OpenRouter and the selected model provider. Your key is stored in this browser and sent only to OpenRouter. CaseAttend servers never receive it. Do not use identifiable patient data.</span>
                    </div>
                )}
            </div>
        </div>
      </div>

      {showConnectModal && !lockedTutor && <ConnectKeyModal onClose={() => setShowConnectModal(false)} />}
    </div>
  );
};

export default AiAssistantPanel;
