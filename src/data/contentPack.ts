import type { LearnerLevel } from '../constants';
import {
  createCasePackageV1,
  type CaseDifficulty,
  type CaseLicense,
  type CasePackageV1,
  type CasePresentationMetadata,
} from '../core/casePackage';
import {
  createLessonPlanV1,
  getLessonPlanRef,
  type LessonCitation,
  type LessonObjective,
  type LessonPlanV1,
} from '../core/lessonPlan';
import { getDomain } from '../lib/domains';
import type { DomainKey } from '../lib/domains/types';

export const CONTENT_PACK_SCHEMA = 'caseattend.content-pack' as const;
export const CONTENT_PACK_SCHEMA_VERSION = '1.0' as const;

const DEFAULT_LEARNER_LEVELS: readonly LearnerLevel[] = [
  'highschool',
  'undergrad',
  'ms_preclinical',
  'ms_clinical',
  'resident',
];

const DEFAULT_PREREQUISITES = [
  'Use descriptive observations before forming an interpretation.',
] as const;

const DEFAULT_HINTS = [
  'Name the location, shape, relative brightness or color, and surrounding structures.',
  'Compare the finding with another region or the expected normal appearance.',
  'Use one detail from the vignette and one visible detail to explain your reasoning.',
] as const;

const DEFAULT_OBSERVABLE_EVIDENCE = [
  'Uses specific descriptive language.',
  'Links the conclusion to visible evidence.',
  'States uncertainty or limitations when appropriate.',
] as const;

const KEBAB_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export interface ContentPackObjectiveDefinition {
  /** Optional stable override. Defaults to objective-1, objective-2, and so on. */
  id?: string;
  description: string;
  hint?: string;
  observableEvidence?: readonly string[];
}

export type ContentPackObjective = string | ContentPackObjectiveDefinition;

export interface ContentPackImageDefinition {
  /** Safe local path under public/images. */
  src: `/images/${string}`;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  /** Lowercase SHA-256 digest of the exact downloaded bytes. */
  sha256: string;
  /** Neutral accessibility text that does not reveal the answer. */
  alt: string;
  modality: string;
  seriesLabel: string;
  seriesId?: string;
  width?: number;
  height?: number;
}

export interface ContentPackProvenanceDefinition {
  sourceName: string;
  /** Exact item or dataset record, not a search results page. */
  sourceUrl: string;
  /** Exact item page or record that states the reuse terms for this artifact. */
  licenseEvidenceUrl: string;
  attribution: string;
  license: CaseLicense;
}

export type ContentPackClinicalCitation = Omit<LessonCitation, 'scope'>;

export interface ContentPackLessonDefinition {
  /** Three or more descriptions are converted into stable objectives, hints, and rubric criteria. */
  objectives: readonly ContentPackObjective[];
  learnerLevels?: readonly LearnerLevel[];
  prerequisites?: readonly string[];
  openingQuestion?: string;
  teachingApproach?: string;
  clinicalCitations: readonly [
    ContentPackClinicalCitation,
    ...ContentPackClinicalCitation[],
  ];
}

export type ContentPackPresentationCategory =
  | 'xray'
  | 'ct'
  | 'mri'
  | 'path'
  | 'derm'
  | 'ecg'
  | 'ultrasound'
  | 'ophthalmology';

export interface ContentPackCaseDefinition {
  id: string;
  title: string;
  vignette: string;
  domain: DomainKey;
  difficulty: CaseDifficulty;
  image: ContentPackImageDefinition;
  provenance: ContentPackProvenanceDefinition;
  contentWarnings: readonly string[];
  neutralDescription: string;
  teachingNotes: readonly string[];
  deidentificationNotes: string;
  presentation: Omit<CasePresentationMetadata, 'category'> & {
    category: ContentPackPresentationCategory;
  };
  lesson: ContentPackLessonDefinition;
}

export interface ContentPackDefinition {
  schema: typeof CONTENT_PACK_SCHEMA;
  schemaVersion: typeof CONTENT_PACK_SCHEMA_VERSION;
  id: string;
  title: string;
  /** Shared educator-controlled SemVer for the lessons in this pack. */
  contentVersion: string;
  cases: readonly ContentPackCaseDefinition[];
}

export interface BuiltContentPackEntry {
  packId: string;
  definition: ContentPackCaseDefinition;
  casePackage: CasePackageV1;
  lessonPlan: LessonPlanV1;
}

/** Provides compile-time checking while preserving literal IDs and paths. */
export function defineContentPack<const T extends ContentPackDefinition>(pack: T): T {
  return pack;
}

function requireNonEmptyString(value: string, path: string): void {
  if (value.trim() === '') throw new Error(`${path} must be a non-empty string.`);
}

function validatePackEnvelope(pack: ContentPackDefinition): void {
  if (pack.schema !== CONTENT_PACK_SCHEMA) {
    throw new Error(`Content Pack schema must be '${CONTENT_PACK_SCHEMA}'.`);
  }
  if (pack.schemaVersion !== CONTENT_PACK_SCHEMA_VERSION) {
    throw new Error(`Content Pack schemaVersion must be '${CONTENT_PACK_SCHEMA_VERSION}'.`);
  }
  if (!KEBAB_ID_PATTERN.test(pack.id)) {
    throw new Error('Content Pack id must use lowercase kebab-case characters.');
  }
  requireNonEmptyString(pack.title, 'Content Pack title');
  if (!SEMVER_PATTERN.test(pack.contentVersion)) {
    throw new Error('Content Pack contentVersion must be semantic version such as 1.0.0.');
  }
  if (!Array.isArray(pack.cases) || pack.cases.length === 0) {
    throw new Error(`Content Pack '${pack.id}' must contain at least one case.`);
  }
}

function normalizeObjective(
  objective: ContentPackObjective,
  index: number,
): ContentPackObjectiveDefinition & { id: string } {
  if (typeof objective === 'string') {
    requireNonEmptyString(objective, `objectives[${index}]`);
    return { id: `objective-${index + 1}`, description: objective };
  }
  requireNonEmptyString(objective.description, `objectives[${index}].description`);
  return {
    ...objective,
    id: objective.id ?? `objective-${index + 1}`,
  };
}

function objectivesFor(definition: ContentPackCaseDefinition): Array<
  ContentPackObjectiveDefinition & { id: string }
> {
  if (definition.lesson.objectives.length < 3) {
    throw new Error(
      `Content Pack case '${definition.id}' must define at least three learning objectives.`,
    );
  }
  return definition.lesson.objectives.map(normalizeObjective);
}

const PRESENTATION_CATEGORIES: Readonly<Record<DomainKey, ReadonlySet<string>>> = {
  radiology: new Set(['xray', 'ct', 'mri']),
  pathology: new Set(['path']),
  dermatology: new Set(['derm']),
  ecg: new Set(['ecg']),
  ultrasound: new Set(['ultrasound']),
  ophthalmology: new Set(['ophthalmology']),
};

function validateCaseDefinition(definition: ContentPackCaseDefinition): void {
  requireNonEmptyString(definition.provenance.sourceUrl, 'provenance.sourceUrl');
  requireNonEmptyString(
    definition.provenance.licenseEvidenceUrl,
    'provenance.licenseEvidenceUrl',
  );
  if (!PRESENTATION_CATEGORIES[definition.domain].has(definition.presentation.category)) {
    throw new Error(
      `Content Pack case '${definition.id}' category '${definition.presentation.category}' does not match domain '${definition.domain}'.`,
    );
  }
  if (
    !Array.isArray(definition.lesson.clinicalCitations)
    || definition.lesson.clinicalCitations.length === 0
  ) {
    throw new Error(
      `Content Pack case '${definition.id}' must include at least one clinical-teaching citation.`,
    );
  }
}

function socraticOpening(definition: ContentPackCaseDefinition): string {
  const question = definition.lesson.openingQuestion
    ?? 'Begin with observation, not diagnosis. What visible features stand out first, and where are they?';
  return `**${definition.title}**\n\n${definition.vignette}\n\n${question}`;
}

function tutorInstructions(definition: ContentPackCaseDefinition): string {
  return [
    'Guide the learner from neutral visual description to evidence-linked interpretation.',
    'Ask one focused question at a time. Do not imply that draft teaching content has been clinically reviewed.',
    'Treat the case notes below as educator-controlled draft context, not as patient-specific advice or independent clinical evidence.',
    definition.lesson.teachingApproach?.trim(),
    'CASE-SPECIFIC DRAFT NOTES',
    ...definition.teachingNotes,
  ].filter((entry): entry is string => Boolean(entry)).join('\n');
}

function artifactCitation(definition: ContentPackCaseDefinition): LessonCitation {
  return {
    id: 'artifact-provenance',
    title: `Case artifact provenance: ${definition.provenance.sourceName}`,
    scope: 'artifact-provenance',
    url: definition.provenance.sourceUrl,
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

async function buildCase(
  pack: ContentPackDefinition,
  definition: ContentPackCaseDefinition,
): Promise<BuiltContentPackEntry> {
  const objectives = objectivesFor(definition);
  const lessonObjectives: LessonObjective[] = objectives.map(({ id, description }) => ({
    id,
    description,
  }));
  const lessonPlan = await createLessonPlanV1({
    id: `${definition.id}-lesson`,
    version: pack.contentVersion,
    title: `${definition.title} teaching lesson`,
    neutralDescription: definition.neutralDescription,
    teachingNotes: definition.teachingNotes,
    learner: {
      levels: definition.lesson.learnerLevels ?? DEFAULT_LEARNER_LEVELS,
      prerequisites: definition.lesson.prerequisites ?? DEFAULT_PREREQUISITES,
    },
    objectives: lessonObjectives,
    socraticOpening: socraticOpening(definition),
    allowedHints: objectives.map((objective, index) => ({
      id: `hint-${index + 1}`,
      objectiveIds: [objective.id],
      text: objective.hint ?? DEFAULT_HINTS[index % DEFAULT_HINTS.length],
    })),
    escalationConditions: [
      {
        id: 'two-vague-attempts',
        when: 'the learner gives two vague or unsupported attempts',
        action: 'offer the next allowed hint and ask one narrower question',
      },
    ],
    stoppingConditions: [
      {
        id: 'real-person-request',
        when: 'the learner asks for diagnosis or treatment of a real person',
        message: 'Explain the educational limit and direct the learner to a qualified clinician.',
      },
      {
        id: 'objectives-met',
        when: 'the learner demonstrates the observable evidence for every objective',
        message: 'Summarize the transferable teaching point and invite reflection.',
      },
    ],
    educatorTutorInstructions: tutorInstructions(definition),
    rubric: {
      criteria: objectives.map((objective, index) => ({
        id: `criterion-${index + 1}`,
        objectiveIds: [objective.id],
        criterion: objective.description,
        observableEvidence: objective.observableEvidence ?? DEFAULT_OBSERVABLE_EVIDENCE,
      })),
    },
    citations: [
      artifactCitation(definition),
      ...definition.lesson.clinicalCitations.map((citation) => ({
        ...citation,
        scope: 'clinical-teaching' as const,
      })),
    ],
    clinicalReview: { reviewed: false },
  });

  const image = {
    ...definition.image,
    seriesId: definition.image.seriesId ?? `series-${definition.id}`,
  };
  const domainHints = getDomain(definition.domain).artifactHints;
  const casePackage = await createCasePackageV1({
    id: definition.id,
    title: definition.title,
    vignette: definition.vignette,
    domain: definition.domain,
    difficulty: definition.difficulty,
    artifact: {
      kind: 'image',
      modality: image.modality,
      seriesId: image.seriesId,
      seriesLabel: image.seriesLabel,
      src: image.src,
      mimeType: image.mimeType,
      sha256: image.sha256,
      alt: image.alt,
      ...(image.width === undefined ? {} : { width: image.width }),
      ...(image.height === undefined ? {} : { height: image.height }),
    },
    preview: {
      src: image.src,
      mimeType: image.mimeType,
      sha256: image.sha256,
      alt: image.alt,
      ...(image.width === undefined ? {} : { width: image.width }),
      ...(image.height === undefined ? {} : { height: image.height }),
    },
    artifactHints: {
      ...domainHints,
      showSeriesSelector: false,
    },
    provenance: {
      ...definition.provenance,
      clinicianReview: { reviewed: false },
    },
    deidentification: {
      status: 'not-reviewed',
      notes: definition.deidentificationNotes,
    },
    contentWarnings: definition.contentWarnings,
    neutralDescription: definition.neutralDescription,
    teachingNotes: definition.teachingNotes,
    lessonPlanRef: getLessonPlanRef(lessonPlan),
    presentation: definition.presentation,
  });

  return deepFreeze({
    packId: pack.id,
    definition,
    casePackage,
    lessonPlan,
  });
}

/**
 * Finalizes every paired case and lesson through the public v1 validators and
 * manifest hashers. It does not trust a declared case or lesson manifest.
 */
export async function buildContentPack(
  pack: ContentPackDefinition,
): Promise<readonly BuiltContentPackEntry[]> {
  validatePackEnvelope(pack);
  const seenIds = new Set<string>();
  for (const definition of pack.cases) {
    validateCaseDefinition(definition);
    if (seenIds.has(definition.id)) {
      throw new Error(`Content Pack '${pack.id}' contains duplicate case id '${definition.id}'.`);
    }
    seenIds.add(definition.id);
  }
  return Object.freeze(await Promise.all(pack.cases.map((definition) => buildCase(pack, definition))));
}
