import {
  CORE_CONTRACT_VERSION,
  CORE_EVENT_SCHEMA,
  CORE_MAX_ARTIFACT_BYTES,
  type ArtifactReference,
  type ArtifactLoader,
  type CancellationSignal,
  type CaseRegistry,
  type CaseAttendEngine,
  type CaseMaterial,
  type CorePlatform,
  type CoreEventV1,
  type CreateCaseAttendEngineOptions,
  type DomainPlugin,
  type EventDestination,
  type LoadedArtifact,
  type PromptComposer,
  type ResearchSink,
  type RunTurnInput,
  type RunTurnResult,
  type SessionStore,
} from './adapters.js';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_SHA256 = /^[a-f0-9]{64}$/;
const SAFE_MODEL_ROUTE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
const SAFE_MIME_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,62}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,62}$/;
const MODES = new Set(['chat', 'deep_think', 'search']);
const FINISH_REASONS = new Set(['stop', 'length', 'filtered', 'other']);
const EVENT_ERROR_CODES = new Set(['configuration', 'not_found', 'invalid_input', 'inference_failed', 'persistence_failed']);
const MAX_TEXT_CHARACTERS = 512_000;
const MAX_STREAMED_CHARACTERS = 1_000_000;
const MAX_STREAM_DELTAS = 10_000;

export class CaseAttendCoreError extends Error {
  readonly code: 'cancelled' | 'configuration' | 'not_found' | 'invalid_input' | 'inference_failed' | 'persistence_failed';
  constructor(code: CaseAttendCoreError['code']) { super(messageFor(code)); this.name = 'CaseAttendCoreError'; this.code = code; }
}
function messageFor(code: CaseAttendCoreError['code']): string {
  if (code === 'cancelled') return 'The teaching turn was cancelled.';
  if (code === 'configuration') return 'The teaching engine is not configured for this case.';
  if (code === 'not_found') return 'The requested teaching case was not found.';
  if (code === 'invalid_input') return 'The teaching request is invalid.';
  if (code === 'persistence_failed') return 'The research record could not be saved.';
  return 'The teaching response could not be completed.';
}
function isRecord(value: unknown): value is Record<string, unknown> {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    return Object.values(Object.getOwnPropertyDescriptors(value)).every((descriptor) => Object.prototype.hasOwnProperty.call(descriptor, 'value'));
  } catch { return false; }
}
function ownKeys(value: object): string[] { return Object.keys(value); }
function hasOwn(value: object, key: string): boolean { return Object.prototype.hasOwnProperty.call(value, key); }
function exactKeys(value: unknown, keys: readonly string[], code: CaseAttendCoreError['code'] = 'invalid_input'): asserts value is Record<string, unknown> {
  try {
    if (!isRecord(value) || ownKeys(value).length !== keys.length || ownKeys(value).some((key) => !keys.includes(key))) throw new CaseAttendCoreError(code);
  } catch { throw new CaseAttendCoreError(code); }
}
function optionalExactKeys(value: unknown, required: readonly string[], optional: readonly string[], code: CaseAttendCoreError['code'] = 'invalid_input'): asserts value is Record<string, unknown> {
  try {
    if (!isRecord(value) || required.some((key) => !hasOwn(value, key)) || ownKeys(value).some((key) => !required.includes(key) && !optional.includes(key))) throw new CaseAttendCoreError(code);
  } catch { throw new CaseAttendCoreError(code); }
}
function dataProperty(value: unknown, key: string, code: CaseAttendCoreError['code'] = 'configuration'): unknown {
  try {
    if ((typeof value !== 'object' && typeof value !== 'function') || value === null) throw new CaseAttendCoreError(code);
    let cursor: object | null = value;
    while (cursor !== null) {
      const descriptor = Object.getOwnPropertyDescriptor(cursor, key);
      if (descriptor) {
        if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) throw new CaseAttendCoreError(code);
        return descriptor.value;
      }
      cursor = Object.getPrototypeOf(cursor);
    }
  } catch { throw new CaseAttendCoreError(code); }
  throw new CaseAttendCoreError(code);
}
function dataMethod<TFunction extends Function>(value: unknown, key: string): TFunction {
  const method = dataProperty(value, key);
  if (typeof method !== 'function') throw new CaseAttendCoreError('configuration');
  return method as TFunction;
}
function credentialShaped(value: string): boolean {
  return /(?:^|[-_.:/+])(?:sk|bearer)(?:[-_.:/+]|$)/i.test(value);
}
function safeId(value: unknown): asserts value is string { if (typeof value !== 'string' || !SAFE_ID.test(value) || credentialShaped(value)) throw new CaseAttendCoreError('invalid_input'); }
function safeText(value: unknown, max: number, code: CaseAttendCoreError['code'] = 'invalid_input'): asserts value is string { if (typeof value !== 'string' || value.length > max) throw new CaseAttendCoreError(code); }
function safeHash(value: unknown, code: CaseAttendCoreError['code'] = 'configuration'): asserts value is string { if (typeof value !== 'string' || !SAFE_SHA256.test(value)) throw new CaseAttendCoreError(code); }
function safeMimeType(value: unknown, code: CaseAttendCoreError['code'] = 'invalid_input'): asserts value is string { if (typeof value !== 'string' || !SAFE_MIME_TYPE.test(value) || credentialShaped(value)) throw new CaseAttendCoreError(code); }
function safeModel(value: unknown, code: CaseAttendCoreError['code'] = 'inference_failed'): void { if (value !== undefined && (typeof value !== 'string' || !SAFE_MODEL_ROUTE.test(value) || value.includes('://') || credentialShaped(value))) throw new CaseAttendCoreError(code); }
function isCancelled(signal: CancellationSignal | undefined): boolean {
  try { return signal?.cancelled === true; } catch { throw new CaseAttendCoreError('invalid_input'); }
}
function noopSignal(): CancellationSignal { return { cancelled: false, throwIfCancelled() {} }; }
function cloneFreeze<T extends object>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map((entry) => cloneFreezeValue(entry))) as T;
  const copy: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) copy[key] = cloneFreezeValue(entry);
  return Object.freeze(copy) as T;
}
function cloneFreezeValue(value: unknown): unknown {
  if (value && typeof value === 'object') return cloneFreeze(value as object);
  return value;
}
function snapshotMaterial<TCase extends CaseMaterial<unknown, unknown>>(material: TCase): TCase {
  assertMaterial(material);
  const artifactHints = material.artifactHints
    ? Object.freeze({
        showWindowLevel: material.artifactHints.showWindowLevel,
        showSeriesSelector: material.artifactHints.showSeriesSelector,
        showSegmentation: material.artifactHints.showSegmentation,
      })
    : undefined;
  return Object.freeze({
    id: material.id,
    title: material.title,
    domainId: material.domainId,
    casePackage: material.casePackage,
    ...(material.lessonPlan === undefined ? {} : { lessonPlan: material.lessonPlan }),
    ...(material.lessonId === undefined ? {} : { lessonId: material.lessonId }),
    ...(artifactHints === undefined ? {} : { artifactHints }),
  }) as TCase;
}
function snapshotUsage(value: unknown, code: CaseAttendCoreError['code'] = 'inference_failed'): Readonly<{ promptTokens?: number; completionTokens?: number; totalTokens?: number }> | undefined {
  if (value === undefined) return undefined;
  optionalExactKeys(value, [], ['promptTokens', 'completionTokens', 'totalTokens'], code);
  const snapshot: { promptTokens?: number; completionTokens?: number; totalTokens?: number } = {};
  for (const key of ['promptTokens', 'completionTokens', 'totalTokens'] as const) {
    const item = value[key];
    if (item === undefined) continue;
    if (!Number.isSafeInteger(item) || (item as number) < 0) throw new CaseAttendCoreError(code);
    snapshot[key] = item as number;
  }
  return Object.freeze(snapshot);
}
function snapshotDomain<TCase extends CaseMaterial<unknown, unknown>>(domain: DomainPlugin<TCase>): DomainPlugin<TCase> {
  const id = dataProperty(domain, 'id');
  const displayName = dataProperty(domain, 'displayName');
  const supports = dataMethod<DomainPlugin<TCase>['supports']>(domain, 'supports');
  safeId(id);
  safeText(displayName, 128);
  return Object.freeze({
    id,
    displayName,
    supports(caseMaterial: TCase): boolean {
      try {
        const supported = supports.call(domain, caseMaterial);
        if (typeof supported !== 'boolean') throw new CaseAttendCoreError('configuration');
        return supported;
      } catch {
        throw new CaseAttendCoreError('configuration');
      }
    },
  });
}
/** UTF-8 encoder kept local so the core has no DOM, Node, or WebCrypto ambient. */
export function encodeUtf8(input: string): Uint8Array {
  const bytes: number[] = [];
  for (let index = 0; index < input.length; index += 1) {
    let unit = input.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff && index + 1 < input.length) {
      const low = input.charCodeAt(index + 1);
      if (low >= 0xdc00 && low <= 0xdfff) { unit = 0x10000 + ((unit - 0xd800) << 10) + low - 0xdc00; index += 1; }
    }
    if (unit >= 0xd800 && unit <= 0xdfff) unit = 0xfffd;
    if (unit <= 0x7f) bytes.push(unit);
    else if (unit <= 0x7ff) bytes.push(0xc0 | (unit >> 6), 0x80 | (unit & 0x3f));
    else if (unit <= 0xffff) bytes.push(0xe0 | (unit >> 12), 0x80 | ((unit >> 6) & 0x3f), 0x80 | (unit & 0x3f));
    else bytes.push(0xf0 | (unit >> 18), 0x80 | ((unit >> 12) & 0x3f), 0x80 | ((unit >> 6) & 0x3f), 0x80 | (unit & 0x3f));
  }
  return new Uint8Array(bytes);
}
function assertMaterial(material: CaseMaterial): void {
  optionalExactKeys(material, ['id', 'title', 'domainId', 'casePackage'], ['lessonPlan', 'lessonId', 'artifactHints']);
  safeId(material.id); safeId(material.domainId); safeText(material.title, 512);
  if (material.lessonId !== undefined) safeId(material.lessonId);
  if (material.artifactHints !== undefined) {
    exactKeys(material.artifactHints, ['showWindowLevel', 'showSeriesSelector', 'showSegmentation']);
    if (typeof material.artifactHints.showWindowLevel !== 'boolean' || typeof material.artifactHints.showSeriesSelector !== 'boolean' || typeof material.artifactHints.showSegmentation !== 'boolean') throw new CaseAttendCoreError('invalid_input');
  }
}
function assertHistory(input: RunTurnInput): void {
  if (!MODES.has(input.mode) || typeof input.hasImage !== 'boolean' || !Array.isArray(input.historyWindowMessages) || input.historyWindowMessages.length > 64) throw new CaseAttendCoreError('invalid_input');
  safeId(input.learnerLevel);
  let totalCharacters = 0;
  input.historyWindowMessages.forEach((message) => { exactKeys(message, ['role', 'text']); if ((message.role !== 'learner' && message.role !== 'assistant')) throw new CaseAttendCoreError('invalid_input'); safeText(message.text, 64_000); totalCharacters += message.text.length; });
  if (totalCharacters > 512_000) throw new CaseAttendCoreError('invalid_input');
}
function assertEvent(event: CoreEventV1): void {
  if (!isRecord(event) || !hasOwn(event, 'type') || typeof event.type !== 'string') throw new CaseAttendCoreError('invalid_input');
  const common = ['schema', 'version', 'type', 'eventId', 'turnId', 'occurredAtMs', 'caseId', 'domainId'];
  const allowed = event.type === 'turn_started' ? [...common, 'promptSha256', 'lessonId', 'learnerLevel', 'mode', 'hasImage', 'historyMessageCount', 'artifact'] : event.type === 'turn_succeeded' ? [...common, 'promptSha256', 'requestedModelId', 'modelId', 'routeId', 'finishReason', 'latencyMs', 'usage'] : event.type === 'turn_failed' ? [...common, 'errorCode', 'latencyMs'] : event.type === 'turn_cancelled' ? [...common, 'latencyMs'] : [];
  if (allowed.length === 0) throw new CaseAttendCoreError('invalid_input');
  optionalExactKeys(event, common, allowed.filter((key) => !common.includes(key)));
  if (event.schema !== CORE_EVENT_SCHEMA || event.version !== CORE_CONTRACT_VERSION) throw new CaseAttendCoreError('invalid_input');
  safeId(event.eventId); safeId(event.turnId); safeId(event.caseId); safeId(event.domainId);
  if (!Number.isFinite(event.occurredAtMs) || event.occurredAtMs < 0) throw new CaseAttendCoreError('invalid_input');
  if (event.type === 'turn_started') { safeHash(event.promptSha256, 'invalid_input'); if (event.lessonId !== undefined) safeId(event.lessonId); safeId(event.learnerLevel); if (!MODES.has(event.mode) || typeof event.hasImage !== 'boolean' || !Number.isSafeInteger(event.historyMessageCount) || event.historyMessageCount < 0 || event.historyMessageCount > 64) throw new CaseAttendCoreError('invalid_input'); if (event.artifact) { exactKeys(event.artifact, ['id', 'sha256', 'mimeType']); safeId(event.artifact.id); safeHash(event.artifact.sha256, 'invalid_input'); safeMimeType(event.artifact.mimeType); } }
  if (event.type === 'turn_succeeded') { safeHash(event.promptSha256, 'invalid_input'); safeModel(event.requestedModelId, 'invalid_input'); safeModel(event.modelId, 'invalid_input'); safeModel(event.routeId, 'invalid_input'); if (event.finishReason !== undefined && !FINISH_REASONS.has(event.finishReason)) throw new CaseAttendCoreError('invalid_input'); if (!Number.isFinite(event.latencyMs) || event.latencyMs < 0) throw new CaseAttendCoreError('invalid_input'); snapshotUsage(event.usage, 'invalid_input'); }
  if (event.type === 'turn_failed' && !EVENT_ERROR_CODES.has(event.errorCode)) throw new CaseAttendCoreError('invalid_input');
  if ((event.type === 'turn_failed' || event.type === 'turn_cancelled') && (!Number.isFinite(event.latencyMs) || event.latencyMs < 0)) throw new CaseAttendCoreError('invalid_input');
}
export function assertCoreEventV1(event: unknown): asserts event is CoreEventV1 {
  try { if (!isRecord(event)) throw new CaseAttendCoreError('invalid_input'); assertEvent(event as unknown as CoreEventV1); }
  catch { throw new CaseAttendCoreError('invalid_input'); }
}
function eventId(turnId: string, sequence: number): string { return `${turnId}:${sequence}`; }
type TurnSnapshot = Omit<RunTurnInput, 'historyWindowMessages' | 'artifact'> & {
  readonly historyWindowMessages: readonly { readonly role: 'learner' | 'assistant'; readonly text: string }[];
  readonly artifact?: ArtifactReference;
};
function snapshotTurnInput(input: RunTurnInput): TurnSnapshot {
  try {
    optionalExactKeys(input, ['caseId', 'learnerMessage', 'learnerLevel', 'mode', 'hasImage', 'historyWindowMessages'], ['lessonId', 'artifact', 'signal', 'onTextDelta']);
    safeId(input.caseId); safeText(input.learnerMessage, MAX_TEXT_CHARACTERS); if (input.learnerMessage.trim() === '') throw new CaseAttendCoreError('invalid_input'); if (input.lessonId !== undefined) safeId(input.lessonId); assertHistory(input); if (input.onTextDelta !== undefined && typeof input.onTextDelta !== 'function') throw new CaseAttendCoreError('invalid_input');
    let artifact: ArtifactReference | undefined;
    if (input.artifact !== undefined) { optionalExactKeys(input.artifact, ['id'], ['label', 'mimeType', 'sha256']); safeId(input.artifact.id); if (input.artifact.label !== undefined) safeText(input.artifact.label, 256); if (input.artifact.mimeType !== undefined) safeMimeType(input.artifact.mimeType); if (input.artifact.sha256 !== undefined) safeHash(input.artifact.sha256, 'invalid_input'); artifact = Object.freeze({ id: input.artifact.id, ...(input.artifact.label === undefined ? {} : { label: input.artifact.label }), ...(input.artifact.mimeType === undefined ? {} : { mimeType: input.artifact.mimeType }), ...(input.artifact.sha256 === undefined ? {} : { sha256: input.artifact.sha256 }) }); }
    if (input.hasImage !== Boolean(artifact)) throw new CaseAttendCoreError('invalid_input');
    return Object.freeze({ caseId: input.caseId, learnerMessage: input.learnerMessage, learnerLevel: input.learnerLevel, mode: input.mode, hasImage: input.hasImage, historyWindowMessages: Object.freeze(input.historyWindowMessages.map((message) => Object.freeze({ role: message.role, text: message.text }))), ...(input.lessonId === undefined ? {} : { lessonId: input.lessonId }), ...(artifact === undefined ? {} : { artifact }), ...(input.signal === undefined ? {} : { signal: input.signal }), ...(input.onTextDelta === undefined ? {} : { onTextDelta: input.onTextDelta }) });
  } catch { throw new CaseAttendCoreError('invalid_input'); }
}

export function createCaseAttendEngine<TCase extends CaseMaterial<unknown, unknown> = CaseMaterial>(options: CreateCaseAttendEngineOptions<TCase>): CaseAttendEngine<TCase> {
  optionalExactKeys(options, ['caseRegistry', 'artifactLoader', 'domains', 'promptComposer', 'inference', 'destination', 'platform'], [], 'configuration');
  const registry = dataProperty(options, 'caseRegistry') as CaseRegistry<TCase>;
  const registryListCases = dataMethod<CaseRegistry<TCase>['listCases']>(registry, 'listCases');
  const registryGetCase = dataMethod<CaseRegistry<TCase>['getCase']>(registry, 'getCase');
  const artifactLoader = dataProperty(options, 'artifactLoader') as ArtifactLoader<TCase>;
  const loadArtifactAdapter = dataMethod<ArtifactLoader<TCase>['loadArtifact']>(artifactLoader, 'loadArtifact');
  const promptComposer = dataProperty(options, 'promptComposer') as PromptComposer<TCase>;
  const composePrompt = dataMethod<PromptComposer<TCase>['compose']>(promptComposer, 'compose');
  const inference = dataProperty(options, 'inference') as CreateCaseAttendEngineOptions<TCase>['inference'];
  if (typeof inference !== 'function') throw new CaseAttendCoreError('configuration');
  const platform = dataProperty(options, 'platform') as CorePlatform;
  const platformNow = dataMethod<CorePlatform['now']>(platform, 'now');
  const platformRandomId = dataMethod<CorePlatform['randomId']>(platform, 'randomId');
  const platformSha256 = dataMethod<CorePlatform['sha256']>(platform, 'sha256');
  const domainAdapters = dataProperty(options, 'domains') as readonly DomainPlugin<TCase>[];
  try { if (!Array.isArray(domainAdapters) || domainAdapters.length === 0) throw new CaseAttendCoreError('configuration'); }
  catch { throw new CaseAttendCoreError('configuration'); }
  const destination = dataProperty(options, 'destination') as EventDestination;
  optionalExactKeys(destination, ['kind'], ['sessionStore', 'researchSink'], 'configuration');
  const destinationKind = dataProperty(destination, 'kind');
  let hasSession: boolean;
  let hasResearch: boolean;
  try { hasSession = hasOwn(destination, 'sessionStore'); hasResearch = hasOwn(destination, 'researchSink'); }
  catch { throw new CaseAttendCoreError('configuration'); }
  if ((destinationKind === 'teaching' && (!hasSession || hasResearch)) || (destinationKind === 'research' && (!hasResearch || hasSession))) throw new CaseAttendCoreError('configuration');
  if (destinationKind !== 'teaching' && destinationKind !== 'research') throw new CaseAttendCoreError('configuration');
  let appendSession: ((event: CoreEventV1) => void | Promise<void>) | undefined;
  let recordResearch: ((event: CoreEventV1) => Promise<void>) | undefined;
  if (destinationKind === 'teaching') {
    const store = dataProperty(destination, 'sessionStore') as SessionStore;
    const append = dataMethod<SessionStore['append']>(store, 'append');
    appendSession = (event) => append.call(store, event);
  } else {
    const sink = dataProperty(destination, 'researchSink') as ResearchSink;
    const record = dataMethod<ResearchSink['record']>(sink, 'record');
    recordResearch = (event) => record.call(sink, event);
  }
  let domains: readonly DomainPlugin<TCase>[];
  try {
    domains = Object.freeze(domainAdapters.map(snapshotDomain));
    if (new Set(domains.map((domain) => domain.id)).size !== domains.length) throw new CaseAttendCoreError('configuration');
  } catch {
    throw new CaseAttendCoreError('configuration');
  }
  const readNow = (): number => {
    try {
      const value = platformNow.call(platform);
      if (!Number.isSafeInteger(value) || value < 0) throw new CaseAttendCoreError('configuration');
      return value;
    } catch { throw new CaseAttendCoreError('configuration'); }
  };
  const readNowOr = (fallback: number): number => {
    try { return readNow(); } catch { return fallback; }
  };
  const createTurnId = (turnSequence: number): string => {
    try {
      const randomId = platformRandomId.call(platform);
      safeId(randomId);
      if (randomId.length > 64) throw new CaseAttendCoreError('configuration');
      return `turn-${randomId}-${turnSequence}`;
    } catch { throw new CaseAttendCoreError('configuration'); }
  };
  const digest = async (bytes: Uint8Array): Promise<string> => {
    try {
      const value = await platformSha256.call(platform, new Uint8Array(bytes));
      safeHash(value, 'configuration');
      return value;
    } catch { throw new CaseAttendCoreError('configuration'); }
  };
  let sequence = 0;
  const activeTurnIds = new Set<string>();
  const loadCase = async (caseId: string, signal?: CancellationSignal): Promise<TCase> => {
    safeId(caseId); if (isCancelled(signal)) throw new CaseAttendCoreError('cancelled');
    let material: TCase | undefined; try { material = await registryGetCase.call(registry, caseId, signal); } catch { throw new CaseAttendCoreError('configuration'); }
    if (!material) throw new CaseAttendCoreError('not_found');
    try { return snapshotMaterial(material); } catch { throw new CaseAttendCoreError('configuration'); }
  };
  const getDomain = (material: TCase): DomainPlugin<TCase> => {
    let stableMaterial: TCase;
    try { stableMaterial = snapshotMaterial(material); } catch { throw new CaseAttendCoreError('invalid_input'); }
    const domain = domains.find((candidate) => candidate.id === stableMaterial.domainId && candidate.supports(stableMaterial));
    if (!domain) throw new CaseAttendCoreError('configuration');
    return domain;
  };
  const snapshotArtifactReference = (artifact: ArtifactReference): ArtifactReference => {
    try {
      optionalExactKeys(artifact, ['id'], ['label', 'mimeType', 'sha256']);
      const id = dataProperty(artifact, 'id', 'invalid_input');
      const label = hasOwn(artifact, 'label') ? dataProperty(artifact, 'label', 'invalid_input') : undefined;
      const mimeType = hasOwn(artifact, 'mimeType') ? dataProperty(artifact, 'mimeType', 'invalid_input') : undefined;
      const sha256 = hasOwn(artifact, 'sha256') ? dataProperty(artifact, 'sha256', 'invalid_input') : undefined;
      safeId(id);
      if (label !== undefined) safeText(label, 256);
      if (mimeType !== undefined) safeMimeType(mimeType);
      if (sha256 !== undefined) safeHash(sha256, 'invalid_input');
      return Object.freeze({ id, ...(label === undefined ? {} : { label }), ...(mimeType === undefined ? {} : { mimeType }), ...(sha256 === undefined ? {} : { sha256 }) });
    } catch { throw new CaseAttendCoreError('invalid_input'); }
  };
  const loadArtifactForMaterial = async (material: TCase, reference: ArtifactReference, signal?: CancellationSignal): Promise<LoadedArtifact> => {
    if (isCancelled(signal)) throw new CaseAttendCoreError('cancelled');
    let loaded: LoadedArtifact;
    try { loaded = await loadArtifactAdapter.call(artifactLoader, { caseMaterial: material, artifact: reference, signal }); } catch { throw new CaseAttendCoreError('configuration'); }
    let loadedBytes: Uint8Array;
    let loadedMimeType: string;
    let loadedSha256: string | undefined;
    try {
      optionalExactKeys(loaded, ['bytes', 'mimeType'], ['sha256'], 'configuration');
      const bytesValue = dataProperty(loaded, 'bytes');
      const mimeTypeValue = dataProperty(loaded, 'mimeType');
      const sha256Value = hasOwn(loaded, 'sha256') ? dataProperty(loaded, 'sha256') : undefined;
      if (!(bytesValue instanceof Uint8Array) || bytesValue.byteLength === 0 || bytesValue.byteLength > CORE_MAX_ARTIFACT_BYTES) throw new CaseAttendCoreError('configuration');
      safeMimeType(mimeTypeValue, 'configuration');
      if (sha256Value !== undefined) safeHash(sha256Value, 'configuration');
      loadedBytes = new Uint8Array(bytesValue);
      loadedMimeType = mimeTypeValue;
      loadedSha256 = sha256Value;
    } catch { throw new CaseAttendCoreError('configuration'); }
    const bytes = loadedBytes;
    const actualSha = await digest(bytes);
    if (loadedSha256 !== undefined && loadedSha256 !== actualSha) throw new CaseAttendCoreError('configuration');
    if (reference.sha256 !== undefined && reference.sha256 !== actualSha) throw new CaseAttendCoreError('invalid_input');
    if (reference.mimeType !== undefined && reference.mimeType !== loadedMimeType) throw new CaseAttendCoreError('invalid_input');
    return Object.freeze({ bytes, mimeType: loadedMimeType, sha256: actualSha });
  };
  const loadArtifact = async (caseId: string, artifact: ArtifactReference, signal?: CancellationSignal): Promise<LoadedArtifact> => {
    safeId(caseId);
    const reference = snapshotArtifactReference(artifact);
    const material = await loadCase(caseId, signal);
    return loadArtifactForMaterial(material, reference, signal);
  };
  const emit = async (event: CoreEventV1): Promise<void> => {
    assertEvent(event); const saved = cloneFreeze(event);
    if (recordResearch) { try { await recordResearch(saved); } catch { throw new CaseAttendCoreError('persistence_failed'); } return; }
    try { await appendSession?.(saved); } catch { /* teaching telemetry is best effort */ }
  };
  return Object.freeze({
    async listCases(signal?: CancellationSignal) {
      if (isCancelled(signal)) throw new CaseAttendCoreError('cancelled');
      let entries: readonly TCase[];
      try { entries = await registryListCases.call(registry, signal); } catch { throw new CaseAttendCoreError('configuration'); }
      if (!Array.isArray(entries)) throw new CaseAttendCoreError('configuration');
      try { return Object.freeze(entries.map(snapshotMaterial)); } catch { throw new CaseAttendCoreError('configuration'); }
    },
    loadCase, getDomain, loadArtifact,
    async runTurn(input: RunTurnInput): Promise<RunTurnResult> {
      const snapshot = snapshotTurnInput(input); const signal = snapshot.signal ?? noopSignal(); if (isCancelled(signal)) throw new CaseAttendCoreError('cancelled');
      const startedAt = readNow(); sequence += 1; const turnId = createTurnId(sequence); if (activeTurnIds.has(turnId)) throw new CaseAttendCoreError('configuration'); activeTurnIds.add(turnId); let started = false; let terminal = false; let terminalDomainId = 'unknown';
      const emitTerminal = async (event: CoreEventV1): Promise<void> => { if (terminal) return; terminal = true; await emit(event); };
      let acceptingDeltas = true;
      let streamedCharacters = 0;
      let streamedDeltaCount = 0;
      let streamViolation = false;
      const researchDeltas: string[] = [];
      const deliverDelta = (delta: string): void => { try { snapshot.onTextDelta?.(delta); } catch { /* host UI callbacks are isolated */ } };
      const onTextDelta = (delta: string): void => {
        if (!acceptingDeltas || terminal) return;
        if (typeof delta !== 'string') { streamViolation = true; acceptingDeltas = false; return; }
        if (delta.length === 0) return;
        streamedDeltaCount += 1;
        if (streamedDeltaCount > MAX_STREAM_DELTAS || delta.length > MAX_TEXT_CHARACTERS || streamedCharacters + delta.length > MAX_STREAMED_CHARACTERS) { streamViolation = true; acceptingDeltas = false; return; }
        streamedCharacters += delta.length;
        if (recordResearch) researchDeltas.push(delta); else deliverDelta(delta);
      };
      try {
        const material = await loadCase(snapshot.caseId, signal); const domain = getDomain(material); terminalDomainId = domain.id; const artifact = snapshot.artifact ? await loadArtifactForMaterial(material, snapshot.artifact, signal) : undefined;
        let composed;
        try { composed = await composePrompt.call(promptComposer, { caseMaterial: material, learnerMessage: snapshot.learnerMessage, lessonId: snapshot.lessonId, domain, artifact: artifact && snapshot.artifact ? { id: snapshot.artifact.id, sha256: artifact.sha256!, mimeType: artifact.mimeType } : undefined, learnerLevel: snapshot.learnerLevel, mode: snapshot.mode, hasImage: snapshot.hasImage, historyWindowMessages: snapshot.historyWindowMessages }, signal); } catch { throw new CaseAttendCoreError('configuration'); }
        optionalExactKeys(composed, ['prompt'], ['sha256', 'requestedModel'], 'configuration'); safeText(composed.prompt, MAX_TEXT_CHARACTERS, 'configuration'); safeModel(composed.requestedModel); const promptSha = await digest(encodeUtf8(composed.prompt)); if (composed.sha256 !== undefined) { safeHash(composed.sha256, 'configuration'); if (composed.sha256 !== promptSha) throw new CaseAttendCoreError('configuration'); }
        sequence += 1; await emit({ schema: CORE_EVENT_SCHEMA, version: CORE_CONTRACT_VERSION, type: 'turn_started', eventId: eventId(turnId, sequence), turnId, occurredAtMs: startedAt, caseId: material.id, domainId: domain.id, promptSha256: promptSha, lessonId: snapshot.lessonId, learnerLevel: snapshot.learnerLevel, mode: snapshot.mode, hasImage: snapshot.hasImage, historyMessageCount: snapshot.historyWindowMessages.length, artifact: artifact && snapshot.artifact ? { id: snapshot.artifact.id, sha256: artifact.sha256!, mimeType: artifact.mimeType } : undefined }); started = true;
        if (isCancelled(signal)) throw new CaseAttendCoreError('cancelled'); let result; try { result = await inference({ caseMaterial: material, prompt: composed.prompt, learnerMessage: snapshot.learnerMessage, context: Object.freeze({ learnerLevel: snapshot.learnerLevel, mode: snapshot.mode, hasImage: snapshot.hasImage, historyWindowMessages: snapshot.historyWindowMessages }), artifact, requestedModel: composed.requestedModel, onTextDelta }, signal); } catch { throw new CaseAttendCoreError(isCancelled(signal) ? 'cancelled' : 'inference_failed'); } finally { acceptingDeltas = false; }
        if (isCancelled(signal)) throw new CaseAttendCoreError('cancelled');
        if (streamViolation) throw new CaseAttendCoreError('inference_failed');
        optionalExactKeys(result, ['text'], ['modelId', 'routeId', 'finishReason', 'usage'], 'inference_failed');
        safeText(result.text, MAX_TEXT_CHARACTERS, 'inference_failed'); safeModel(result.modelId); safeModel(result.routeId); if (result.finishReason !== undefined && !FINISH_REASONS.has(result.finishReason)) throw new CaseAttendCoreError('inference_failed');
        if (recordResearch && composed.requestedModel !== undefined && result.modelId !== composed.requestedModel) throw new CaseAttendCoreError('inference_failed');
        const usage = snapshotUsage(result.usage);
        const resultSnapshot = Object.freeze({ text: result.text, ...(result.modelId === undefined ? {} : { modelId: result.modelId }), ...(result.routeId === undefined ? {} : { routeId: result.routeId }), ...(result.finishReason === undefined ? {} : { finishReason: result.finishReason }), ...(usage === undefined ? {} : { usage }) });
        const completedAt = readNow(); const latencyMs = Math.max(0, completedAt - startedAt); sequence += 1; await emitTerminal({ schema: CORE_EVENT_SCHEMA, version: CORE_CONTRACT_VERSION, type: 'turn_succeeded', eventId: eventId(turnId, sequence), turnId, occurredAtMs: completedAt, caseId: material.id, domainId: domain.id, promptSha256: promptSha, requestedModelId: composed.requestedModel, modelId: resultSnapshot.modelId, routeId: resultSnapshot.routeId, finishReason: resultSnapshot.finishReason, latencyMs, usage: resultSnapshot.usage });
        if (recordResearch) researchDeltas.forEach(deliverDelta);
        return Object.freeze({ text: resultSnapshot.text, turnId, promptSha256: promptSha, ...(resultSnapshot.modelId === undefined ? {} : { modelId: resultSnapshot.modelId }), ...(resultSnapshot.routeId === undefined ? {} : { routeId: resultSnapshot.routeId }), ...(resultSnapshot.finishReason === undefined ? {} : { finishReason: resultSnapshot.finishReason }), ...(resultSnapshot.usage === undefined ? {} : { usage: resultSnapshot.usage }) });
      } catch (error) {
        acceptingDeltas = false;
        const code = error instanceof CaseAttendCoreError ? error.code : 'inference_failed'; const completedAt = readNowOr(startedAt); const latencyMs = Math.max(0, completedAt - startedAt);
        if (started) { sequence += 1; const terminalEvent: CoreEventV1 = code === 'cancelled' ? { schema: CORE_EVENT_SCHEMA, version: CORE_CONTRACT_VERSION, type: 'turn_cancelled', eventId: eventId(turnId, sequence), turnId, occurredAtMs: completedAt, caseId: snapshot.caseId, domainId: terminalDomainId, latencyMs } : { schema: CORE_EVENT_SCHEMA, version: CORE_CONTRACT_VERSION, type: 'turn_failed', eventId: eventId(turnId, sequence), turnId, occurredAtMs: completedAt, caseId: snapshot.caseId, domainId: terminalDomainId, errorCode: code, latencyMs }; try { await emitTerminal(terminalEvent); } catch (emitError) { if (emitError instanceof CaseAttendCoreError) throw emitError; } }
        throw new CaseAttendCoreError(code);
      } finally { terminal = true; activeTurnIds.delete(turnId); }
    },
    toJSON() { return { contractVersion: CORE_CONTRACT_VERSION }; },
  });
}
