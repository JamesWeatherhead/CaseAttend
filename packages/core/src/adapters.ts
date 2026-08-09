/** Stable, raw-free contract version for the headless teaching engine. */
export const CORE_CONTRACT_VERSION = '1.0' as const;
export const CORE_EVENT_SCHEMA = 'caseattend.core.event' as const;
export const CORE_MAX_ARTIFACT_BYTES = 32 * 1024 * 1024;

/** Open safe identifier (for example `general`, `adult`, or `resident`). */
export type LearnerLevelId = string;
export type LearnerLevel = LearnerLevelId;
export type TeachingMode = 'chat' | 'deep_think' | 'search';

export interface CancellationSignal {
  readonly cancelled: boolean;
  readonly reason?: 'cancelled' | 'timeout' | 'superseded';
  throwIfCancelled(): void;
}

export interface ArtifactHints {
  readonly showWindowLevel: boolean;
  readonly showSeriesSelector: boolean;
  readonly showSegmentation: boolean;
}

/** Deliberately closed: serializable case data has no arbitrary extension bag. */
export interface CaseMaterial<TCasePackage = unknown, TLessonPlan = unknown> {
  readonly id: string;
  readonly title: string;
  readonly domainId: string;
  /** Opaque host payload: core forwards it but never serializes or inspects it. */
  readonly casePackage: TCasePackage;
  /** Opaque host payload: core forwards it but never serializes or inspects it. */
  readonly lessonPlan?: TLessonPlan;
  readonly lessonId?: string;
  readonly artifactHints?: ArtifactHints;
}

export interface ArtifactReference {
  readonly id: string;
  readonly label?: string;
  readonly mimeType?: string;
  /** Optional content-addressed expectation, verified before prompt composition. */
  readonly sha256?: string;
}

export interface LoadedArtifact {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  readonly sha256?: string;
}

export interface CaseRegistry<TCase extends CaseMaterial<unknown, unknown> = CaseMaterial> {
  listCases(signal?: CancellationSignal): Promise<readonly TCase[]>;
  getCase(caseId: string, signal?: CancellationSignal): Promise<TCase | undefined>;
}

export interface ArtifactLoader<TCase extends CaseMaterial<unknown, unknown> = CaseMaterial> {
  loadArtifact(input: {
    readonly caseMaterial: TCase;
    readonly artifact: ArtifactReference;
    readonly signal?: CancellationSignal;
  }): Promise<LoadedArtifact>;
}

/** An open registry of domains: no core change is required to add a domain. */
export interface DomainPlugin<TCase extends CaseMaterial<unknown, unknown> = CaseMaterial> {
  readonly id: string;
  readonly displayName: string;
  supports(caseMaterial: TCase): boolean;
}

export interface HistoryWindowMessage {
  readonly role: 'learner' | 'assistant';
  readonly text: string;
}

export interface TurnContext {
  readonly learnerLevel: LearnerLevel;
  readonly mode: TeachingMode;
  readonly hasImage: boolean;
  readonly historyWindowMessages: readonly HistoryWindowMessage[];
}

export interface PromptRequest<TCase extends CaseMaterial<unknown, unknown> = CaseMaterial> extends TurnContext {
  readonly caseMaterial: TCase;
  readonly learnerMessage: string;
  readonly lessonId?: string;
  readonly domain: DomainPlugin<TCase>;
  readonly artifact?: { readonly id: string; readonly sha256: string; readonly mimeType: string };
}

export interface ComposedPrompt {
  /** Raw prompt: sent only to the configured inference closure. */
  readonly prompt: string;
  /** Optional host claim; core recomputes and verifies it before use. */
  readonly sha256?: string;
  readonly requestedModel?: string;
}

export interface PromptComposer<TCase extends CaseMaterial<unknown, unknown> = CaseMaterial> {
  compose(input: PromptRequest<TCase>, signal?: CancellationSignal): Promise<ComposedPrompt>;
}

export interface InferenceRequest<TCase extends CaseMaterial<unknown, unknown> = CaseMaterial> {
  readonly caseMaterial: TCase;
  readonly prompt: string;
  readonly learnerMessage: string;
  readonly context: TurnContext;
  readonly artifact?: Readonly<LoadedArtifact>;
  readonly requestedModel?: string;
  /** Core closes this callback at the terminal transition. */
  readonly onTextDelta: (delta: string) => void;
}

export interface InferenceResult {
  readonly text: string;
  readonly modelId?: string;
  readonly routeId?: string;
  readonly finishReason?: 'stop' | 'length' | 'filtered' | 'other';
  readonly usage?: Readonly<{ promptTokens?: number; completionTokens?: number; totalTokens?: number }>;
}

/** A callable closure; credential ownership remains with the host adapter. */
export type InferenceAdapter<TCase extends CaseMaterial<unknown, unknown> = CaseMaterial> = (
  request: InferenceRequest<TCase>,
  signal: CancellationSignal,
) => Promise<InferenceResult>;

export interface SessionStore { append(event: CoreEventV1): void | Promise<void>; }
export interface ResearchSink { record(event: CoreEventV1): Promise<void>; }

/** Exactly one durable output destination is selected at construction time. */
export type EventDestination =
  | { readonly kind: 'teaching'; readonly sessionStore: SessionStore; readonly researchSink?: never }
  | { readonly kind: 'research'; readonly researchSink: ResearchSink; readonly sessionStore?: never };

export interface CorePlatform {
  now(): number;
  /** Synchronous, cryptographically strong, process-unique safe identifier. */
  randomId(): string;
  sha256(bytes: Uint8Array): Promise<string>;
}

interface CoreEventBase {
  readonly schema: typeof CORE_EVENT_SCHEMA;
  readonly version: typeof CORE_CONTRACT_VERSION;
  readonly type: string;
  readonly eventId: string;
  readonly turnId: string;
  readonly occurredAtMs: number;
  readonly caseId: string;
  readonly domainId: string;
}

export interface TurnStartedEvent extends CoreEventBase {
  readonly type: 'turn_started';
  readonly promptSha256: string;
  readonly lessonId?: string;
  readonly learnerLevel: LearnerLevel;
  readonly mode: TeachingMode;
  readonly hasImage: boolean;
  readonly historyMessageCount: number;
  readonly artifact?: { readonly id: string; readonly sha256: string; readonly mimeType: string };
}
export interface TurnSucceededEvent extends CoreEventBase {
  readonly type: 'turn_succeeded';
  readonly promptSha256: string;
  readonly requestedModelId?: string;
  readonly modelId?: string;
  readonly routeId?: string;
  readonly finishReason?: 'stop' | 'length' | 'filtered' | 'other';
  readonly latencyMs: number;
  readonly usage?: Readonly<{ promptTokens?: number; completionTokens?: number; totalTokens?: number }>;
}
export interface TurnFailedEvent extends CoreEventBase {
  readonly type: 'turn_failed';
  readonly errorCode: 'configuration' | 'not_found' | 'invalid_input' | 'inference_failed' | 'persistence_failed';
  readonly latencyMs: number;
}
export interface TurnCancelledEvent extends CoreEventBase {
  readonly type: 'turn_cancelled';
  readonly latencyMs: number;
}
export type CoreEventV1 = TurnStartedEvent | TurnSucceededEvent | TurnFailedEvent | TurnCancelledEvent;

export interface RunTurnInput extends TurnContext {
  readonly caseId: string;
  readonly learnerMessage: string;
  readonly lessonId?: string;
  readonly artifact?: ArtifactReference;
  readonly signal?: CancellationSignal;
  readonly onTextDelta?: (delta: string) => void;
}
export interface RunTurnResult {
  readonly text: string;
  readonly turnId: string;
  readonly promptSha256: string;
  readonly modelId?: string;
  readonly routeId?: string;
  readonly finishReason?: 'stop' | 'length' | 'filtered' | 'other';
  readonly usage?: Readonly<{ promptTokens?: number; completionTokens?: number; totalTokens?: number }>;
}
export interface CaseAttendEngine<TCase extends CaseMaterial<unknown, unknown> = CaseMaterial> {
  listCases(signal?: CancellationSignal): Promise<readonly TCase[]>;
  loadCase(caseId: string, signal?: CancellationSignal): Promise<TCase>;
  getDomain(caseMaterial: TCase): DomainPlugin<TCase>;
  loadArtifact(caseId: string, artifact: ArtifactReference, signal?: CancellationSignal): Promise<LoadedArtifact>;
  runTurn(input: RunTurnInput): Promise<RunTurnResult>;
  toJSON(): { readonly contractVersion: typeof CORE_CONTRACT_VERSION };
}
export interface CreateCaseAttendEngineOptions<TCase extends CaseMaterial<unknown, unknown> = CaseMaterial> {
  readonly caseRegistry: CaseRegistry<TCase>;
  readonly artifactLoader: ArtifactLoader<TCase>;
  readonly domains: readonly DomainPlugin<TCase>[];
  readonly promptComposer: PromptComposer<TCase>;
  readonly inference: InferenceAdapter<TCase>;
  readonly destination: EventDestination;
  readonly platform: CorePlatform;
}
