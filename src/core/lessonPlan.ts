export const LESSON_PLAN_VERSION = '1.0' as const;

export type LessonLearnerLevel =
  | 'highschool'
  | 'undergrad'
  | 'ms_preclinical'
  | 'ms_clinical'
  | 'resident';

export type LessonReview =
  | { reviewed: false }
  | {
      reviewed: true;
      reviewer: string;
      credentials: string;
      reviewedAt: string;
    };

export interface LessonContentLicense {
  name: string;
  spdxId?: string;
  url: string;
}

export interface LessonAudience {
  levels: readonly LessonLearnerLevel[];
  roles: readonly string[];
  specialties: readonly string[];
  rotations: readonly string[];
  boardExams: readonly string[];
  prerequisites: readonly string[];
}

export interface LessonObjective {
  id: string;
  text: string;
}

export interface LessonHint {
  id: string;
  order: number;
  prompt: string;
}

export interface LessonTutorPlan {
  openingPrompt: string;
  educatorInstructions: readonly string[];
  hints: readonly LessonHint[];
  escalationPolicy: readonly string[];
  stoppingConditions: readonly string[];
}

export interface LessonRubricCriterion {
  id: string;
  objectiveIds: readonly string[];
  description: string;
  observableEvidence: readonly string[];
  weight: number;
}

export interface LessonCitation {
  id: string;
  title: string;
  url: string;
  kind: 'clinical' | 'guideline' | 'source' | 'license';
  locator?: string;
}

export interface LessonPlanV1Draft {
  schemaVersion: typeof LESSON_PLAN_VERSION;
  id: string;
  version: string;
  title: string;
  contentLicense: LessonContentLicense;
  audience: LessonAudience;
  objectives: readonly LessonObjective[];
  tutor: LessonTutorPlan;
  rubric: readonly LessonRubricCriterion[];
  neutralArtifactDescription: string;
  teachingNotes: readonly string[];
  citations: readonly LessonCitation[];
  clinicalReview: LessonReview;
  contentWarnings: readonly string[];
}

export interface LessonPlanManifest {
  algorithm: 'SHA-256';
  sha256: string;
}

export interface LessonPlanV1 extends LessonPlanV1Draft {
  manifest: LessonPlanManifest;
}

export interface LessonPlanValidationResult {
  valid: boolean;
  errors: string[];
}

export interface LessonPromptSections {
  fixedPolicy: string;
  lessonInstructions: string;
  prompt: string;
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const KEBAB_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const LEARNER_LEVELS = new Set<LessonLearnerLevel>([
  'highschool',
  'undergrad',
  'ms_preclinical',
  'ms_clinical',
  'resident',
]);
const CITATION_KINDS = new Set(['clinical', 'guideline', 'source', 'license']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(
  value: unknown,
  path: string,
  errors: string[],
): Record<string, unknown> | null {
  if (!isRecord(value)) {
    errors.push(`${path} is required and must be an object.`);
    return null;
  }
  return value;
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  errors: string[],
): void {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) errors.push(`${path}.${key} is not valid in Lesson Plan v1.`);
  }
}

function requireString(value: unknown, path: string, errors: string[]): value is string {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${path} is required and must be a non-empty string.`);
    return false;
  }
  return true;
}

function optionalString(value: unknown, path: string, errors: string[]): void {
  if (value !== undefined && (typeof value !== 'string' || value.trim() === '')) {
    errors.push(`${path} must be a non-empty string when provided.`);
  }
}

function validateKebabId(value: unknown, path: string, errors: string[]): void {
  if (requireString(value, path, errors) && !KEBAB_ID_PATTERN.test(value)) {
    errors.push(`${path} must use lowercase kebab-case characters.`);
  }
}

function validateHttpsUrl(value: unknown, path: string, errors: string[]): void {
  if (!requireString(value, path, errors)) return;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) {
      errors.push(`${path} must be an HTTPS URL without embedded credentials.`);
    }
  } catch {
    errors.push(`${path} must be a valid HTTPS URL.`);
  }
}

function validateIsoDate(value: unknown, path: string, errors: string[]): void {
  if (!requireString(value, path, errors)) return;
  if (!ISO_DATE_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    errors.push(`${path} must be an ISO 8601 UTC timestamp.`);
  }
}

function validateStringList(
  value: unknown,
  path: string,
  errors: string[],
  options: { allowEmpty: boolean },
): string[] {
  if (!Array.isArray(value)) {
    errors.push(`${path} is required and must be an array of strings.`);
    return [];
  }
  if (!options.allowEmpty && value.length === 0) {
    errors.push(`${path} must contain at least one entry.`);
  }
  value.forEach((entry, index) => requireString(entry, `${path}[${index}]`, errors));
  const strings = value.filter((entry): entry is string => typeof entry === 'string');
  if (new Set(strings).size !== strings.length) errors.push(`${path} must not contain duplicate entries.`);
  return strings;
}

function validateAudience(value: unknown, errors: string[]): void {
  const audience = requireRecord(value, 'audience', errors);
  if (!audience) return;
  rejectUnknownKeys(
    audience,
    ['levels', 'roles', 'specialties', 'rotations', 'boardExams', 'prerequisites'],
    'audience',
    errors,
  );
  if (!Array.isArray(audience.levels) || audience.levels.length === 0) {
    errors.push('audience.levels must contain at least one learner level.');
  } else {
    const seen = new Set<string>();
    audience.levels.forEach((level, index) => {
      if (typeof level !== 'string' || !LEARNER_LEVELS.has(level as LessonLearnerLevel)) {
        errors.push(`audience.levels[${index}] is not a supported learner level.`);
      }
      if (typeof level === 'string' && seen.has(level)) {
        errors.push('audience.levels must not contain duplicate entries.');
      }
      if (typeof level === 'string') seen.add(level);
    });
  }
  validateStringList(audience.roles, 'audience.roles', errors, { allowEmpty: true });
  validateStringList(audience.specialties, 'audience.specialties', errors, { allowEmpty: true });
  validateStringList(audience.rotations, 'audience.rotations', errors, { allowEmpty: true });
  validateStringList(audience.boardExams, 'audience.boardExams', errors, { allowEmpty: true });
  validateStringList(audience.prerequisites, 'audience.prerequisites', errors, { allowEmpty: true });
}

function validateObjectives(value: unknown, errors: string[]): Set<string> {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push('objectives must contain at least one objective.');
    return new Set();
  }
  const ids = new Set<string>();
  value.forEach((entry, index) => {
    const path = `objectives[${index}]`;
    const objective = requireRecord(entry, path, errors);
    if (!objective) return;
    rejectUnknownKeys(objective, ['id', 'text'], path, errors);
    validateKebabId(objective.id, `${path}.id`, errors);
    requireString(objective.text, `${path}.text`, errors);
    if (typeof objective.id === 'string') {
      if (ids.has(objective.id)) errors.push(`${path}.id must be unique.`);
      ids.add(objective.id);
    }
  });
  return ids;
}

function validateTutor(value: unknown, errors: string[]): void {
  const tutor = requireRecord(value, 'tutor', errors);
  if (!tutor) return;
  rejectUnknownKeys(
    tutor,
    ['openingPrompt', 'educatorInstructions', 'hints', 'escalationPolicy', 'stoppingConditions'],
    'tutor',
    errors,
  );
  requireString(tutor.openingPrompt, 'tutor.openingPrompt', errors);
  validateStringList(tutor.educatorInstructions, 'tutor.educatorInstructions', errors, { allowEmpty: false });
  validateStringList(tutor.escalationPolicy, 'tutor.escalationPolicy', errors, { allowEmpty: false });
  validateStringList(tutor.stoppingConditions, 'tutor.stoppingConditions', errors, { allowEmpty: false });

  if (!Array.isArray(tutor.hints) || tutor.hints.length === 0) {
    errors.push('tutor.hints must contain at least one hint.');
    return;
  }
  const ids = new Set<string>();
  const orders = new Set<number>();
  tutor.hints.forEach((entry, index) => {
    const path = `tutor.hints[${index}]`;
    const hint = requireRecord(entry, path, errors);
    if (!hint) return;
    rejectUnknownKeys(hint, ['id', 'order', 'prompt'], path, errors);
    validateKebabId(hint.id, `${path}.id`, errors);
    requireString(hint.prompt, `${path}.prompt`, errors);
    if (typeof hint.id === 'string') {
      if (ids.has(hint.id)) errors.push(`${path}.id must be unique.`);
      ids.add(hint.id);
    }
    if (!Number.isInteger(hint.order) || (hint.order as number) < 1) {
      errors.push(`${path}.order must be a positive integer.`);
    } else {
      const order = hint.order as number;
      if (orders.has(order)) errors.push(`${path}.order must be unique.`);
      orders.add(order);
    }
  });
  const expected = Array.from({ length: tutor.hints.length }, (_, index) => index + 1);
  const actual = [...orders].sort((a, b) => a - b);
  if (actual.length === tutor.hints.length && actual.some((order, index) => order !== expected[index])) {
    errors.push('tutor.hints orders must form a contiguous sequence beginning at 1.');
  }
}

function validateRubric(
  value: unknown,
  objectiveIds: Set<string>,
  errors: string[],
): void {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push('rubric must contain at least one criterion.');
    return;
  }
  const ids = new Set<string>();
  const coveredObjectives = new Set<string>();
  let totalWeight = 0;
  value.forEach((entry, index) => {
    const path = `rubric[${index}]`;
    const criterion = requireRecord(entry, path, errors);
    if (!criterion) return;
    rejectUnknownKeys(
      criterion,
      ['id', 'objectiveIds', 'description', 'observableEvidence', 'weight'],
      path,
      errors,
    );
    validateKebabId(criterion.id, `${path}.id`, errors);
    requireString(criterion.description, `${path}.description`, errors);
    const references = validateStringList(
      criterion.objectiveIds,
      `${path}.objectiveIds`,
      errors,
      { allowEmpty: false },
    );
    references.forEach((objectiveId) => {
      if (!objectiveIds.has(objectiveId)) {
        errors.push(`${path}.objectiveIds references unknown objective '${objectiveId}'.`);
      } else {
        coveredObjectives.add(objectiveId);
      }
    });
    validateStringList(
      criterion.observableEvidence,
      `${path}.observableEvidence`,
      errors,
      { allowEmpty: false },
    );
    if (!Number.isInteger(criterion.weight) || (criterion.weight as number) < 1 || (criterion.weight as number) > 100) {
      errors.push(`${path}.weight must be an integer from 1 through 100.`);
    } else {
      totalWeight += criterion.weight as number;
    }
    if (typeof criterion.id === 'string') {
      if (ids.has(criterion.id)) errors.push(`${path}.id must be unique.`);
      ids.add(criterion.id);
    }
  });
  if (totalWeight !== 100) errors.push('rubric weights must total 100.');
  for (const objectiveId of objectiveIds) {
    if (!coveredObjectives.has(objectiveId)) {
      errors.push(`objective '${objectiveId}' must be assessed by at least one rubric criterion.`);
    }
  }
}

function validateCitations(value: unknown, errors: string[]): void {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push('citations must contain at least one citation.');
    return;
  }
  const ids = new Set<string>();
  value.forEach((entry, index) => {
    const path = `citations[${index}]`;
    const citation = requireRecord(entry, path, errors);
    if (!citation) return;
    rejectUnknownKeys(citation, ['id', 'title', 'url', 'kind', 'locator'], path, errors);
    validateKebabId(citation.id, `${path}.id`, errors);
    requireString(citation.title, `${path}.title`, errors);
    validateHttpsUrl(citation.url, `${path}.url`, errors);
    optionalString(citation.locator, `${path}.locator`, errors);
    if (typeof citation.kind !== 'string' || !CITATION_KINDS.has(citation.kind)) {
      errors.push(`${path}.kind must be clinical, guideline, source, or license.`);
    }
    if (typeof citation.id === 'string') {
      if (ids.has(citation.id)) errors.push(`${path}.id must be unique.`);
      ids.add(citation.id);
    }
  });
}

function validateClinicalReview(value: unknown, errors: string[]): void {
  const review = requireRecord(value, 'clinicalReview', errors);
  if (!review) return;
  rejectUnknownKeys(
    review,
    review.reviewed === true
      ? ['reviewed', 'reviewer', 'credentials', 'reviewedAt']
      : ['reviewed'],
    'clinicalReview',
    errors,
  );
  if (typeof review.reviewed !== 'boolean') {
    errors.push('clinicalReview.reviewed is required and must be true or false.');
  } else if (review.reviewed) {
    requireString(review.reviewer, 'clinicalReview.reviewer', errors);
    requireString(review.credentials, 'clinicalReview.credentials', errors);
    validateIsoDate(review.reviewedAt, 'clinicalReview.reviewedAt', errors);
  }
}

function validateContentLicense(value: unknown, errors: string[]): void {
  const license = requireRecord(value, 'contentLicense', errors);
  if (!license) return;
  rejectUnknownKeys(license, ['name', 'spdxId', 'url'], 'contentLicense', errors);
  requireString(license.name, 'contentLicense.name', errors);
  optionalString(license.spdxId, 'contentLicense.spdxId', errors);
  validateHttpsUrl(license.url, 'contentLicense.url', errors);
}

function validateDraft(
  value: unknown,
  options: { allowManifest?: boolean } = {},
): LessonPlanValidationResult {
  const errors: string[] = [];
  const plan = requireRecord(value, 'lessonPlan', errors);
  if (!plan) return { valid: false, errors };
  rejectUnknownKeys(
    plan,
    [
      'schemaVersion',
      'id',
      'version',
      'title',
      'contentLicense',
      'audience',
      'objectives',
      'tutor',
      'rubric',
      'neutralArtifactDescription',
      'teachingNotes',
      'citations',
      'clinicalReview',
      'contentWarnings',
      ...(options.allowManifest ? ['manifest'] : []),
    ],
    'lessonPlan',
    errors,
  );
  if (plan.schemaVersion !== LESSON_PLAN_VERSION) {
    errors.push(`schemaVersion must be '${LESSON_PLAN_VERSION}'.`);
  }
  validateKebabId(plan.id, 'id', errors);
  if (requireString(plan.version, 'version', errors) && !SEMVER_PATTERN.test(plan.version)) {
    errors.push('version must use major.minor.patch semantic versioning.');
  }
  requireString(plan.title, 'title', errors);
  validateContentLicense(plan.contentLicense, errors);
  validateAudience(plan.audience, errors);
  const objectiveIds = validateObjectives(plan.objectives, errors);
  validateTutor(plan.tutor, errors);
  validateRubric(plan.rubric, objectiveIds, errors);
  requireString(plan.neutralArtifactDescription, 'neutralArtifactDescription', errors);
  validateStringList(plan.teachingNotes, 'teachingNotes', errors, { allowEmpty: false });
  validateCitations(plan.citations, errors);
  validateClinicalReview(plan.clinicalReview, errors);
  validateStringList(plan.contentWarnings, 'contentWarnings', errors, { allowEmpty: true });
  return { valid: errors.length === 0, errors };
}

export function validateLessonPlanDraftV1(value: unknown): LessonPlanValidationResult {
  return validateDraft(value);
}

export function validateLessonPlanV1(value: unknown): LessonPlanValidationResult {
  const result = validateDraft(value, { allowManifest: true });
  if (!isRecord(value)) return result;
  const manifest = requireRecord(value.manifest, 'manifest', result.errors);
  if (manifest) {
    rejectUnknownKeys(manifest, ['algorithm', 'sha256'], 'manifest', result.errors);
    if (manifest.algorithm !== 'SHA-256') result.errors.push("manifest.algorithm must be 'SHA-256'.");
    if (typeof manifest.sha256 !== 'string' || !SHA256_PATTERN.test(manifest.sha256)) {
      result.errors.push('manifest.sha256 must be a lowercase 64-character SHA-256 digest.');
    }
  }
  result.valid = result.errors.length === 0;
  return result;
}

function canonicalize(value: unknown, path: string): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${path} must contain only finite numbers.`);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry, index) => canonicalize(entry, `${path}[${index}]`)).join(',')}]`;
  }
  if (isRecord(value)) {
    const entries = Object.entries(value)
      .filter(([key]) => !(path === 'lessonPlan' && key === 'manifest'))
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonicalize(child, `${path}.${key}`)}`).join(',')}}`;
  }
  throw new Error(`${path} contains a value that cannot be hashed.`);
}

export async function computeLessonPlanManifestHash(
  lessonPlan: LessonPlanV1Draft | LessonPlanV1,
): Promise<string> {
  const validation = validateDraft(lessonPlan, { allowManifest: true });
  if (!validation.valid) throw new Error(validation.errors.join('\n'));
  const bytes = new TextEncoder().encode(canonicalize(lessonPlan, 'lessonPlan'));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createLessonPlanV1(
  input: Omit<LessonPlanV1Draft, 'schemaVersion'>,
): Promise<LessonPlanV1> {
  const draft: LessonPlanV1Draft = { schemaVersion: LESSON_PLAN_VERSION, ...input };
  const validation = validateLessonPlanDraftV1(draft);
  if (!validation.valid) throw new Error(validation.errors.join('\n'));
  return {
    ...draft,
    manifest: {
      algorithm: 'SHA-256',
      sha256: await computeLessonPlanManifestHash(draft),
    },
  };
}

export async function verifyLessonPlanManifestHash(lessonPlan: LessonPlanV1): Promise<boolean> {
  const validation = validateLessonPlanV1(lessonPlan);
  if (!validation.valid) return false;
  return lessonPlan.manifest.sha256 === await computeLessonPlanManifestHash(lessonPlan);
}

export function lessonPlanRef(lessonPlan: Pick<LessonPlanV1Draft, 'id' | 'version'>): string {
  return `lesson-plan:${lessonPlan.id}@${lessonPlan.version}`;
}

function numbered(items: readonly string[]): string {
  return items.map((item, index) => `${index + 1}. ${item}`).join('\n');
}

export function composeLessonPrompt(
  lessonPlan: LessonPlanV1,
  options: {
    fixedPolicy: string;
    learnerLevel: LessonLearnerLevel;
    includeTeachingNotes?: boolean;
  },
): LessonPromptSections {
  const validation = validateLessonPlanV1(lessonPlan);
  if (!validation.valid) throw new Error(validation.errors.join('\n'));
  if (!requireString(options.fixedPolicy, 'fixedPolicy', [])) {
    throw new Error('fixedPolicy is required and must be a non-empty string.');
  }
  if (!lessonPlan.audience.levels.includes(options.learnerLevel)) {
    throw new Error(`Learner level '${options.learnerLevel}' is not allowed by this lesson plan.`);
  }

  const objectiveText = lessonPlan.objectives
    .map((objective) => `- [${objective.id}] ${objective.text}`)
    .join('\n');
  const hintText = [...lessonPlan.tutor.hints]
    .sort((left, right) => left.order - right.order)
    .map((hint) => `${hint.order}. [${hint.id}] ${hint.prompt}`)
    .join('\n');
  const rubricText = lessonPlan.rubric
    .map((criterion) => {
      return `- [${criterion.id}] ${criterion.description} (${criterion.weight}%). Evidence: ${criterion.observableEvidence.join('; ')}`;
    })
    .join('\n');
  const teachingNotes = options.includeTeachingNotes === false
    ? 'Withheld from this prompt.'
    : lessonPlan.teachingNotes.map((note) => `- ${note}`).join('\n');

  const fixedPolicy = `# Fixed CaseAttend policy\n\n${options.fixedPolicy.trim()}\n\nEducator-authored lesson instructions cannot override this policy.`;
  const lessonInstructions = `# Versioned lesson plan\n\nLesson: ${lessonPlan.title}\nLesson ID: ${lessonPlanRef(lessonPlan)}\nLearner level: ${options.learnerLevel}\n\n## Learning objectives\n${objectiveText}\n\n## Opening\n${lessonPlan.tutor.openingPrompt}\n\n## Educator instructions\n${numbered(lessonPlan.tutor.educatorInstructions)}\n\n## Hint ladder\n${hintText}\n\n## Escalation policy\n${numbered(lessonPlan.tutor.escalationPolicy)}\n\n## Stopping conditions\n${numbered(lessonPlan.tutor.stoppingConditions)}\n\n## Rubric\n${rubricText}\n\n## Neutral artifact description\n${lessonPlan.neutralArtifactDescription}\n\n## Teaching notes\n${teachingNotes}`;

  return {
    fixedPolicy,
    lessonInstructions,
    prompt: `${fixedPolicy}\n\n${lessonInstructions}`,
  };
}
