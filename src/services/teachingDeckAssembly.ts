import { LEARNER_LEVELS, type LearnerLevel } from '../constants';
import { createCasePackageV1, type CaseLicense } from '../core/casePackage';
import { createLessonPlanV1, getLessonPlanRef, type LessonCitation } from '../core/lessonPlan';
import { createPortableCasePackageV1, type PortableCasePackageV1 } from '../core/portableCasePackage';
import { getDomain, type DomainKey } from '../lib/domains';
import { prepareCaseImageAssets, type PrepareCaseImageOptions } from './caseAssetPipeline';
import type { LessonObjectiveImportRow } from './lessonObjectivesImport';
import type { PowerPointTeachingDeck, PowerPointTeachingImage } from './pptxTeachingDeck';

export interface TeachingDeckImageCandidate extends PowerPointTeachingImage {
  sourceSlides: readonly number[];
}

export interface TeachingDeckLessonSource {
  name: string;
  url: string;
  attribution: string;
  license: CaseLicense;
  licenseEvidenceUrl?: string;
}

export interface TeachingDeckAssemblyInput {
  deck: PowerPointTeachingDeck;
  rows: readonly LessonObjectiveImportRow[];
  selectedImageIds: readonly string[];
  /** Educator-reviewed, learner-visible title and opening description. */
  title: string;
  neutralDescription: string;
  source: TeachingDeckLessonSource;
  domain?: DomainKey;
  modality?: string;
  reviewed: boolean;
}

export interface TeachingDeckAssemblyOptions {
  signal?: AbortSignal;
  /** Test/embed seam; production uses the existing browser decoder and canvas. */
  imagePipelineOptions?: PrepareCaseImageOptions;
  /** Caller-supplied IDs still require create-only persistence. */
  caseId?: string;
}

const LEVEL_ALIASES: Record<string, LearnerLevel> = {
  hs: 'highschool', highschool: 'highschool',
  undergrad: 'undergrad', undergraduate: 'undergrad',
  step1: 'ms_preclinical', prestep1: 'ms_preclinical', mspreclinical: 'ms_preclinical',
  poststep1: 'ms_clinical', msclinical: 'ms_clinical',
  step2: 'ms_step2', msstep2: 'ms_step2',
  resident: 'resident', residency: 'resident',
};

export function teachingLevel(value: string): LearnerLevel {
  const level = LEVEL_ALIASES[value.toLowerCase().replace(/[^a-z0-9]/g, '')];
  if (!level) throw new Error(`Unknown learner level '${value}'. Use High school, Undergrad, Step 1, Post-Step 1, Step 2, or Resident.`);
  return level;
}

export function teachingLevelLabel(value: string): string {
  const level = teachingLevel(value);
  return level === 'highschool' ? 'High school'
    : level === 'ms_preclinical' ? 'Step 1'
      : LEARNER_LEVELS.find((entry) => entry.id === level)!.label;
}

/** Only actual images on referenced slides; repeated source bytes get one candidate. */
export function teachingDeckImageCandidates(
  deck: PowerPointTeachingDeck,
  rows: readonly LessonObjectiveImportRow[],
  includeAllSlides = false,
): TeachingDeckImageCandidate[] {
  const referenced = new Set(rows.flatMap((row) => [...row.slides]));
  const candidates = new Map<string, TeachingDeckImageCandidate>();
  for (const slide of deck.slides) {
    for (const image of slide.images) {
      const existing = candidates.get(image.path);
      if (existing) {
        if (!existing.sourceSlides.includes(slide.index)) existing.sourceSlides = [...existing.sourceSlides, slide.index];
      } else candidates.set(image.path, { ...image, sourceSlides: [slide.index] });
    }
  }
  // Resolve identity before filtering: one raster may occur on both an earlier
  // context slide and a later referenced slide, with different relationship IDs.
  return [...candidates.values()].filter((candidate) => includeAllSlides || !referenced.size
    || candidate.sourceSlides.some((slide) => referenced.has(slide)));
}

export const MAX_TEACHING_OBJECTIVES_PER_LEVEL = 24;

export function validateTeachingObjectiveSelection(rows: readonly LessonObjectiveImportRow[]): void {
  if (!rows.length || rows.length > 200) throw new Error('Choose between 1 and 200 learning objectives.');
  const counts = new Map<LearnerLevel, number>();
  for (const row of rows) {
    const level = teachingLevel(row.level);
    const count = (counts.get(level) ?? 0) + 1;
    counts.set(level, count);
    if (count > MAX_TEACHING_OBJECTIVES_PER_LEVEL) {
      throw new Error(`Choose no more than ${MAX_TEACHING_OBJECTIVES_PER_LEVEL} objectives for ${teachingLevelLabel(level)} so every objective can receive an evidence check. Split a larger curriculum into separate lessons.`);
    }
  }
}

function checkCancellation(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Lesson creation was cancelled.', 'AbortError');
}

function required(value: string, label: string, max = 4_000): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  if (normalized.length > max) throw new Error(`${label} is too long. Use ${max.toLocaleString('en-US')} characters or fewer.`);
  return normalized;
}

function httpsUrl(value: string, label: string): string {
  const normalized = required(value, label, 2_048);
  try {
    const url = new URL(normalized);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
  } catch { throw new Error(`${label} must be a complete https:// address without account credentials.`); }
  return normalized;
}

const OPENING = 'Look closely at the teaching image. What do you notice first? Describe the visible evidence in your own words before offering an interpretation.';

/**
 * Build a complete guided lesson from educator-supplied answers, never from an
 * inferred diagnosis. No source file, speaker notes, or provider request is saved.
 * Persistence belongs to the caller and must require a previously unused case ID.
 */
export async function assembleTeachingDeckLesson(
  input: TeachingDeckAssemblyInput,
  options: TeachingDeckAssemblyOptions = {},
): Promise<PortableCasePackageV1> {
  checkCancellation(options.signal);
  if (!input.reviewed) throw new Error('Review the selected images and educator answer keys before creating the lesson.');
  const title = required(input.title, 'Learner-facing title', 160);
  const neutralDescription = required(input.neutralDescription, 'Learner-facing description', 2_000);
  const source: TeachingDeckLessonSource = {
    name: required(input.source.name, 'Source name', 240),
    url: httpsUrl(input.source.url, 'Source URL'),
    attribution: required(input.source.attribution, 'Author attribution'),
    license: {
      name: required(input.source.license.name, 'Licence name', 120),
      ...(input.source.license.spdxId ? { spdxId: required(input.source.license.spdxId, 'Licence identifier', 120) } : {}),
      ...(input.source.license.url ? { url: httpsUrl(input.source.license.url, 'Licence URL') } : {}),
    },
    ...(input.source.licenseEvidenceUrl ? { licenseEvidenceUrl: httpsUrl(input.source.licenseEvidenceUrl, 'Licence evidence URL') } : {}),
  };
  const domain = input.domain ?? 'radiology';
  const modality = required(input.modality ?? 'OT', 'Modality', 40);
  const domainConfig = getDomain(domain);
  if (!domainConfig) throw new Error('Choose a supported teaching domain.');
  const caseId = options.caseId ?? `lesson-${crypto.randomUUID()}`;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(caseId)) throw new Error('The lesson case ID must use lowercase letters, numbers, and hyphens.');
  validateTeachingObjectiveSelection(input.rows);
  if (input.rows.reduce((sum, row) => sum + row.objective.length + row.evidence.length + row.answerKey.length + row.hint.length, 0) > 200_000) {
    throw new Error('The selected curriculum is too long. Split it into smaller lessons.');
  }
  const visibleSlides = new Set(input.deck.slides.map((slide) => slide.index));
  const rows = input.rows.map((row, index) => {
    if (row.slides.some((slide) => !visibleSlides.has(slide))) throw new Error(`Objective row ${row.rowNumber} references a missing or hidden slide. Update the spreadsheet or choose another objective.`);
    return {
      id: `objective-${index + 1}`, level: teachingLevel(row.level),
      description: required(row.objective, `Objective row ${row.rowNumber}`),
      evidence: required(row.evidence, `Expected evidence in row ${row.rowNumber}`),
      answerKey: required(row.answerKey, `Answer key in row ${row.rowNumber}`),
      hint: row.hint.trim() ? required(row.hint, `Hint in row ${row.rowNumber}`) : '', slides: [...row.slides],
      sourceUrl: row.sourceUrl ? httpsUrl(row.sourceUrl, `Source URL in row ${row.rowNumber}`) : undefined,
    };
  });
  const candidates = teachingDeckImageCandidates(input.deck, input.rows, true);
  const chosenIds = new Set(input.selectedImageIds);
  const selected = candidates.filter((candidate) => chosenIds.has(candidate.id));
  if (!selected.length || selected.length !== chosenIds.size) throw new Error('Choose at least one available teaching image.');
  const selectedSlides = new Set(selected.flatMap((candidate) => [...candidate.sourceSlides]));
  for (const row of rows) {
    if (row.slides.length && !row.slides.some((slide) => selectedSlides.has(slide))) {
      throw new Error(`Choose an image from slide ${row.slides.join(' or ')} for '${row.description}', or deselect that objective.`);
    }
  }
  const files = selected.map((candidate, index) => new File(
    [candidate.bytes.slice().buffer],
    `teaching-image-${index + 1}.${candidate.mimeType === 'image/jpeg' ? 'jpg' : candidate.mimeType === 'image/webp' ? 'webp' : 'png'}`,
    { type: candidate.mimeType },
  ));
  const levels = LEARNER_LEVELS.map((entry) => entry.id).filter((level) => rows.some((row) => row.level === level));
  const teachingNotes = [
    `Instructor media map:\n${selected.map((candidate, index) => `Teaching image / viewer frame ${index + 1}: original slide(s) ${candidate.sourceSlides.join(', ')}, source part ${candidate.path}.`).join('\n')}\nThese are extracted images; PowerPoint arrows, overlays, crops, and slide layout are not reproduced. No pixel coordinates or locations are inferred.`,
    ...rows.map((row) => `${row.id} (${teachingLevelLabel(row.level)}${row.slides.length ? `; source slides ${row.slides.join(', ')}` : ''})\nEducator answer key: ${row.answerKey}`),
  ];
  const citations: LessonCitation[] = [{ id: 'teaching-artifact-source', title: source.name, scope: 'artifact-provenance', url: source.url }];
  const teachingUrls = [...new Set(rows.flatMap((row) => row.sourceUrl ? [row.sourceUrl] : []))];
  teachingUrls.forEach((url, index) => citations.push({ id: `educator-reference-${index + 1}`, title: `Educator-supplied teaching reference ${index + 1}`, scope: 'clinical-teaching', url }));
  const lessonPlan = await createLessonPlanV1({
    version: '1.0.0', id: `${caseId}-plan`, title, neutralDescription, teachingNotes,
    learner: { levels, prerequisites: [] },
    objectives: rows.map((row) => ({ id: row.id, description: row.description, learnerLevels: [row.level], ...(row.slides.length ? { sourceSlides: row.slides } : {}) })),
    socraticOpening: OPENING,
    allowedHints: rows.map((row, index) => ({
      id: `hint-${index + 1}`, objectiveIds: [row.id],
      text: row.hint || 'Describe the visible evidence you are using, then explain how it supports your reasoning. State what remains uncertain.',
    })),
    escalationConditions: [{ id: 'needs-structure', when: 'the learner has tried twice and is still stuck', action: 'Offer one permitted process hint for the current objective and invite another attempt. Keep the educator answer key private.' }],
    stoppingConditions: [{ id: 'real-person-care', when: 'the learner asks for diagnosis or treatment of a real person', message: 'This lesson is educational. Please consult a qualified clinician for a real health concern, or local emergency services for a possible emergency.' }],
    educatorTutorInstructions: 'Use the educator answer keys as the source of truth. Do not independently invent the diagnosis, findings, or their location. Teach only objectives assigned to the selected learner level. Ask one focused question at a time, wait for an unaided attempt, and ask the learner to explain their evidence. Keep answer keys and answer-bearing objective titles private. A hint or copied answer is not evidence of independent learning. Use supported hints progressively; if source material is insufficient, say so rather than guessing. Invite transfer to a new example and report uncertainty honestly. This is guided practice with no recorded clinical review.',
    rubric: { criteria: rows.map((row, index) => ({ id: `evidence-${index + 1}`, objectiveIds: [row.id], criterion: 'The learner response provides educator-defined evidence; assistance is reported separately.', observableEvidence: [row.evidence] })) },
    citations, clinicalReview: { reviewed: false }, practiceMode: 'guided',
  });
  checkCancellation(options.signal);
  const prepared = await prepareCaseImageAssets(files, options.imagePipelineOptions);
  checkCancellation(options.signal);
  const imageSources = prepared.map((asset, index) => ({
    src: asset.uri, sha256: asset.sha256, mimeType: asset.mimeType, width: asset.width, height: asset.height,
    alt: `Teaching image ${index + 1}. ${neutralDescription}`,
  }));
  const casePackage = await createCasePackageV1({
    id: caseId, title, vignette: neutralDescription, domain, difficulty: levels.every((level) => ['highschool', 'undergrad'].includes(level)) ? 'introductory' : 'intermediate',
    artifact: imageSources.length === 1
      ? { kind: 'image', seriesId: 'teaching-image', seriesLabel: 'Teaching image', modality, ...imageSources[0] }
      : { kind: 'image-stack', series: [{ id: 'teaching-images', label: 'Teaching images', modality, frames: imageSources.map((image, index) => ({ id: `frame-${index + 1}`, ...image })) }] },
    preview: imageSources[0],
    artifactHints: { ...domainConfig.artifactHints, showSeriesSelector: imageSources.length > 1 && domainConfig.artifactHints.showSeriesSelector, showSegmentation: false },
    provenance: {
      sourceName: source.name, sourceUrl: source.url, licenseEvidenceUrl: source.licenseEvidenceUrl ?? source.url,
      license: source.license,
      attribution: `${source.attribution}\nAdapted for CaseAttend from the selected presentation; media re-encoded to remove ordinary file metadata.\n${selected.map((candidate, index) => `Teaching image ${index + 1}: source slide(s) ${candidate.sourceSlides.join(', ')}, ${candidate.path}; stored image SHA-256 ${prepared[index].sha256}.`).join('\n')}`,
      clinicianReview: { reviewed: false },
    },
    deidentification: { status: 'not-reviewed', notes: 'Imported from the educator-cited teaching source. Image bytes were re-encoded and the educator confirmed the selection; no new de-identification attestation or automated privacy screening is recorded.' },
    contentWarnings: [], neutralDescription, teachingNotes, lessonPlanRef: getLessonPlanRef(lessonPlan),
    presentation: { subtitle: 'Guided teaching lesson', category: domain === 'radiology' ? (modality === 'MR' || modality === 'MRI' ? 'mri' : modality === 'CT' ? 'ct' : 'xray') : domain === 'pathology' ? 'path' : domain === 'dermatology' ? 'derm' : domain,
      accentColor: 'rgba(59,130,246,1)', accentGlow: 'rgba(59,130,246,0.15)', accentBorder: 'rgba(59,130,246,0.3)', textClass: 'text-blue-400' },
  });
  checkCancellation(options.signal);
  const assets = [...new Map(prepared.map(({ blob: _blob, originalName: _name, ...asset }) => [asset.uri, asset])).values()];
  const portable = await createPortableCasePackageV1(casePackage, lessonPlan, assets);
  checkCancellation(options.signal);
  return portable;
}
