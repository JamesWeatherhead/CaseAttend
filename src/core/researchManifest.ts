import type { LearnerLevel } from '../constants';
import { canonicalizeJson } from './casePackage';
import type { LessonPlanRef } from './lessonPlan';

export const RESEARCH_MANIFEST_SCHEMA = 'caseattend.research-manifest' as const;
export const RESEARCH_MANIFEST_SCHEMA_VERSION = '1.0' as const;

export const RESEARCH_MANIFEST_LIMITS = Object.freeze({
  maxCanonicalBytes: 512 * 1024,
  maxArms: 8,
  maxCaseStepsPerArm: 32,
  maxTasksPerPhase: 64,
  maxTaskOptions: 20,
  maxContacts: 8,
  maxProtocolItems: 64,
  maxShortTextLength: 256,
  maxTextLength: 16_000,
  maxWeight: 10_000,
  maxTotalWeight: 10_000,
});

export type ResearchMode = 'chat' | 'deep_think';

export interface ResearchCasePackageRef {
  id: string;
  schemaVersion: '1.0';
  sha256: string;
}

export interface ResearchManifestRef {
  id: string;
  version: string;
  sha256: string;
}

export interface ResearchApplicationV1 {
  name: 'CaseAttend';
  version: string;
  buildRevision: string;
  sourceTreeUrl: string;
}

export interface ResearchDeploymentV1 {
  origin: string;
  operatorName: string;
  privacyPolicyUrl: string;
}

export type ResearchOversightV1 =
  | { status: 'draft' }
  | {
      status: 'institution-determined';
      determination: 'approved' | 'exempt' | 'not-human-subjects-research';
      institutionName: string;
      protocolReference: string;
      determinedAt: string;
    };

export interface ResearchPopulationV1 {
  description: string;
  includesMinors: boolean;
  vulnerableGroups: readonly string[];
}

export interface ResearchHypothesisV1 {
  id: string;
  statement: string;
}

export interface ResearchObjectiveV1 {
  id: string;
  description: string;
}

export interface ResearchOutcomeV1 {
  id: string;
  description: string;
}

export interface ResearchProtocolV1 {
  design: 'exploratory' | 'confirmatory';
  purpose: string;
  population: ResearchPopulationV1;
  hypotheses: readonly ResearchHypothesisV1[];
  objectives: readonly ResearchObjectiveV1[];
  outcomes: readonly ResearchOutcomeV1[];
}

export interface ResearchProviderPolicyV1 {
  /** Exactly one upstream provider identifier. */
  only: readonly [string];
  /** Public data/privacy policy reviewed for that exact upstream provider. */
  policyUrl: string;
  allowFallbacks: false;
  requireParameters: true;
  zeroDataRetention: true;
  dataCollection: 'deny';
}

export interface ResearchInferencePolicyV1 {
  gateway: 'openrouter';
  endpoint: 'https://openrouter.ai/api/v1/chat/completions';
  requestedModelId: string;
  provider: ResearchProviderPolicyV1;
  temperature: number;
  topP: number;
  maxTokens: number;
  seed?: number;
  stream: false;
  historyWindowMessages: number;
}

export interface ResearchViewerPolicyV1 {
  version: '1.0';
  allowSeriesSwitch: boolean;
  allowFrameNavigation: boolean;
  allowWindowLevel: boolean;
  allowPanZoom: boolean;
  allowAnnotations: boolean;
  allowSegmentation: boolean;
}

export interface ResearchCapturePolicyV1 {
  version: '1.0';
  pipelineVersion: 'caseattend-canvas-jpeg-v1';
  trigger: 'send';
  source: 'current-view';
  format: 'image/jpeg';
  quality: 0.9;
  includeVisibleAnnotations: boolean;
  includeTutorPointers: false;
  bakeViewportTransform: true;
}

export interface ResearchCaseStepV1 {
  id: string;
  casePackageRef: ResearchCasePackageRef;
  lessonPlanRef: LessonPlanRef;
  learnerLevel: LearnerLevel;
  mode: ResearchMode;
  systemPromptSha256: string;
  requestTemplateVersion: '1.0';
}

export interface ResearchArmV1 {
  id: string;
  label: string;
  inferencePolicy: ResearchInferencePolicyV1;
  viewerPolicy: ResearchViewerPolicyV1;
  capturePolicy: ResearchCapturePolicyV1;
  /** Protocol order is array order and must not be sorted at runtime. */
  caseSteps: readonly ResearchCaseStepV1[];
}

export type ResearchAssignmentV1 =
  | { method: 'fixed'; armId: string }
  | {
      method: 'sha256-weighted-v1';
      allocations: readonly { armId: string; weight: number }[];
    };

export type ResearchTaskResponseV1 =
  | { kind: 'none' }
  | {
      kind: 'single-choice';
      options: readonly { id: string; label: string }[];
    }
  | {
      kind: 'integer-scale';
      min: number;
      max: number;
      minLabel: string;
      maxLabel: string;
    };

export interface ResearchTaskV1 {
  id: string;
  title: string;
  instructions: string;
  response: ResearchTaskResponseV1;
}

export type ResearchRawChatPolicyV1 =
  | { enabled: false }
  | {
      enabled: true;
      purpose: string;
      includes: readonly ('learner-text' | 'model-text')[];
      participantDisclosure: string;
      accessRoles: readonly ['research-team'];
    };

export interface ResearchCollectionPolicyV1 {
  sessionEvents: {
    enabled: true;
    schema: 'caseattend.research-record';
    schemaVersion: '1.0';
  };
  taskResponses: {
    enabled: boolean;
    schema: 'caseattend.research-task-response';
    schemaVersion: '1.0';
  };
  currentViewCapture: {
    generated: 'on-send';
    transmittedToInferenceGateway: true;
    storedInSessionEvents: false;
    exported: false;
  };
  rawChat: ResearchRawChatPolicyV1;
}

export interface ResearchDataManagementV1 {
  browserStorage: 'indexeddb-required';
  automaticRemoteSync: false;
  studyExport: 'manual-file-export';
  exportFormats: readonly ('jsonl' | 'csv')[];
  browserDeleteAfter: string;
  exportedCopiesDeleteAfter: string;
  accessRoles: readonly string[];
  deletionInstructions: string;
  dataFlow: {
    inference: {
      endpoint: 'https://openrouter.ai/api/v1/chat/completions';
      sent: readonly ['system-prompt', 'learner-message', 'current-view-image'];
      received: readonly ['model-response'];
      occurs: 'when-participant-sends';
      authentication: {
        method: 'browser-held-openrouter-api-key';
        storage: 'browser-local-storage';
        sentTo: 'openrouter-only';
        includedInResearchRecords: false;
      };
    };
    studyExport: {
      destination: 'research-team';
      automaticUpload: false;
    };
  };
}

export interface ResearchParticipantInformationV1 {
  version: string;
  language: 'en';
  keyInformation: string;
  purpose: string;
  procedures: string;
  risks: string;
  benefits: string;
  privacy: string;
  voluntaryParticipation: string;
  compensation: string;
  vlmDisclosure: {
    term: 'vision-language model (VLM)';
    plainLanguage: string;
    limitations: string;
    notMedicalAdvice: true;
  };
  contacts: readonly { name: string; role: string; email: string }[];
  acknowledgement:
    | { kind: 'required' }
    | { kind: 'institutionally-waived'; determinationReference: string };
}

export interface ResearchParticipantCodePolicyV1 {
  format: 'crockford-base32-v1';
  length: 20;
  derivation: 'sha256-manifest-code-v1';
  issuance: 'institution-assigned-outside-caseattend';
  linkageKeyStorage: 'outside-caseattend';
  reuseControl: 'external-study-procedure';
}

export interface ResearchManifestV1Draft {
  schema: typeof RESEARCH_MANIFEST_SCHEMA;
  schemaVersion: typeof RESEARCH_MANIFEST_SCHEMA_VERSION;
  version: string;
  id: string;
  title: string;
  application: ResearchApplicationV1;
  deployment: ResearchDeploymentV1;
  oversight: ResearchOversightV1;
  protocol: ResearchProtocolV1;
  arms: readonly ResearchArmV1[];
  assignment: ResearchAssignmentV1;
  participantCodes: ResearchParticipantCodePolicyV1;
  tasks: { pre: readonly ResearchTaskV1[]; post: readonly ResearchTaskV1[] };
  collection: ResearchCollectionPolicyV1;
  dataManagement: ResearchDataManagementV1;
  participantInformation: ResearchParticipantInformationV1;
}

export interface ResearchManifestV1 extends ResearchManifestV1Draft {
  manifest: { algorithm: 'SHA-256'; sha256: string };
}

export interface ResearchManifestValidationResult {
  valid: boolean;
  errors: string[];
}

export type ResearchManifestCreateInput = Omit<
  ResearchManifestV1Draft,
  'schema' | 'schemaVersion' | 'participantCodes' | 'collection'
> & {
  collection: Omit<ResearchCollectionPolicyV1, 'rawChat'> & {
    rawChat?: ResearchRawChatPolicyV1;
  };
};

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const KEBAB_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SAFE_PROVIDER_OR_MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LEARNER_LEVELS = new Set<LearnerLevel>([
  'highschool', 'undergrad', 'ms_preclinical', 'ms_clinical', 'resident',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown, path: string, errors: string[]): Record<string, unknown> | null {
  if (!isRecord(value)) {
    errors.push(`${path} is required and must be an object.`);
    return null;
  }
  return value;
}

function closed(value: Record<string, unknown>, allowed: readonly string[], path: string, errors: string[]): void {
  const names = new Set(allowed);
  Object.keys(value).forEach((key) => {
    if (!names.has(key)) errors.push(`${path}.${key} is not valid in Research Manifest v1.`);
  });
}

function textValue(
  value: unknown,
  path: string,
  errors: string[],
  max: number = RESEARCH_MANIFEST_LIMITS.maxTextLength,
): value is string {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${path} is required and must be a non-empty string.`);
    return false;
  }
  if (value.length > max) errors.push(`${path} cannot exceed ${max} characters.`);
  if (value.includes('\0')) errors.push(`${path} cannot contain null characters.`);
  return true;
}

function literal(value: unknown, expected: string | number | boolean, path: string, errors: string[]): void {
  if (value !== expected) errors.push(`${path} must be ${JSON.stringify(expected)}.`);
}

function bool(value: unknown, path: string, errors: string[]): void {
  if (typeof value !== 'boolean') errors.push(`${path} is required and must be true or false.`);
}

function kebab(value: unknown, path: string, errors: string[]): value is string {
  if (!textValue(value, path, errors, RESEARCH_MANIFEST_LIMITS.maxShortTextLength)) return false;
  if (!KEBAB_ID_PATTERN.test(value)) {
    errors.push(`${path} must use stable lowercase kebab-case characters.`);
    return false;
  }
  return true;
}

function sha(value: unknown, path: string, errors: string[]): value is string {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    errors.push(`${path} must be a lowercase 64-character SHA-256 digest.`);
    return false;
  }
  return true;
}

function semver(value: unknown, path: string, errors: string[]): void {
  if (textValue(value, path, errors, RESEARCH_MANIFEST_LIMITS.maxShortTextLength) && !SEMVER_PATTERN.test(value)) {
    errors.push(`${path} must be a semantic version such as 1.0.0.`);
  }
}

function iso(value: unknown, path: string, errors: string[]): boolean {
  if (!textValue(value, path, errors, 64)) return false;
  if (!ISO_DATE_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    errors.push(`${path} must be an ISO 8601 UTC timestamp.`);
    return false;
  }
  return true;
}

function https(value: unknown, path: string, errors: string[], originOnly = false): void {
  if (!textValue(value, path, errors, 2048)) return;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
      errors.push(`${path} must be an HTTPS URL without embedded credentials.`);
    } else if (originOnly && value !== parsed.origin) {
      errors.push(`${path} must be an exact HTTPS origin without a path, query, or fragment.`);
    }
  } catch {
    errors.push(`${path} must be a valid HTTPS URL.`);
  }
}

function finiteNumber(value: unknown, path: string, errors: string[], min: number, max: number): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    errors.push(`${path} must be a finite number from ${min} through ${max}.`);
  }
}

function integer(value: unknown, path: string, errors: string[], min: number, max: number): value is number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    errors.push(`${path} must be an integer from ${min} through ${max}.`);
    return false;
  }
  return true;
}

function uniqueStrings(value: unknown, path: string, errors: string[], allowEmpty: boolean, max = 64): string[] {
  if (!Array.isArray(value)) {
    errors.push(`${path} is required and must be an array.`);
    return [];
  }
  if (!allowEmpty && value.length === 0) errors.push(`${path} must contain at least one entry.`);
  if (value.length > max) errors.push(`${path} cannot contain more than ${max} entries.`);
  const seen = new Set<string>();
  const result: string[] = [];
  value.forEach((entry, index) => {
    if (!textValue(entry, `${path}[${index}]`, errors, RESEARCH_MANIFEST_LIMITS.maxShortTextLength)) return;
    if (seen.has(entry)) errors.push(`${path}[${index}] duplicates an earlier entry.`);
    else {
      seen.add(entry);
      result.push(entry);
    }
  });
  return result;
}

function validateCaseRef(value: unknown, path: string, errors: string[]): void {
  const ref = record(value, path, errors);
  if (!ref) return;
  closed(ref, ['id', 'schemaVersion', 'sha256'], path, errors);
  kebab(ref.id, `${path}.id`, errors);
  literal(ref.schemaVersion, '1.0', `${path}.schemaVersion`, errors);
  sha(ref.sha256, `${path}.sha256`, errors);
}

function validateLessonRef(value: unknown, path: string, errors: string[]): void {
  const ref = record(value, path, errors);
  if (!ref) return;
  closed(ref, ['id', 'version', 'sha256'], path, errors);
  kebab(ref.id, `${path}.id`, errors);
  semver(ref.version, `${path}.version`, errors);
  sha(ref.sha256, `${path}.sha256`, errors);
}

function validateApplication(value: unknown, errors: string[]): void {
  const item = record(value, 'application', errors);
  if (!item) return;
  closed(item, ['name', 'version', 'buildRevision', 'sourceTreeUrl'], 'application', errors);
  literal(item.name, 'CaseAttend', 'application.name', errors);
  semver(item.version, 'application.version', errors);
  const revisionValid = textValue(item.buildRevision, 'application.buildRevision', errors, 64)
    && /^[a-f0-9]{7,64}$/.test(item.buildRevision);
  if (!revisionValid) {
    errors.push('application.buildRevision must be an exact lowercase 7-64 character Git revision. Development builds cannot be finalized.');
  }
  https(item.sourceTreeUrl, 'application.sourceTreeUrl', errors);
  if (revisionValid && typeof item.sourceTreeUrl === 'string') {
    try {
      const source = new URL(item.sourceTreeUrl);
      if (
        source.protocol !== 'https:'
        || source.username
        || source.password
        || source.search
        || source.hash
        || !source.pathname.endsWith(`/tree/${item.buildRevision}`)
      ) {
        errors.push('application.sourceTreeUrl must be the exact HTTPS /tree/<buildRevision> path without a query or fragment.');
      }
    } catch {
      // validateHttpsUrl reports the base URL error.
    }
  }
}

function validateDeployment(value: unknown, errors: string[]): void {
  const item = record(value, 'deployment', errors);
  if (!item) return;
  closed(item, ['origin', 'operatorName', 'privacyPolicyUrl'], 'deployment', errors);
  https(item.origin, 'deployment.origin', errors, true);
  textValue(item.operatorName, 'deployment.operatorName', errors, RESEARCH_MANIFEST_LIMITS.maxShortTextLength);
  https(item.privacyPolicyUrl, 'deployment.privacyPolicyUrl', errors);
}

function validateOversight(value: unknown, errors: string[]): void {
  const item = record(value, 'oversight', errors);
  if (!item) return;
  if (item.status === 'draft') {
    closed(item, ['status'], 'oversight', errors);
    return;
  }
  if (item.status === 'institution-determined') {
    closed(item, ['status', 'determination', 'institutionName', 'protocolReference', 'determinedAt'], 'oversight', errors);
    if (!['approved', 'exempt', 'not-human-subjects-research'].includes(String(item.determination))) {
      errors.push('oversight.determination must be approved, exempt, or not-human-subjects-research.');
    }
    textValue(item.institutionName, 'oversight.institutionName', errors, RESEARCH_MANIFEST_LIMITS.maxShortTextLength);
    textValue(item.protocolReference, 'oversight.protocolReference', errors, RESEARCH_MANIFEST_LIMITS.maxShortTextLength);
    iso(item.determinedAt, 'oversight.determinedAt', errors);
    return;
  }
  closed(item, ['status'], 'oversight', errors);
  errors.push("oversight.status must be 'draft' or 'institution-determined'.");
}

function validateProtocolItems(
  value: unknown,
  path: string,
  contentKey: 'statement' | 'description',
  errors: string[],
  minimum: number,
): string[] {
  if (!Array.isArray(value)) {
    errors.push(`${path} is required and must be an array.`);
    return [];
  }
  if (value.length < minimum) errors.push(`${path} must contain at least ${minimum} entry.`);
  if (value.length > RESEARCH_MANIFEST_LIMITS.maxProtocolItems) {
    errors.push(`${path} cannot contain more than ${RESEARCH_MANIFEST_LIMITS.maxProtocolItems} entries.`);
  }
  const seen = new Set<string>();
  const ids: string[] = [];
  value.forEach((entry, index) => {
    const itemPath = `${path}[${index}]`;
    const item = record(entry, itemPath, errors);
    if (!item) return;
    closed(item, ['id', contentKey], itemPath, errors);
    if (kebab(item.id, `${itemPath}.id`, errors)) {
      if (seen.has(item.id)) errors.push(`${itemPath}.id duplicates an earlier ${path} ID.`);
      else { seen.add(item.id); ids.push(item.id); }
    }
    textValue(item[contentKey], `${itemPath}.${contentKey}`, errors);
  });
  return ids;
}

function validateProtocol(value: unknown, errors: string[]): void {
  const item = record(value, 'protocol', errors);
  if (!item) return;
  closed(item, ['design', 'purpose', 'population', 'hypotheses', 'objectives', 'outcomes'], 'protocol', errors);
  if (item.design !== 'exploratory' && item.design !== 'confirmatory') {
    errors.push("protocol.design must be 'exploratory' or 'confirmatory'.");
  }
  textValue(item.purpose, 'protocol.purpose', errors);
  const population = record(item.population, 'protocol.population', errors);
  if (population) {
    closed(population, ['description', 'includesMinors', 'vulnerableGroups'], 'protocol.population', errors);
    textValue(population.description, 'protocol.population.description', errors);
    bool(population.includesMinors, 'protocol.population.includesMinors', errors);
    uniqueStrings(population.vulnerableGroups, 'protocol.population.vulnerableGroups', errors, true);
  }
  validateProtocolItems(item.hypotheses, 'protocol.hypotheses', 'statement', errors, item.design === 'confirmatory' ? 1 : 0);
  validateProtocolItems(item.objectives, 'protocol.objectives', 'description', errors, 1);
  validateProtocolItems(item.outcomes, 'protocol.outcomes', 'description', errors, 1);
}

function validateProvider(value: unknown, path: string, errors: string[]): void {
  const item = record(value, path, errors);
  if (!item) return;
  closed(item, ['only', 'policyUrl', 'allowFallbacks', 'requireParameters', 'zeroDataRetention', 'dataCollection'], path, errors);
  if (!Array.isArray(item.only) || item.only.length !== 1) {
    errors.push(`${path}.only must contain exactly one upstream provider identifier.`);
  } else if (!textValue(item.only[0], `${path}.only[0]`, errors, 200)
    || !SAFE_PROVIDER_OR_MODEL_PATTERN.test(item.only[0]) || item.only[0].includes('://')) {
    errors.push(`${path}.only[0] must be a safe provider identifier, not a URL.`);
  }
  https(item.policyUrl, `${path}.policyUrl`, errors);
  literal(item.allowFallbacks, false, `${path}.allowFallbacks`, errors);
  literal(item.requireParameters, true, `${path}.requireParameters`, errors);
  literal(item.zeroDataRetention, true, `${path}.zeroDataRetention`, errors);
  literal(item.dataCollection, 'deny', `${path}.dataCollection`, errors);
}

function validateInference(value: unknown, path: string, errors: string[]): void {
  const item = record(value, path, errors);
  if (!item) return;
  closed(item, ['gateway', 'endpoint', 'requestedModelId', 'provider', 'temperature', 'topP', 'maxTokens', 'seed', 'stream', 'historyWindowMessages'], path, errors);
  literal(item.gateway, 'openrouter', `${path}.gateway`, errors);
  literal(item.endpoint, 'https://openrouter.ai/api/v1/chat/completions', `${path}.endpoint`, errors);
  if (!textValue(item.requestedModelId, `${path}.requestedModelId`, errors, 200)
      || !SAFE_PROVIDER_OR_MODEL_PATTERN.test(item.requestedModelId) || item.requestedModelId.includes('://')) {
    errors.push(`${path}.requestedModelId must be a safe model identifier, not a URL.`);
  }
  validateProvider(item.provider, `${path}.provider`, errors);
  finiteNumber(item.temperature, `${path}.temperature`, errors, 0, 2);
  finiteNumber(item.topP, `${path}.topP`, errors, 0, 1);
  integer(item.maxTokens, `${path}.maxTokens`, errors, 1, 32768);
  if (item.seed !== undefined) integer(item.seed, `${path}.seed`, errors, 0, 0xffffffff);
  literal(item.stream, false, `${path}.stream`, errors);
  integer(item.historyWindowMessages, `${path}.historyWindowMessages`, errors, 0, 100);
}

function validateViewer(value: unknown, path: string, errors: string[]): void {
  const item = record(value, path, errors);
  if (!item) return;
  const keys = ['version', 'allowSeriesSwitch', 'allowFrameNavigation', 'allowWindowLevel', 'allowPanZoom', 'allowAnnotations', 'allowSegmentation'] as const;
  closed(item, keys, path, errors);
  literal(item.version, '1.0', `${path}.version`, errors);
  keys.slice(1).forEach((key) => bool(item[key], `${path}.${key}`, errors));
}

function validateCapture(value: unknown, path: string, errors: string[]): void {
  const item = record(value, path, errors);
  if (!item) return;
  closed(item, ['version', 'pipelineVersion', 'trigger', 'source', 'format', 'quality', 'includeVisibleAnnotations', 'includeTutorPointers', 'bakeViewportTransform'], path, errors);
  literal(item.version, '1.0', `${path}.version`, errors);
  literal(item.pipelineVersion, 'caseattend-canvas-jpeg-v1', `${path}.pipelineVersion`, errors);
  literal(item.trigger, 'send', `${path}.trigger`, errors);
  literal(item.source, 'current-view', `${path}.source`, errors);
  literal(item.format, 'image/jpeg', `${path}.format`, errors);
  literal(item.quality, 0.9, `${path}.quality`, errors);
  bool(item.includeVisibleAnnotations, `${path}.includeVisibleAnnotations`, errors);
  literal(item.includeTutorPointers, false, `${path}.includeTutorPointers`, errors);
  literal(item.bakeViewportTransform, true, `${path}.bakeViewportTransform`, errors);
}

function validateSteps(value: unknown, path: string, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push(`${path} is required and must be an ordered array.`);
    return;
  }
  if (value.length < 1 || value.length > RESEARCH_MANIFEST_LIMITS.maxCaseStepsPerArm) {
    errors.push(`${path} must contain 1-${RESEARCH_MANIFEST_LIMITS.maxCaseStepsPerArm} ordered case steps.`);
  }
  const seen = new Set<string>();
  value.forEach((entry, index) => {
    const itemPath = `${path}[${index}]`;
    const item = record(entry, itemPath, errors);
    if (!item) return;
    closed(item, ['id', 'casePackageRef', 'lessonPlanRef', 'learnerLevel', 'mode', 'systemPromptSha256', 'requestTemplateVersion'], itemPath, errors);
    if (kebab(item.id, `${itemPath}.id`, errors)) {
      if (seen.has(item.id)) errors.push(`${itemPath}.id duplicates an earlier step ID in this arm.`);
      else seen.add(item.id);
    }
    validateCaseRef(item.casePackageRef, `${itemPath}.casePackageRef`, errors);
    validateLessonRef(item.lessonPlanRef, `${itemPath}.lessonPlanRef`, errors);
    if (typeof item.learnerLevel !== 'string' || !LEARNER_LEVELS.has(item.learnerLevel as LearnerLevel)) {
      errors.push(`${itemPath}.learnerLevel must be a supported CaseAttend learner level.`);
    }
    if (item.mode !== 'chat' && item.mode !== 'deep_think') {
      errors.push(`${itemPath}.mode must be 'chat' or 'deep_think'; Research Manifest v1 does not permit search.`);
    }
    sha(item.systemPromptSha256, `${itemPath}.systemPromptSha256`, errors);
    literal(item.requestTemplateVersion, '1.0', `${itemPath}.requestTemplateVersion`, errors);
  });
}

function validateArms(value: unknown, errors: string[]): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(value)) {
    errors.push('arms is required and must be an array.');
    return ids;
  }
  if (value.length < 1 || value.length > RESEARCH_MANIFEST_LIMITS.maxArms) {
    errors.push(`arms must contain 1-${RESEARCH_MANIFEST_LIMITS.maxArms} study arms.`);
  }
  value.forEach((entry, index) => {
    const path = `arms[${index}]`;
    const item = record(entry, path, errors);
    if (!item) return;
    closed(item, ['id', 'label', 'inferencePolicy', 'viewerPolicy', 'capturePolicy', 'caseSteps'], path, errors);
    if (kebab(item.id, `${path}.id`, errors)) {
      if (ids.has(item.id)) errors.push(`${path}.id duplicates an earlier arm ID.`);
      else ids.add(item.id);
    }
    textValue(item.label, `${path}.label`, errors, RESEARCH_MANIFEST_LIMITS.maxShortTextLength);
    validateInference(item.inferencePolicy, `${path}.inferencePolicy`, errors);
    validateViewer(item.viewerPolicy, `${path}.viewerPolicy`, errors);
    validateCapture(item.capturePolicy, `${path}.capturePolicy`, errors);
    validateSteps(item.caseSteps, `${path}.caseSteps`, errors);
  });
  return ids;
}

function validateAssignment(value: unknown, armIds: ReadonlySet<string>, errors: string[]): void {
  const item = record(value, 'assignment', errors);
  if (!item) return;
  if (item.method === 'fixed') {
    closed(item, ['method', 'armId'], 'assignment', errors);
    if (textValue(item.armId, 'assignment.armId', errors, RESEARCH_MANIFEST_LIMITS.maxShortTextLength)
        && !armIds.has(item.armId)) errors.push('assignment.armId must reference a declared arm.');
    return;
  }
  if (item.method === 'sha256-weighted-v1') {
    closed(item, ['method', 'allocations'], 'assignment', errors);
    if (!Array.isArray(item.allocations)) {
      errors.push('assignment.allocations is required and must be an array.');
      return;
    }
    if (item.allocations.length !== armIds.size) {
      errors.push('assignment.allocations must contain every declared arm exactly once.');
    }
    const seen = new Set<string>();
    let total = 0;
    item.allocations.forEach((entry, index) => {
      const path = `assignment.allocations[${index}]`;
      const allocation = record(entry, path, errors);
      if (!allocation) return;
      closed(allocation, ['armId', 'weight'], path, errors);
      if (textValue(allocation.armId, `${path}.armId`, errors, RESEARCH_MANIFEST_LIMITS.maxShortTextLength)) {
        if (!armIds.has(allocation.armId)) errors.push(`${path}.armId must reference a declared arm.`);
        if (seen.has(allocation.armId)) errors.push(`${path}.armId duplicates an earlier allocation.`);
        seen.add(allocation.armId);
      }
      if (integer(allocation.weight, `${path}.weight`, errors, 1, RESEARCH_MANIFEST_LIMITS.maxWeight)) {
        total += allocation.weight;
      }
    });
    armIds.forEach((id) => {
      if (!seen.has(id)) errors.push(`assignment.allocations is missing arm '${id}'.`);
    });
    if (total > RESEARCH_MANIFEST_LIMITS.maxTotalWeight) {
      errors.push(`assignment allocation weights cannot total more than ${RESEARCH_MANIFEST_LIMITS.maxTotalWeight}.`);
    }
    return;
  }
  closed(item, ['method'], 'assignment', errors);
  errors.push("assignment.method must be 'fixed' or 'sha256-weighted-v1'.");
}

function validateTaskResponse(value: unknown, path: string, errors: string[]): void {
  const item = record(value, path, errors);
  if (!item) return;
  if (item.kind === 'none') {
    closed(item, ['kind'], path, errors);
    return;
  }
  if (item.kind === 'single-choice') {
    closed(item, ['kind', 'options'], path, errors);
    if (!Array.isArray(item.options)) {
      errors.push(`${path}.options is required and must be an array.`);
      return;
    }
    if (item.options.length < 2 || item.options.length > RESEARCH_MANIFEST_LIMITS.maxTaskOptions) {
      errors.push(`${path}.options must contain 2-${RESEARCH_MANIFEST_LIMITS.maxTaskOptions} choices.`);
    }
    const seen = new Set<string>();
    item.options.forEach((entry, index) => {
      const optionPath = `${path}.options[${index}]`;
      const option = record(entry, optionPath, errors);
      if (!option) return;
      closed(option, ['id', 'label'], optionPath, errors);
      if (kebab(option.id, `${optionPath}.id`, errors)) {
        if (seen.has(option.id)) errors.push(`${optionPath}.id duplicates an earlier option ID.`);
        else seen.add(option.id);
      }
      textValue(option.label, `${optionPath}.label`, errors, RESEARCH_MANIFEST_LIMITS.maxShortTextLength);
    });
    return;
  }
  if (item.kind === 'integer-scale') {
    closed(item, ['kind', 'min', 'max', 'minLabel', 'maxLabel'], path, errors);
    const validMin = integer(item.min, `${path}.min`, errors, -1000, 1000);
    const validMax = integer(item.max, `${path}.max`, errors, -1000, 1000);
    if (validMin && validMax && (item.max as number) <= (item.min as number)) {
      errors.push(`${path}.max must be greater than ${path}.min.`);
    }
    if (validMin && validMax && (item.max as number) - (item.min as number) > 100) {
      errors.push(`${path} cannot span more than 100 integer response values.`);
    }
    textValue(item.minLabel, `${path}.minLabel`, errors, RESEARCH_MANIFEST_LIMITS.maxShortTextLength);
    textValue(item.maxLabel, `${path}.maxLabel`, errors, RESEARCH_MANIFEST_LIMITS.maxShortTextLength);
    return;
  }
  closed(item, ['kind'], path, errors);
  errors.push(`${path}.kind must be none, single-choice, or integer-scale.`);
}

function validateTaskArray(value: unknown, path: string, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push(`${path} is required and must be an array.`);
    return;
  }
  if (value.length > RESEARCH_MANIFEST_LIMITS.maxTasksPerPhase) {
    errors.push(`${path} cannot contain more than ${RESEARCH_MANIFEST_LIMITS.maxTasksPerPhase} tasks.`);
  }
  const seen = new Set<string>();
  value.forEach((entry, index) => {
    const taskPath = `${path}[${index}]`;
    const task = record(entry, taskPath, errors);
    if (!task) return;
    closed(task, ['id', 'title', 'instructions', 'response'], taskPath, errors);
    if (kebab(task.id, `${taskPath}.id`, errors)) {
      if (seen.has(task.id)) errors.push(`${taskPath}.id duplicates an earlier task in this phase.`);
      else seen.add(task.id);
    }
    textValue(task.title, `${taskPath}.title`, errors, RESEARCH_MANIFEST_LIMITS.maxShortTextLength);
    textValue(task.instructions, `${taskPath}.instructions`, errors);
    validateTaskResponse(task.response, `${taskPath}.response`, errors);
  });
}

function validateTasks(value: unknown, errors: string[]): void {
  const item = record(value, 'tasks', errors);
  if (!item) return;
  closed(item, ['pre', 'post'], 'tasks', errors);
  validateTaskArray(item.pre, 'tasks.pre', errors);
  validateTaskArray(item.post, 'tasks.post', errors);
  const ids = new Map<string, string>();
  for (const phase of ['pre', 'post'] as const) {
    if (!Array.isArray(item[phase])) continue;
    item[phase].forEach((entry, index) => {
      if (!isRecord(entry) || typeof entry.id !== 'string') return;
      const path = `tasks.${phase}[${index}].id`;
      const previous = ids.get(entry.id);
      if (previous) errors.push(`${path} duplicates ${previous}; task IDs must be unique across all phases.`);
      else ids.set(entry.id, path);
    });
  }
}

function validateRawChat(value: unknown, errors: string[]): void {
  const item = record(value, 'collection.rawChat', errors);
  if (!item) return;
  if (item.enabled === false) {
    closed(item, ['enabled'], 'collection.rawChat', errors);
    return;
  }
  if (item.enabled === true) {
    closed(item, ['enabled', 'purpose', 'includes', 'participantDisclosure', 'accessRoles'], 'collection.rawChat', errors);
    textValue(item.purpose, 'collection.rawChat.purpose', errors);
    const includes = uniqueStrings(item.includes, 'collection.rawChat.includes', errors, false, 2);
    includes.forEach((entry, index) => {
      if (entry !== 'learner-text' && entry !== 'model-text') {
        errors.push(`collection.rawChat.includes[${index}] must be learner-text or model-text.`);
      }
    });
    textValue(item.participantDisclosure, 'collection.rawChat.participantDisclosure', errors);
    if (!Array.isArray(item.accessRoles) || item.accessRoles.length !== 1 || item.accessRoles[0] !== 'research-team') {
      errors.push("collection.rawChat.accessRoles must be exactly ['research-team'].");
    }
    return;
  }
  closed(item, ['enabled'], 'collection.rawChat', errors);
  errors.push('collection.rawChat.enabled is required and must be true or false.');
}

function validateCollection(value: unknown, errors: string[]): void {
  const item = record(value, 'collection', errors);
  if (!item) return;
  closed(item, ['sessionEvents', 'taskResponses', 'currentViewCapture', 'rawChat'], 'collection', errors);
  const events = record(item.sessionEvents, 'collection.sessionEvents', errors);
  if (events) {
    closed(events, ['enabled', 'schema', 'schemaVersion'], 'collection.sessionEvents', errors);
    literal(events.enabled, true, 'collection.sessionEvents.enabled', errors);
    literal(events.schema, 'caseattend.research-record', 'collection.sessionEvents.schema', errors);
    literal(events.schemaVersion, '1.0', 'collection.sessionEvents.schemaVersion', errors);
  }
  const responses = record(item.taskResponses, 'collection.taskResponses', errors);
  if (responses) {
    closed(responses, ['enabled', 'schema', 'schemaVersion'], 'collection.taskResponses', errors);
    bool(responses.enabled, 'collection.taskResponses.enabled', errors);
    literal(responses.schema, 'caseattend.research-task-response', 'collection.taskResponses.schema', errors);
    literal(responses.schemaVersion, '1.0', 'collection.taskResponses.schemaVersion', errors);
  }
  const capture = record(item.currentViewCapture, 'collection.currentViewCapture', errors);
  if (capture) {
    closed(capture, ['generated', 'transmittedToInferenceGateway', 'storedInSessionEvents', 'exported'], 'collection.currentViewCapture', errors);
    literal(capture.generated, 'on-send', 'collection.currentViewCapture.generated', errors);
    literal(capture.transmittedToInferenceGateway, true, 'collection.currentViewCapture.transmittedToInferenceGateway', errors);
    literal(capture.storedInSessionEvents, false, 'collection.currentViewCapture.storedInSessionEvents', errors);
    literal(capture.exported, false, 'collection.currentViewCapture.exported', errors);
  }
  validateRawChat(item.rawChat, errors);
}

function exactArray(value: unknown, expected: readonly string[], path: string, errors: string[]): void {
  if (!Array.isArray(value) || value.length !== expected.length || value.some((entry, index) => entry !== expected[index])) {
    errors.push(`${path} must be exactly ${JSON.stringify(expected)}.`);
  }
}

function validateDataManagement(value: unknown, errors: string[]): void {
  const item = record(value, 'dataManagement', errors);
  if (!item) return;
  closed(item, ['browserStorage', 'automaticRemoteSync', 'studyExport', 'exportFormats', 'browserDeleteAfter', 'exportedCopiesDeleteAfter', 'accessRoles', 'deletionInstructions', 'dataFlow'], 'dataManagement', errors);
  literal(item.browserStorage, 'indexeddb-required', 'dataManagement.browserStorage', errors);
  literal(item.automaticRemoteSync, false, 'dataManagement.automaticRemoteSync', errors);
  literal(item.studyExport, 'manual-file-export', 'dataManagement.studyExport', errors);
  const formats = uniqueStrings(item.exportFormats, 'dataManagement.exportFormats', errors, false, 2);
  formats.forEach((entry, index) => {
    if (entry !== 'jsonl' && entry !== 'csv') errors.push(`dataManagement.exportFormats[${index}] must be jsonl or csv.`);
  });
  const browserDateValid = iso(item.browserDeleteAfter, 'dataManagement.browserDeleteAfter', errors);
  const exportDateValid = iso(item.exportedCopiesDeleteAfter, 'dataManagement.exportedCopiesDeleteAfter', errors);
  if (browserDateValid && exportDateValid
      && Date.parse(item.exportedCopiesDeleteAfter as string) < Date.parse(item.browserDeleteAfter as string)) {
    errors.push('dataManagement.exportedCopiesDeleteAfter cannot be earlier than browserDeleteAfter.');
  }
  uniqueStrings(item.accessRoles, 'dataManagement.accessRoles', errors, false, 16);
  textValue(item.deletionInstructions, 'dataManagement.deletionInstructions', errors);
  const flow = record(item.dataFlow, 'dataManagement.dataFlow', errors);
  if (!flow) return;
  closed(flow, ['inference', 'studyExport'], 'dataManagement.dataFlow', errors);
  const inference = record(flow.inference, 'dataManagement.dataFlow.inference', errors);
  if (inference) {
    closed(inference, ['endpoint', 'sent', 'received', 'occurs', 'authentication'], 'dataManagement.dataFlow.inference', errors);
    literal(inference.endpoint, 'https://openrouter.ai/api/v1/chat/completions', 'dataManagement.dataFlow.inference.endpoint', errors);
    exactArray(inference.sent, ['system-prompt', 'learner-message', 'current-view-image'], 'dataManagement.dataFlow.inference.sent', errors);
    exactArray(inference.received, ['model-response'], 'dataManagement.dataFlow.inference.received', errors);
    literal(inference.occurs, 'when-participant-sends', 'dataManagement.dataFlow.inference.occurs', errors);
    const authentication = record(inference.authentication, 'dataManagement.dataFlow.inference.authentication', errors);
    if (authentication) {
      closed(authentication, ['method', 'storage', 'sentTo', 'includedInResearchRecords'], 'dataManagement.dataFlow.inference.authentication', errors);
      literal(authentication.method, 'browser-held-openrouter-api-key', 'dataManagement.dataFlow.inference.authentication.method', errors);
      literal(authentication.storage, 'browser-local-storage', 'dataManagement.dataFlow.inference.authentication.storage', errors);
      literal(authentication.sentTo, 'openrouter-only', 'dataManagement.dataFlow.inference.authentication.sentTo', errors);
      literal(authentication.includedInResearchRecords, false, 'dataManagement.dataFlow.inference.authentication.includedInResearchRecords', errors);
    }
  }
  const studyExport = record(flow.studyExport, 'dataManagement.dataFlow.studyExport', errors);
  if (studyExport) {
    closed(studyExport, ['destination', 'automaticUpload'], 'dataManagement.dataFlow.studyExport', errors);
    literal(studyExport.destination, 'research-team', 'dataManagement.dataFlow.studyExport.destination', errors);
    literal(studyExport.automaticUpload, false, 'dataManagement.dataFlow.studyExport.automaticUpload', errors);
  }
}

function validateParticipantInformation(value: unknown, errors: string[]): void {
  const item = record(value, 'participantInformation', errors);
  if (!item) return;
  closed(item, ['version', 'language', 'keyInformation', 'purpose', 'procedures', 'risks', 'benefits', 'privacy', 'voluntaryParticipation', 'compensation', 'vlmDisclosure', 'contacts', 'acknowledgement'], 'participantInformation', errors);
  semver(item.version, 'participantInformation.version', errors);
  literal(item.language, 'en', 'participantInformation.language', errors);
  for (const key of ['keyInformation', 'purpose', 'procedures', 'risks', 'benefits', 'privacy', 'voluntaryParticipation', 'compensation'] as const) {
    textValue(item[key], `participantInformation.${key}`, errors);
  }
  const disclosure = record(item.vlmDisclosure, 'participantInformation.vlmDisclosure', errors);
  if (disclosure) {
    closed(disclosure, ['term', 'plainLanguage', 'limitations', 'notMedicalAdvice'], 'participantInformation.vlmDisclosure', errors);
    literal(disclosure.term, 'vision-language model (VLM)', 'participantInformation.vlmDisclosure.term', errors);
    textValue(disclosure.plainLanguage, 'participantInformation.vlmDisclosure.plainLanguage', errors);
    textValue(disclosure.limitations, 'participantInformation.vlmDisclosure.limitations', errors);
    literal(disclosure.notMedicalAdvice, true, 'participantInformation.vlmDisclosure.notMedicalAdvice', errors);
  }
  if (!Array.isArray(item.contacts)) errors.push('participantInformation.contacts is required and must be an array.');
  else {
    if (item.contacts.length < 1 || item.contacts.length > RESEARCH_MANIFEST_LIMITS.maxContacts) {
      errors.push(`participantInformation.contacts must contain 1-${RESEARCH_MANIFEST_LIMITS.maxContacts} contacts.`);
    }
    item.contacts.forEach((entry, index) => {
      const path = `participantInformation.contacts[${index}]`;
      const contact = record(entry, path, errors);
      if (!contact) return;
      closed(contact, ['name', 'role', 'email'], path, errors);
      textValue(contact.name, `${path}.name`, errors, RESEARCH_MANIFEST_LIMITS.maxShortTextLength);
      textValue(contact.role, `${path}.role`, errors, RESEARCH_MANIFEST_LIMITS.maxShortTextLength);
      if (textValue(contact.email, `${path}.email`, errors, 320) && !EMAIL_PATTERN.test(contact.email)) {
        errors.push(`${path}.email must be a valid contact email address.`);
      }
    });
  }
  const acknowledgement = record(item.acknowledgement, 'participantInformation.acknowledgement', errors);
  if (acknowledgement?.kind === 'required') {
    closed(acknowledgement, ['kind'], 'participantInformation.acknowledgement', errors);
  } else if (acknowledgement?.kind === 'institutionally-waived') {
    closed(acknowledgement, ['kind', 'determinationReference'], 'participantInformation.acknowledgement', errors);
    textValue(acknowledgement.determinationReference, 'participantInformation.acknowledgement.determinationReference', errors, RESEARCH_MANIFEST_LIMITS.maxShortTextLength);
  } else if (acknowledgement) {
    closed(acknowledgement, ['kind'], 'participantInformation.acknowledgement', errors);
    errors.push('participantInformation.acknowledgement.kind must be required or institutionally-waived.');
  }
}

function validateParticipantCodes(value: unknown, errors: string[]): void {
  const item = record(value, 'participantCodes', errors);
  if (!item) return;
  closed(item, ['format', 'length', 'derivation', 'issuance', 'linkageKeyStorage', 'reuseControl'], 'participantCodes', errors);
  literal(item.format, 'crockford-base32-v1', 'participantCodes.format', errors);
  literal(item.length, 20, 'participantCodes.length', errors);
  literal(item.derivation, 'sha256-manifest-code-v1', 'participantCodes.derivation', errors);
  literal(item.issuance, 'institution-assigned-outside-caseattend', 'participantCodes.issuance', errors);
  literal(item.linkageKeyStorage, 'outside-caseattend', 'participantCodes.linkageKeyStorage', errors);
  literal(item.reuseControl, 'external-study-procedure', 'participantCodes.reuseControl', errors);
}

function validateCrossFieldConsistency(draft: Record<string, unknown>, errors: string[]): void {
  const tasks = isRecord(draft.tasks) ? draft.tasks : null;
  const collection = isRecord(draft.collection) ? draft.collection : null;
  const taskResponses = collection && isRecord(collection.taskResponses)
    ? collection.taskResponses
    : null;
  const hasCollectedTask = tasks && (['pre', 'post'] as const).some((phase) => (
    Array.isArray(tasks[phase])
    && tasks[phase].some((task) => (
      isRecord(task) && isRecord(task.response) && task.response.kind !== 'none'
    ))
  ));
  if (hasCollectedTask && taskResponses?.enabled !== true) {
    errors.push('collection.taskResponses.enabled must be true when a pre or post task requests a response.');
  }

  const rawChat = collection && isRecord(collection.rawChat) ? collection.rawChat : null;
  const dataManagement = isRecord(draft.dataManagement) ? draft.dataManagement : null;
  if (
    rawChat?.enabled === true
    && (!Array.isArray(dataManagement?.accessRoles) || !dataManagement.accessRoles.includes('research-team'))
  ) {
    errors.push("dataManagement.accessRoles must include 'research-team' when raw chat collection is enabled.");
  }

  const participantInformation = isRecord(draft.participantInformation)
    ? draft.participantInformation
    : null;
  const acknowledgement = participantInformation && isRecord(participantInformation.acknowledgement)
    ? participantInformation.acknowledgement
    : null;
  const oversight = isRecord(draft.oversight) ? draft.oversight : null;
  if (acknowledgement?.kind === 'institutionally-waived') {
    if (oversight?.status !== 'institution-determined') {
      errors.push('An institutionally-waived acknowledgement requires institution-determined oversight.');
    } else if (acknowledgement.determinationReference !== oversight.protocolReference) {
      errors.push('participantInformation.acknowledgement.determinationReference must exactly match oversight.protocolReference.');
    }
  }
}

function validateDraft(value: unknown, allowManifest = false): ResearchManifestValidationResult {
  const errors: string[] = [];
  const draft = record(value, 'researchManifest', errors);
  if (!draft) return { valid: false, errors };
  const topKeys = ['schema', 'schemaVersion', 'version', 'id', 'title', 'application', 'deployment', 'oversight', 'protocol', 'arms', 'assignment', 'participantCodes', 'tasks', 'collection', 'dataManagement', 'participantInformation'];
  closed(draft, allowManifest ? [...topKeys, 'manifest'] : topKeys, 'researchManifest', errors);
  literal(draft.schema, RESEARCH_MANIFEST_SCHEMA, 'researchManifest.schema', errors);
  literal(draft.schemaVersion, RESEARCH_MANIFEST_SCHEMA_VERSION, 'researchManifest.schemaVersion', errors);
  semver(draft.version, 'researchManifest.version', errors);
  kebab(draft.id, 'researchManifest.id', errors);
  textValue(draft.title, 'researchManifest.title', errors, RESEARCH_MANIFEST_LIMITS.maxShortTextLength);
  validateApplication(draft.application, errors);
  validateDeployment(draft.deployment, errors);
  validateOversight(draft.oversight, errors);
  validateProtocol(draft.protocol, errors);
  const armIds = validateArms(draft.arms, errors);
  validateAssignment(draft.assignment, armIds, errors);
  validateParticipantCodes(draft.participantCodes, errors);
  validateTasks(draft.tasks, errors);
  validateCollection(draft.collection, errors);
  validateDataManagement(draft.dataManagement, errors);
  validateParticipantInformation(draft.participantInformation, errors);
  validateCrossFieldConsistency(draft, errors);
  if (errors.length === 0) {
    try {
      const payload = allowManifest ? manifestPayload(draft as unknown as ResearchManifestV1) : draft;
      const size = new TextEncoder().encode(canonicalizeJson(payload)).byteLength;
      if (size > RESEARCH_MANIFEST_LIMITS.maxCanonicalBytes) {
        errors.push(`Research Manifest v1 canonical JSON cannot exceed ${RESEARCH_MANIFEST_LIMITS.maxCanonicalBytes} bytes.`);
      }
    } catch (error) {
      errors.push(`researchManifest must contain only canonical JSON values: ${error instanceof Error ? error.message : 'invalid value'}.`);
    }
  }
  return { valid: errors.length === 0, errors };
}

function manifestPayload(value: ResearchManifestV1Draft | ResearchManifestV1): ResearchManifestV1Draft {
  const { manifest: _manifest, ...draft } = value as ResearchManifestV1;
  return draft as ResearchManifestV1Draft;
}

function validationError(prefix: string, errors: readonly string[]): Error {
  return new Error(`${prefix}\n${errors.map((error) => `- ${error}`).join('\n')}`);
}

async function sha256Text(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto is unavailable. Research Manifest hashing requires crypto.subtle.');
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function validateResearchManifestDraftV1(value: unknown): ResearchManifestValidationResult {
  return validateDraft(value);
}

export function validateResearchManifestV1(value: unknown): ResearchManifestValidationResult {
  const result = validateDraft(value, true);
  if (!isRecord(value)) return result;
  const manifest = record(value.manifest, 'researchManifest.manifest', result.errors);
  if (manifest) {
    closed(manifest, ['algorithm', 'sha256'], 'researchManifest.manifest', result.errors);
    literal(manifest.algorithm, 'SHA-256', 'researchManifest.manifest.algorithm', result.errors);
    sha(manifest.sha256, 'researchManifest.manifest.sha256', result.errors);
  }
  result.valid = result.errors.length === 0;
  return result;
}

export async function computeResearchManifestHash(
  value: ResearchManifestV1Draft | ResearchManifestV1,
): Promise<string> {
  const draft = manifestPayload(value);
  const validation = validateResearchManifestDraftV1(draft);
  if (!validation.valid) throw validationError('Cannot hash an invalid Research Manifest v1:', validation.errors);
  return sha256Text(canonicalizeJson(draft));
}

export async function computeResearchInferencePolicyHash(
  policy: ResearchInferencePolicyV1,
): Promise<string> {
  const errors: string[] = [];
  validateInference(policy, 'inferencePolicy', errors);
  if (errors.length > 0) {
    throw validationError('Cannot hash an invalid Research Inference Policy v1:', errors);
  }
  return sha256Text(canonicalizeJson(policy));
}

export async function finalizeResearchManifestV1(
  draft: ResearchManifestV1Draft,
): Promise<ResearchManifestV1> {
  const validation = validateResearchManifestDraftV1(draft);
  if (!validation.valid) throw validationError('Cannot finalize an invalid Research Manifest v1:', validation.errors);
  return {
    ...draft,
    manifest: { algorithm: 'SHA-256', sha256: await computeResearchManifestHash(draft) },
  };
}

export async function createResearchManifestV1(
  input: ResearchManifestCreateInput,
): Promise<ResearchManifestV1> {
  return finalizeResearchManifestV1({
    ...input,
    schema: RESEARCH_MANIFEST_SCHEMA,
    schemaVersion: RESEARCH_MANIFEST_SCHEMA_VERSION,
    participantCodes: {
      format: 'crockford-base32-v1',
      length: 20,
      derivation: 'sha256-manifest-code-v1',
      issuance: 'institution-assigned-outside-caseattend',
      linkageKeyStorage: 'outside-caseattend',
      reuseControl: 'external-study-procedure',
    },
    collection: {
      ...input.collection,
      rawChat: input.collection.rawChat ?? { enabled: false },
    },
  });
}

export async function verifyResearchManifestHash(value: ResearchManifestV1): Promise<boolean> {
  const validation = validateResearchManifestV1(value);
  if (!validation.valid) return false;
  return (await computeResearchManifestHash(value)) === value.manifest.sha256;
}

export function getResearchManifestRef(value: ResearchManifestV1): ResearchManifestRef {
  const validation = validateResearchManifestV1(value);
  if (!validation.valid) throw validationError('Cannot reference an invalid Research Manifest v1:', validation.errors);
  return { id: value.id, version: value.version, sha256: value.manifest.sha256 };
}
