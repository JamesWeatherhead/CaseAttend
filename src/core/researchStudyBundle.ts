import { composeLessonPrompt, type LessonPlanRef } from './lessonPlan';
import {
  PORTABLE_CASE_ASSET_LIMITS,
  sha256Hex,
  validatePortableCasePackageV1,
  type PortableCaseAssetV1,
  type PortableCasePackageV1,
} from './portableCasePackage';
import {
  verifyResearchManifestHash,
  type ResearchCasePackageRef,
  type ResearchManifestV1,
} from './researchManifest';

export const RESEARCH_STUDY_BUNDLE_SCHEMA = 'caseattend.research-study-bundle' as const;
export const RESEARCH_STUDY_BUNDLE_SCHEMA_VERSION = '1.0' as const;

export const RESEARCH_STUDY_BUNDLE_LIMITS = Object.freeze({
  maxPortableCases: 256,
  maxUniqueAssets: PORTABLE_CASE_ASSET_LIMITS.maxAssetCount,
  maxTotalAssetBytes: PORTABLE_CASE_ASSET_LIMITS.maxTotalBytes,
  maxTotalAssetPixels: PORTABLE_CASE_ASSET_LIMITS.maxTotalPixels,
});

export interface ResearchStudyBundleV1 {
  schema: typeof RESEARCH_STUDY_BUNDLE_SCHEMA;
  schemaVersion: typeof RESEARCH_STUDY_BUNDLE_SCHEMA_VERSION;
  researchManifest: ResearchManifestV1;
  /** Exact, immutable-in-practice snapshots referenced by researchManifest. */
  portableCases: readonly PortableCasePackageV1[];
}

export interface ResearchStudyBundleValidationResult {
  valid: boolean;
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  errors: string[],
): void {
  const names = new Set(allowed);
  Object.keys(value).forEach((key) => {
    if (!names.has(key)) errors.push(`${path}.${key} is not valid in Research Study Bundle v1.`);
  });
}

function caseRefKey(ref: ResearchCasePackageRef): string {
  return `${ref.id}\0${ref.schemaVersion}\0${ref.sha256}`;
}

function portableCaseRef(portable: PortableCasePackageV1): ResearchCasePackageRef {
  return {
    id: portable.casePackage.id,
    schemaVersion: portable.casePackage.schemaVersion,
    sha256: portable.casePackage.manifest.sha256,
  };
}

function lessonRefsEqual(left: LessonPlanRef, right: LessonPlanRef): boolean {
  return left.id === right.id && left.version === right.version && left.sha256 === right.sha256;
}

function lessonRefForPortable(portable: PortableCasePackageV1): LessonPlanRef {
  return {
    id: portable.lessonPlan.id,
    version: portable.lessonPlan.version,
    sha256: portable.lessonPlan.manifest.sha256,
  };
}

function assetsExactlyEqual(left: PortableCaseAssetV1, right: PortableCaseAssetV1): boolean {
  return left.uri === right.uri
    && left.sha256 === right.sha256
    && left.mimeType === right.mimeType
    && left.byteLength === right.byteLength
    && left.width === right.width
    && left.height === right.height
    && left.bytesBase64 === right.bytesBase64;
}

export async function validateResearchStudyBundleV1(
  value: unknown,
): Promise<ResearchStudyBundleValidationResult> {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { valid: false, errors: ['researchStudyBundle is required and must be an object.'] };
  }
  rejectUnknownKeys(
    value,
    ['schema', 'schemaVersion', 'researchManifest', 'portableCases'],
    'researchStudyBundle',
    errors,
  );
  if (value.schema !== RESEARCH_STUDY_BUNDLE_SCHEMA) {
    errors.push(`researchStudyBundle.schema must be '${RESEARCH_STUDY_BUNDLE_SCHEMA}'.`);
  }
  if (value.schemaVersion !== RESEARCH_STUDY_BUNDLE_SCHEMA_VERSION) {
    errors.push(`researchStudyBundle.schemaVersion must be '${RESEARCH_STUDY_BUNDLE_SCHEMA_VERSION}'.`);
  }

  const manifest = value.researchManifest;
  const manifestValid = isRecord(manifest)
    && await verifyResearchManifestHash(manifest as unknown as ResearchManifestV1);
  if (!manifestValid) {
    errors.push('researchStudyBundle.researchManifest must be a valid, hash-verified Research Manifest v1.');
  }

  if (!Array.isArray(value.portableCases)) {
    errors.push('researchStudyBundle.portableCases is required and must be an array.');
    return { valid: false, errors };
  }
  if (value.portableCases.length < 1 || value.portableCases.length > RESEARCH_STUDY_BUNDLE_LIMITS.maxPortableCases) {
    errors.push(`researchStudyBundle.portableCases must contain 1-${RESEARCH_STUDY_BUNDLE_LIMITS.maxPortableCases} exact case snapshots.`);
  }

  const portableByRef = new Map<string, PortableCasePackageV1>();
  const uniqueAssets = new Map<string, PortableCaseAssetV1>();
  for (let index = 0; index < value.portableCases.length; index += 1) {
    const path = `researchStudyBundle.portableCases[${index}]`;
    const candidate = value.portableCases[index];
    const portableValidation = await validatePortableCasePackageV1(candidate);
    if (!portableValidation.valid) {
      errors.push(...portableValidation.errors.map((error) => `${path}: ${error}`));
      continue;
    }
    const portable = candidate as PortableCasePackageV1;
    const key = caseRefKey(portableCaseRef(portable));
    if (portableByRef.has(key)) {
      errors.push(`${path} duplicates an exact Case Package snapshot already present in the bundle.`);
    } else {
      portableByRef.set(key, portable);
    }
    portable.assets.forEach((asset) => {
      const existing = uniqueAssets.get(asset.sha256);
      if (existing && !assetsExactlyEqual(existing, asset)) {
        errors.push(`${path} contains asset ${asset.sha256} with metadata or bytes that differ from the same digest elsewhere in the bundle.`);
      } else if (!existing) {
        uniqueAssets.set(asset.sha256, asset);
      }
    });
  }

  if (uniqueAssets.size > RESEARCH_STUDY_BUNDLE_LIMITS.maxUniqueAssets) {
    errors.push(`researchStudyBundle cannot contain more than ${RESEARCH_STUDY_BUNDLE_LIMITS.maxUniqueAssets} unique assets.`);
  }
  let totalBytes = 0;
  let totalPixels = 0;
  uniqueAssets.forEach((asset) => {
    totalBytes += asset.byteLength;
    totalPixels += asset.width * asset.height;
  });
  if (totalBytes > RESEARCH_STUDY_BUNDLE_LIMITS.maxTotalAssetBytes) {
    errors.push(`researchStudyBundle unique assets exceed the ${RESEARCH_STUDY_BUNDLE_LIMITS.maxTotalAssetBytes}-byte aggregate limit.`);
  }
  if (totalPixels > RESEARCH_STUDY_BUNDLE_LIMITS.maxTotalAssetPixels) {
    errors.push(`researchStudyBundle unique assets exceed the ${RESEARCH_STUDY_BUNDLE_LIMITS.maxTotalAssetPixels}-pixel aggregate limit.`);
  }

  if (manifestValid) {
    const referenced = new Set<string>();
    const promptHashes = new Map<string, Promise<string>>();
    const researchManifest = manifest as unknown as ResearchManifestV1;
    for (let armIndex = 0; armIndex < researchManifest.arms.length; armIndex += 1) {
      const arm = researchManifest.arms[armIndex];
      for (let stepIndex = 0; stepIndex < arm.caseSteps.length; stepIndex += 1) {
        const step = arm.caseSteps[stepIndex];
        const path = `researchStudyBundle.researchManifest.arms[${armIndex}].caseSteps[${stepIndex}]`;
        const key = caseRefKey(step.casePackageRef);
        referenced.add(key);
        const portable = portableByRef.get(key);
        if (!portable) {
          errors.push(`${path}.casePackageRef has no exact Portable Case Package snapshot in researchStudyBundle.portableCases.`);
          continue;
        }
        const actualLessonRef = lessonRefForPortable(portable);
        if (!lessonRefsEqual(step.lessonPlanRef, actualLessonRef)) {
          errors.push(`${path}.lessonPlanRef does not exactly match the lesson snapshot paired with its Case Package.`);
          continue;
        }
        try {
          const promptKey = `${key}\0${step.lessonPlanRef.sha256}\0${step.learnerLevel}\0${step.mode}`;
          let promptHash = promptHashes.get(promptKey);
          if (!promptHash) {
            promptHash = (async () => {
              const composed = await composeLessonPrompt(portable.lessonPlan, {
                learnerLevel: step.learnerLevel,
                mode: step.mode,
                hasImage: true,
                caseContext: {
                  id: portable.casePackage.id,
                  title: portable.casePackage.title,
                  vignette: portable.casePackage.vignette,
                  neutralDescription: portable.casePackage.neutralDescription,
                  domain: portable.casePackage.domain,
                },
              });
              return sha256Hex(new TextEncoder().encode(composed.providerPrompt));
            })();
            promptHashes.set(promptKey, promptHash);
          }
          const actualPromptSha256 = await promptHash;
          if (actualPromptSha256 !== step.systemPromptSha256) {
            errors.push(`${path} does not match its frozen systemPromptSha256 computed from the exact Case Package, Lesson Plan, learner level, and mode.`);
          }
        } catch (error) {
          errors.push(`${path}.systemPromptSha256 could not be verified: ${error instanceof Error ? error.message : 'prompt composition failed'}.`);
        }
      }
    }
    portableByRef.forEach((_portable, key) => {
      if (!referenced.has(key)) {
        errors.push('researchStudyBundle.portableCases contains a snapshot that no research arm references.');
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

export async function createResearchStudyBundleV1(
  researchManifest: ResearchManifestV1,
  portableCases: readonly PortableCasePackageV1[],
): Promise<ResearchStudyBundleV1> {
  const bundle: ResearchStudyBundleV1 = {
    schema: RESEARCH_STUDY_BUNDLE_SCHEMA,
    schemaVersion: RESEARCH_STUDY_BUNDLE_SCHEMA_VERSION,
    researchManifest,
    portableCases: [...portableCases],
  };
  const validation = await validateResearchStudyBundleV1(bundle);
  if (!validation.valid) {
    throw new Error(`Cannot create an invalid Research Study Bundle v1:\n${validation.errors.map((error) => `- ${error}`).join('\n')}`);
  }
  return bundle;
}

export function resolveResearchStudyCase(
  bundle: ResearchStudyBundleV1,
  casePackageRef: ResearchCasePackageRef,
  lessonPlanRef: LessonPlanRef,
): PortableCasePackageV1 {
  const matches = bundle.portableCases.filter((portable) => (
    caseRefKey(portableCaseRef(portable)) === caseRefKey(casePackageRef)
    && lessonRefsEqual(lessonRefForPortable(portable), lessonPlanRef)
  ));
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one Portable Case Package snapshot for Case Package '${casePackageRef.id}' and its exact Lesson Plan reference; found ${matches.length}.`);
  }
  return matches[0];
}

/**
 * Draft bundles remain exportable for institutional review. Participant launch
 * is a stricter boundary and does not synthesize missing review information.
 */
export async function checkResearchStudyLaunchReadiness(
  value: unknown,
): Promise<ResearchStudyBundleValidationResult> {
  const validation = await validateResearchStudyBundleV1(value);
  const errors = [...validation.errors];
  if (!validation.valid || !isRecord(value)) return { valid: false, errors };
  const bundle = value as unknown as ResearchStudyBundleV1;
  if (bundle.researchManifest.oversight.status !== 'institution-determined') {
    errors.push('Participant launch requires an institution-determined oversight status; draft packets are export-only.');
  }
  if (bundle.researchManifest.collection.rawChat.enabled) {
    errors.push('Browser-local participant launch requires raw chat collection to remain disabled.');
  }
  if (bundle.researchManifest.protocol.population.includesMinors) {
    errors.push('Browser-local Participant Mode v1 does not enroll minors. Keep this packet in draft/review or use a separately reviewed child-protection workflow.');
  }
  bundle.portableCases.forEach((portable, index) => {
    if (portable.casePackage.deidentification.status === 'not-reviewed') {
      errors.push(`researchStudyBundle.portableCases[${index}] cannot launch until its Case Package deidentification status is synthetic or attested.`);
    }
  });
  return { valid: errors.length === 0, errors };
}
