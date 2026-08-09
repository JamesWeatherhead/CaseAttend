import {
  validateCasePackageV1,
  verifyCasePackageManifestHash,
  type CasePackageV1,
} from './casePackage';
import {
  getLessonPlanRef,
  validateLessonPlanV1,
  verifyLessonPlanManifestHash,
  type LessonPlanV1,
} from './lessonPlan';

export const CASE_LESSON_BUNDLE_SCHEMA = 'caseattend.case-lesson-bundle' as const;
export const CASE_LESSON_BUNDLE_VERSION = '1.0' as const;

export interface CaseLessonBundleV1 {
  schema: typeof CASE_LESSON_BUNDLE_SCHEMA;
  schemaVersion: typeof CASE_LESSON_BUNDLE_VERSION;
  casePackage: CasePackageV1;
  lessonPlan: LessonPlanV1;
}

export interface CaseLessonBundleValidationResult {
  valid: boolean;
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sameStringList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

export async function validateCaseLessonBundleV1(
  value: unknown,
): Promise<CaseLessonBundleValidationResult> {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { valid: false, errors: ['bundle is required and must be an object.'] };
  }
  const allowed = new Set(['schema', 'schemaVersion', 'casePackage', 'lessonPlan']);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`bundle.${key} is not valid in Case Lesson Bundle v1.`);
  }
  if (value.schema !== CASE_LESSON_BUNDLE_SCHEMA) {
    errors.push(`bundle.schema must be '${CASE_LESSON_BUNDLE_SCHEMA}'.`);
  }
  if (value.schemaVersion !== CASE_LESSON_BUNDLE_VERSION) {
    errors.push(`bundle.schemaVersion must be '${CASE_LESSON_BUNDLE_VERSION}'.`);
  }

  const caseValidation = validateCasePackageV1(value.casePackage);
  if (!caseValidation.valid) {
    errors.push(...caseValidation.errors.map((error) => `bundle.casePackage: ${error}`));
  }
  const lessonValidation = validateLessonPlanV1(value.lessonPlan);
  if (!lessonValidation.valid) {
    errors.push(...lessonValidation.errors.map((error) => `bundle.lessonPlan: ${error}`));
  }
  if (!caseValidation.valid || !lessonValidation.valid) {
    return { valid: false, errors };
  }

  const casePackage = value.casePackage as CasePackageV1;
  const lessonPlan = value.lessonPlan as LessonPlanV1;
  if (!(await verifyCasePackageManifestHash(casePackage))) {
    errors.push('bundle.casePackage manifest does not match its content.');
  }
  if (!(await verifyLessonPlanManifestHash(lessonPlan))) {
    errors.push('bundle.lessonPlan manifest does not match its content.');
  }
  const expectedRef = getLessonPlanRef(lessonPlan);
  if (
    casePackage.lessonPlanRef.id !== expectedRef.id
    || casePackage.lessonPlanRef.version !== expectedRef.version
    || casePackage.lessonPlanRef.sha256 !== expectedRef.sha256
  ) {
    errors.push('bundle.casePackage.lessonPlanRef must match the exact bundled Lesson Plan manifest.');
  }
  if (casePackage.neutralDescription !== lessonPlan.neutralDescription) {
    errors.push('bundle neutral descriptions differ. Keep answer-safe descriptions identical.');
  }
  if (!sameStringList(casePackage.teachingNotes, lessonPlan.teachingNotes)) {
    errors.push('bundle teaching notes differ. Update the Case Package and Lesson Plan together.');
  }
  return { valid: errors.length === 0, errors };
}

export async function createCaseLessonBundleV1(
  casePackage: CasePackageV1,
  lessonPlan: LessonPlanV1,
): Promise<CaseLessonBundleV1> {
  const bundle: CaseLessonBundleV1 = {
    schema: CASE_LESSON_BUNDLE_SCHEMA,
    schemaVersion: CASE_LESSON_BUNDLE_VERSION,
    casePackage,
    lessonPlan,
  };
  const validation = await validateCaseLessonBundleV1(bundle);
  if (!validation.valid) {
    throw new Error(
      `Cannot create an invalid Case Lesson Bundle v1:\n${validation.errors.map((error) => `- ${error}`).join('\n')}`,
    );
  }
  return bundle;
}
