import { APP_VERSION } from '../appVersion';
import {
  SESSION_EVENT_SCHEMA,
  SESSION_EVENT_SCHEMA_VERSION,
  assertSessionEventV1,
  type SessionCasePackageRef,
  type SessionEndedEvent,
  type SessionEventPayloadV1,
  type SessionEventV1,
  type SessionStartedEvent,
} from '../core/sessionEvents';
import type { LessonPlanRef } from '../core/lessonPlan';
import {
  SESSION_DATA_DELETED_EVENT,
  sessionStore,
  type SessionDataDeletedDetail,
  type SessionStore,
} from './sessionStore';

export interface SessionRecorderContext {
  casePackageRef: SessionCasePackageRef;
  lessonPlanRef: LessonPlanRef;
}

export interface SessionRecorderOptions {
  store?: Pick<SessionStore, 'append'>;
  appVersion?: string;
  createId?: () => string;
  now?: () => string;
}

export const CASE_SESSION_EXIT_EVENT = 'caseattend:case-session-exit';

export interface SessionTransitionLink {
  sessionId: string;
  context: SessionRecorderContext;
  startReason: 'case_switched' | 'lesson_changed';
}

let pendingCaseTransition: SessionTransitionLink | null = null;

export function rememberCaseTransition(
  recorder: SessionRecorder,
  startReason: SessionTransitionLink['startReason'] = 'case_switched',
): void {
  pendingCaseTransition = {
    sessionId: recorder.sessionId,
    context: structuredClone(recorder.context),
    startReason,
  };
}

export function consumeCaseTransition(): SessionTransitionLink | null {
  const transition = pendingCaseTransition;
  pendingCaseTransition = null;
  return transition;
}

export function clearCaseTransition(sessionId?: string): void {
  if (!sessionId || pendingCaseTransition?.sessionId === sessionId) {
    pendingCaseTransition = null;
  }
}

// This listener deliberately lives with the module-global transition, rather
// than inside AiAssistantPanel. Catalog navigation unmounts that panel, but a
// deletion must still prevent the next case from linking to a removed session.
if (typeof window !== 'undefined') {
  window.addEventListener(SESSION_DATA_DELETED_EVENT, (event: Event) => {
    const detail = (event as CustomEvent<SessionDataDeletedDetail>).detail;
    if (!detail || typeof detail.all !== 'boolean') return;
    if (detail.all) {
      clearCaseTransition();
    } else if (typeof detail.sessionId === 'string') {
      clearCaseTransition(detail.sessionId);
    }
  });
}

function browserUuid(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * One immutable, version-bound browser-local learning session. Sequence numbers
 * are allocated synchronously so rapid UI callbacks keep their invocation order
 * even while the IndexedDB writes complete asynchronously.
 */
export class SessionRecorder {
  readonly sessionId: string;
  readonly context: SessionRecorderContext;

  private readonly store: Pick<SessionStore, 'append'>;
  private readonly appVersion: string;
  private readonly createId: () => string;
  private readonly now: () => string;
  private nextSequence = 0;
  private ended = false;

  private constructor(context: SessionRecorderContext, options: SessionRecorderOptions) {
    this.context = structuredClone(context);
    this.store = options.store ?? sessionStore;
    this.appVersion = options.appVersion ?? APP_VERSION;
    this.createId = options.createId ?? browserUuid;
    this.now = options.now ?? (() => new Date().toISOString());
    this.sessionId = this.createId();
  }

  static start(
    context: SessionRecorderContext,
    startReason: 'case_opened',
    previousSessionId?: undefined,
    options?: SessionRecorderOptions,
  ): SessionRecorder;
  static start(
    context: SessionRecorderContext,
    startReason: Exclude<SessionStartedEvent['startReason'], 'case_opened'>,
    previousSessionId: string,
    options?: SessionRecorderOptions,
  ): SessionRecorder;
  static start(
    context: SessionRecorderContext,
    startReason: SessionStartedEvent['startReason'],
    previousSessionId: string | undefined,
    options: SessionRecorderOptions = {},
  ): SessionRecorder {
    const recorder = new SessionRecorder(context, options);
    const startEvent: SessionStartedEvent = startReason === 'case_opened'
      ? { type: 'session_started', startReason }
      : {
          type: 'session_started',
          startReason,
          previousSessionId: previousSessionId as string,
        };
    void recorder.append(startEvent).catch(() => undefined);
    return recorder;
  }

  get isEnded(): boolean {
    return this.ended;
  }

  /** Stop this recorder without creating another row, used after user deletion. */
  abandon(): void {
    this.ended = true;
  }

  record(payload: Exclude<SessionEventPayloadV1, SessionStartedEvent | SessionEndedEvent>): Promise<void> {
    if (this.ended) {
      return Promise.reject(new Error(`Session ${this.sessionId} has already ended.`));
    }
    return this.append(payload);
  }

  end(reason: SessionEndedEvent['reason']): Promise<void> {
    if (this.ended) return Promise.resolve();
    this.ended = true;
    return this.append({ type: 'session_ended', reason });
  }

  private append(payload: SessionEventPayloadV1): Promise<void> {
    const event: SessionEventV1 = {
      schema: SESSION_EVENT_SCHEMA,
      schemaVersion: SESSION_EVENT_SCHEMA_VERSION,
      appVersion: this.appVersion,
      eventId: this.createId(),
      sessionId: this.sessionId,
      sequence: this.nextSequence,
      occurredAt: this.now(),
      casePackageRef: structuredClone(this.context.casePackageRef),
      lessonPlanRef: structuredClone(this.context.lessonPlanRef),
      event: structuredClone(payload),
    };
    this.nextSequence += 1;
    assertSessionEventV1(event);
    return this.store.append(event);
  }
}
