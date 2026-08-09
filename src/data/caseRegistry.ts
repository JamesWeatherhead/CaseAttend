import {
  CASE_PACKAGE_VERSION,
  createCasePackageV1,
  type CaseArtifactHints,
  type CaseImageArtifact,
  type CaseImageSeries,
  type CasePackageV1,
  type CasePackageV1Draft,
  type CasePresentationMetadata,
  type CaseProvenance,
} from '../core/casePackage';
import { getLessonPlanRef } from '../core/lessonPlan';
import { getDomain } from '../lib/domains';
import type { DomainKey } from '../lib/domains/types';
import type { Series } from '../types';
import {
  BUILTIN_ASSET_SHA256,
  type BuiltinAssetPath,
} from './builtinAssetDigests';
import { createBuiltinLessonPlan } from './lessonRegistry';

type BuiltinCaseDraft = Omit<CasePackageV1Draft, 'lessonPlanRef'>;

const CC0 = {
  name: 'CC0 1.0 Universal',
  spdxId: 'CC0-1.0',
  url: 'https://creativecommons.org/publicdomain/zero/1.0/',
} as const;

const CC_BY_3 = {
  name: 'Creative Commons Attribution 3.0 Unported',
  spdxId: 'CC-BY-3.0',
  url: 'https://creativecommons.org/licenses/by/3.0/',
} as const;

const CC_BY_SA_3 = {
  name: 'Creative Commons Attribution-ShareAlike 3.0 Unported',
  spdxId: 'CC-BY-SA-3.0',
  url: 'https://creativecommons.org/licenses/by-sa/3.0/',
} as const;

const CC_BY_SA_4 = {
  name: 'Creative Commons Attribution-ShareAlike 4.0 International',
  spdxId: 'CC-BY-SA-4.0',
  url: 'https://creativecommons.org/licenses/by-sa/4.0/',
} as const;

const PUBLIC_DOMAIN = {
  name: 'Public domain',
  url: 'https://creativecommons.org/publicdomain/mark/1.0/',
} as const;

const UNREVIEWED_DEIDENTIFICATION = {
  status: 'not-reviewed' as const,
  notes: 'Bundled public teaching asset. No case-specific de-identification attestation is recorded.',
};

function assetDigest(src: string): string {
  const digest = BUILTIN_ASSET_SHA256[src as BuiltinAssetPath];
  if (!digest) throw new Error(`Built-in case references an unregistered asset: ${src}`);
  return digest;
}

function preview(src: string, mimeType: string, alt: string) {
  return { src, mimeType, sha256: assetDigest(src), alt };
}

function theme(
  subtitle: string,
  category: 'xray' | 'ct' | 'mri' | 'path' | 'derm',
  rgb: string,
  textClass: string,
): CasePresentationMetadata {
  return {
    subtitle,
    category,
    accentColor: `rgba(${rgb},1)`,
    accentGlow: `rgba(${rgb},0.15)`,
    accentBorder: `rgba(${rgb},0.3)`,
    textClass,
  };
}

function hints(domain: DomainKey, singleImage = false): CaseArtifactHints {
  const domainHints = getDomain(domain).artifactHints;
  return {
    ...domainHints,
    showSeriesSelector: singleImage ? false : domainHints.showSeriesSelector,
  };
}

function provenance(
  sourceName: string,
  attribution: string,
  license: CaseProvenance['license'],
  sourceUrl?: string,
): CaseProvenance {
  return {
    sourceName,
    ...(sourceUrl ? { sourceUrl } : {}),
    license,
    attribution,
    clinicianReview: { reviewed: false },
  };
}

function stackSeries(
  id: string,
  label: string,
  modality: string,
  folder: string,
  count: number,
  extension: 'png' | 'webp',
  altPrefix: string,
): CaseImageSeries {
  const mimeType = extension === 'png' ? 'image/png' : 'image/webp';
  return {
    id,
    label,
    modality,
    frames: Array.from({ length: count }, (_, index) => {
      const src = `${folder}/${index + 1}.${extension}`;
      return {
        id: `frame-${index + 1}`,
        src,
        mimeType,
        sha256: assetDigest(src),
        alt: `${altPrefix}, frame ${index + 1} of ${count}.`,
      };
    }),
  };
}

interface SingleImageDefinition {
  id: string;
  title: string;
  vignette: string;
  domain: 'radiology' | 'dermatology';
  modality: 'CR' | 'CT' | 'XC';
  seriesId: string;
  seriesLabel: string;
  src: BuiltinAssetPath;
  alt: string;
  neutralDescription: string;
  teachingNote: string;
  sourceName: string;
  sourceUrl?: string;
  attribution: string;
  license: CaseProvenance['license'];
  presentation: CasePresentationMetadata;
  contentWarnings: readonly string[];
}

function singleImageDraft(definition: SingleImageDefinition): BuiltinCaseDraft {
  const artifact: CaseImageArtifact = {
    kind: 'image',
    modality: definition.modality,
    seriesId: definition.seriesId,
    seriesLabel: definition.seriesLabel,
    src: definition.src,
    mimeType: 'image/jpeg',
    sha256: assetDigest(definition.src),
    alt: definition.alt,
  };

  return {
    schemaVersion: CASE_PACKAGE_VERSION,
    id: definition.id,
    title: definition.title,
    vignette: definition.vignette,
    domain: definition.domain,
    difficulty: 'intermediate',
    artifact,
    preview: preview(definition.src, 'image/jpeg', definition.alt),
    artifactHints: hints(definition.domain, true),
    provenance: provenance(
      definition.sourceName,
      definition.attribution,
      definition.license,
      definition.sourceUrl,
    ),
    deidentification: UNREVIEWED_DEIDENTIFICATION,
    contentWarnings: definition.contentWarnings,
    neutralDescription: definition.neutralDescription,
    teachingNotes: [definition.teachingNote],
    presentation: definition.presentation,
  };
}

const MRI_ALT = 'Axial grayscale brain MRI';
const MRI_PREVIEW = '/images/sub-1/FLAIR/14.png' as BuiltinAssetPath;

const MRI_CASE: BuiltinCaseDraft = {
  schemaVersion: CASE_PACKAGE_VERSION,
  id: 'local-study-sub1',
  title: '72F, progressive memory decline',
  vignette:
    'Forgetting words and getting lost in familiar places. History of irregular heartbeat, high blood pressure, and diabetes.',
  domain: 'radiology',
  difficulty: 'intermediate',
  artifact: {
    kind: 'image-stack',
    series: [
      stackSeries('ser-flair', 'FLAIR', 'MR', '/images/sub-1/FLAIR', 28, 'png', `${MRI_ALT}, FLAIR sequence`),
      stackSeries('ser-t1', 'T1 Weighted', 'MR', '/images/sub-1/T1', 26, 'png', `${MRI_ALT}, T1 weighted sequence`),
      stackSeries('ser-dwi', 'DWI Trace', 'MR', '/images/sub-1/DWI_TRACE', 26, 'png', `${MRI_ALT}, diffusion weighted sequence`),
      stackSeries('ser-adc', 'ADC Map', 'MR', '/images/sub-1/ADC', 26, 'png', `${MRI_ALT}, ADC map`),
    ],
  },
  preview: preview(MRI_PREVIEW, 'image/png', 'Preview of an axial FLAIR brain MRI teaching case.'),
  artifactHints: hints('radiology'),
  provenance: provenance(
    'OpenNeuro ds004889, SOOP',
    'Rorden, Absher, and Newman-Norlund, 2024. OpenNeuro dataset ds004889 version 1.1.2.',
    CC0,
    'https://openneuro.org/datasets/ds004889/versions/1.1.2',
  ),
  deidentification: UNREVIEWED_DEIDENTIFICATION,
  contentWarnings: ['Medical imaging'],
  neutralDescription: 'Axial grayscale brain MRI images across FLAIR, T1, DWI, and ADC sequences.',
  teachingNotes: ['Brain MRI stroke protocol teaching case.'],
  presentation: theme('Brain MRI', 'mri', '59,130,246', 'text-blue-400'),
};

const PATHOLOGY_PREVIEW = '/images/patho-1/HE_10x/1.webp' as BuiltinAssetPath;

const PATHOLOGY_CASE: BuiltinCaseDraft = {
  schemaVersion: CASE_PACKAGE_VERSION,
  id: 'patho-study-breast',
  title: '62F, suspicious breast mass',
  vignette:
    'Lump found during routine exam. Imaging showed a suspicious mass. Biopsy taken for microscopic review.',
  domain: 'pathology',
  difficulty: 'intermediate',
  artifact: {
    kind: 'image-stack',
    series: [
      stackSeries('path-he-4x', 'H&E 4x', 'PATH', '/images/patho-1/HE_4x', 1, 'webp', 'H&E stained breast tissue at 4x magnification'),
      stackSeries('path-he-10x', 'H&E 10x', 'PATH', '/images/patho-1/HE_10x', 4, 'webp', 'H&E stained breast tissue at 10x magnification'),
      stackSeries('path-he-40x', 'H&E 40x', 'PATH', '/images/patho-1/HE_40x', 4, 'webp', 'H&E stained breast tissue at 40x magnification'),
    ],
  },
  preview: preview(PATHOLOGY_PREVIEW, 'image/webp', 'Preview of H&E stained breast tissue at 10x magnification.'),
  artifactHints: hints('pathology'),
  provenance: provenance(
    'TCGA-BRCA, public source record TCGA-AC-A62V',
    'The Cancer Genome Atlas Breast Invasive Carcinoma project, public source record TCGA-AC-A62V.',
    { name: 'GDC Open Access data terms' },
    'https://portal.gdc.cancer.gov/projects/TCGA-BRCA',
  ),
  deidentification: UNREVIEWED_DEIDENTIFICATION,
  contentWarnings: ['Histopathology image'],
  neutralDescription: 'H&E stained breast tissue images at 4x, 10x, and 40x magnification.',
  teachingNotes: ['Breast invasive ductal carcinoma teaching case.'],
  presentation: theme('Pathology', 'path', '244,63,94', 'text-rose-400'),
};

const SINGLE_IMAGE_CASES: readonly SingleImageDefinition[] = [
  {
    id: 'cxr-pneumothorax',
    title: '21M, sudden chest pain',
    vignette: 'A tall, thin young man struggling to breathe after sudden stabbing chest pain.',
    domain: 'radiology',
    modality: 'CR',
    seriesId: 'ser-cxr-pneumothorax',
    seriesLabel: 'PA Chest X-ray',
    src: '/images/cxr-pneumothorax/1.jpg',
    alt: 'Frontal grayscale chest radiograph.',
    neutralDescription: 'Frontal grayscale chest radiograph showing the thorax.',
    teachingNote: 'Left-sided tension pneumothorax teaching case.',
    sourceName: 'Wikimedia Commons',
    attribution: 'Hellerhoff',
    license: CC_BY_SA_4,
    presentation: theme('Chest X-ray', 'xray', '245,158,11', 'text-amber-400'),
    contentWarnings: ['Medical imaging'],
  },
  {
    id: 'cxr-pneumonia',
    title: '67M, cough and fever',
    vignette: 'Three days of worsening cough with thick sputum, fever, and chills.',
    domain: 'radiology',
    modality: 'CR',
    seriesId: 'ser-cxr-pneumonia',
    seriesLabel: 'PA Chest X-ray',
    src: '/images/cxr-pneumonia/1.jpg',
    alt: 'Frontal grayscale chest radiograph.',
    neutralDescription: 'Frontal grayscale chest radiograph showing the thorax.',
    teachingNote: 'Right middle lobe lobar pneumonia teaching case.',
    sourceName: 'Wikimedia Commons',
    attribution: 'Mikael Haggstrom, MD',
    license: CC0,
    presentation: theme('Chest X-ray', 'xray', '34,197,94', 'text-green-400'),
    contentWarnings: ['Medical imaging'],
  },
  {
    id: 'cxr-chf',
    title: '68M, shortness of breath',
    vignette: 'Cannot lie flat, coughing up pink frothy sputum. Classic signs of fluid in the lungs.',
    domain: 'radiology',
    modality: 'CR',
    seriesId: 'ser-cxr-chf',
    seriesLabel: 'PA Chest X-ray',
    src: '/images/cxr-chf/1.jpg',
    alt: 'Frontal grayscale chest radiograph.',
    neutralDescription: 'Frontal grayscale chest radiograph showing the thorax.',
    teachingNote: 'Acute decompensated heart failure with pulmonary edema teaching case.',
    sourceName: 'Wikimedia Commons',
    attribution: 'Hellerhoff',
    license: CC_BY_SA_3,
    presentation: theme('Chest X-ray', 'xray', '139,92,246', 'text-violet-400'),
    contentWarnings: ['Medical imaging'],
  },
  {
    id: 'cxr-effusion',
    title: '58M, progressive dyspnea',
    vignette: 'Weight loss and worsening shortness of breath over several weeks. One side looks dramatically different.',
    domain: 'radiology',
    modality: 'CR',
    seriesId: 'ser-cxr-effusion',
    seriesLabel: 'PA Chest X-ray',
    src: '/images/cxr-effusion/1.jpg',
    alt: 'Frontal grayscale chest radiograph.',
    neutralDescription: 'Frontal grayscale chest radiograph showing the thorax.',
    teachingNote: 'Massive left-sided pleural effusion teaching case.',
    sourceName: 'Wikimedia Commons',
    attribution: 'James Heilman, MD',
    license: CC_BY_SA_3,
    presentation: theme('Chest X-ray', 'xray', '6,182,212', 'text-cyan-400'),
    contentWarnings: ['Medical imaging'],
  },
  {
    id: 'axr-sbo',
    title: '45F, abdominal pain and vomiting',
    vignette: 'Two days of worsening belly pain, bloating, and vomiting. She had her appendix removed years ago.',
    domain: 'radiology',
    modality: 'CR',
    seriesId: 'ser-axr-sbo',
    seriesLabel: 'Upright Abdominal X-ray',
    src: '/images/axr-sbo/1.jpg',
    alt: 'Frontal grayscale abdominal radiograph.',
    neutralDescription: 'Frontal grayscale abdominal radiograph showing the abdomen.',
    teachingNote: 'Small bowel obstruction teaching case.',
    sourceName: 'Wikimedia Commons',
    attribution: 'James Heilman, MD',
    license: CC_BY_SA_3,
    presentation: theme('Abdominal X-ray', 'xray', '251,146,60', 'text-orange-400'),
    contentWarnings: ['Medical imaging'],
  },
  {
    id: 'ct-epidural',
    title: '87F, fall with head injury',
    vignette: 'An elderly woman found on the floor after a fall. She was initially alert but is now becoming drowsy.',
    domain: 'radiology',
    modality: 'CT',
    seriesId: 'ser-ct-epidural',
    seriesLabel: 'Axial Head CT',
    src: '/images/ct-epidural/1.jpg',
    alt: 'Axial grayscale head CT image.',
    neutralDescription: 'Axial grayscale head CT image showing intracranial anatomy.',
    teachingNote: 'Epidural hematoma teaching case.',
    sourceName: 'Wikimedia Commons',
    attribution: 'Hellerhoff',
    license: CC_BY_SA_4,
    presentation: theme('Head CT', 'ct', '20,184,166', 'text-teal-400'),
    contentWarnings: ['Medical imaging'],
  },
  {
    id: 'ct-subdural',
    title: '80F, progressive headache',
    vignette: 'Worsening headache and confusion over several days. She takes blood thinners for her heart.',
    domain: 'radiology',
    modality: 'CT',
    seriesId: 'ser-ct-subdural',
    seriesLabel: 'Axial Head CT',
    src: '/images/ct-subdural/1.jpg',
    alt: 'Axial grayscale head CT image.',
    neutralDescription: 'Axial grayscale head CT image showing intracranial anatomy.',
    teachingNote: 'Parafalcine subdural hematoma teaching case.',
    sourceName: 'Wikimedia Commons',
    attribution: 'Hellerhoff',
    license: CC_BY_SA_4,
    presentation: theme('Head CT', 'ct', '236,72,153', 'text-pink-400'),
    contentWarnings: ['Medical imaging'],
  },
  {
    id: 'cxr-pneumoperitoneum',
    title: '71F, acute abdominal pain',
    vignette: 'Sudden severe belly pain with a rigid, board-like abdomen. This is a surgical emergency.',
    domain: 'radiology',
    modality: 'CR',
    seriesId: 'ser-cxr-pneumoperitoneum',
    seriesLabel: 'Upright AP X-ray',
    src: '/images/cxr-pneumoperitoneum/1.jpg',
    alt: 'Frontal grayscale upright radiograph including the lower chest and upper abdomen.',
    neutralDescription: 'Frontal grayscale upright radiograph showing the lower chest and upper abdomen.',
    teachingNote: 'Pneumoperitoneum from sigmoid perforation teaching case.',
    sourceName: 'Wikimedia Commons',
    attribution: 'Hellerhoff',
    license: CC_BY_SA_4,
    presentation: theme('Upright X-ray', 'xray', '239,68,68', 'text-red-400'),
    contentWarnings: ['Medical imaging'],
  },
  {
    id: 'axr-nec',
    title: 'Neonate, feeding intolerance',
    vignette: 'A premature baby with bloody stools, abdominal distension, and bilious vomiting.',
    domain: 'radiology',
    modality: 'CR',
    seriesId: 'ser-axr-nec',
    seriesLabel: 'AP Abdominal X-ray',
    src: '/images/axr-nec/1.jpg',
    alt: 'Frontal grayscale neonatal abdominal radiograph.',
    neutralDescription: 'Frontal grayscale neonatal radiograph showing the abdomen.',
    teachingNote: 'Necrotizing enterocolitis with pneumatosis teaching case.',
    sourceName: 'Wikimedia Commons',
    attribution: 'Hellerhoff',
    license: CC_BY_SA_4,
    presentation: theme('Neonatal X-ray', 'xray', '234,179,8', 'text-yellow-400'),
    contentWarnings: ['Medical imaging', 'Neonatal case'],
  },
  {
    id: 'xr-colles',
    title: 'Adult, wrist injury after fall',
    vignette: 'Fell on an outstretched hand. The wrist looks deformed with a visible bump on the back.',
    domain: 'radiology',
    modality: 'CR',
    seriesId: 'ser-xr-colles',
    seriesLabel: 'Wrist X-ray',
    src: '/images/xr-colles/1.jpg',
    alt: 'Grayscale wrist radiograph.',
    neutralDescription: 'Grayscale wrist radiograph showing the distal forearm and wrist.',
    teachingNote: 'Colles fracture teaching case.',
    sourceName: 'Wikimedia Commons',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Collesfracture.jpg',
    attribution: 'Lucien Monfils',
    license: CC_BY_SA_3,
    presentation: theme('Wrist X-ray', 'xray', '132,204,22', 'text-lime-400'),
    contentWarnings: ['Medical imaging'],
  },
  {
    id: 'derm-melanoma',
    title: '55M, evolving pigmented lesion',
    vignette: 'A dark spot on the back that has been changing over the past year. Partner-noticed evolution, irregular border.',
    domain: 'dermatology',
    modality: 'XC',
    seriesId: 'ser-derm-melanoma',
    seriesLabel: 'Clinical Photograph',
    src: '/images/derm-melanoma/1.jpg',
    alt: 'Close clinical photograph of a pigmented skin lesion and surrounding skin.',
    neutralDescription: 'Close clinical photograph of a pigmented skin lesion and surrounding skin.',
    teachingNote: 'Suspicious pigmented lesion and melanoma teaching case.',
    sourceName: 'Wikimedia Commons and National Cancer Institute',
    attribution: 'National Cancer Institute',
    license: PUBLIC_DOMAIN,
    presentation: theme('Dermatology', 'derm', '217,70,239', 'text-fuchsia-400'),
    contentWarnings: ['Clinical photograph of skin'],
  },
  {
    id: 'derm-bcc',
    title: '72M, slow-growing nasal lesion',
    vignette: 'A shiny bump on the nose that occasionally bleeds. Chronic sun exposure history.',
    domain: 'dermatology',
    modality: 'XC',
    seriesId: 'ser-derm-bcc',
    seriesLabel: 'Clinical Photograph',
    src: '/images/derm-bcc/1.jpg',
    alt: 'Close clinical photograph of a raised skin lesion and surrounding skin.',
    neutralDescription: 'Close clinical photograph of a raised skin lesion and surrounding skin.',
    teachingNote: 'Nodular basal cell carcinoma teaching case.',
    sourceName: 'Wikimedia Commons',
    attribution: 'James Heilman, MD',
    license: CC_BY_3,
    presentation: theme('Dermatology', 'derm', '20,184,166', 'text-teal-400'),
    contentWarnings: ['Clinical photograph of skin'],
  },
  {
    id: 'derm-sebk',
    title: '65F, long-standing brown lesions',
    vignette: 'Multiple waxy, stuck-on-looking brown spots on the trunk. Present for years, no change, no symptoms.',
    domain: 'dermatology',
    modality: 'XC',
    seriesId: 'ser-derm-sebk',
    seriesLabel: 'Clinical Photograph',
    src: '/images/derm-sebk/1.jpg',
    alt: 'Close clinical photograph of multiple brown skin lesions and surrounding skin.',
    neutralDescription: 'Close clinical photograph of multiple brown skin lesions and surrounding skin.',
    teachingNote: 'Seborrheic keratosis teaching case.',
    sourceName: 'Wikimedia Commons',
    attribution: 'Assafn',
    license: CC_BY_SA_4,
    presentation: theme('Dermatology', 'derm', '168,85,247', 'text-purple-400'),
    contentWarnings: ['Clinical photograph of skin'],
  },
];

const BUILTIN_CASE_DRAFTS: readonly BuiltinCaseDraft[] = [
  MRI_CASE,
  PATHOLOGY_CASE,
  ...SINGLE_IMAGE_CASES.map(singleImageDraft),
];

export class UnknownCasePackageError extends Error {
  readonly caseId: string;

  constructor(caseId: string) {
    super(`Unknown Case Package: ${caseId}`);
    this.name = 'UnknownCasePackageError';
    this.caseId = caseId;
  }
}

function assertPreviewIsIncluded(casePackage: CasePackageV1): void {
  const paths = casePackage.artifact.kind === 'image'
    ? [casePackage.artifact.src]
    : casePackage.artifact.series.flatMap((series) => series.frames.map((frame) => frame.src));
  if (!paths.includes(casePackage.preview.src)) {
    throw new Error(`Case Package ${casePackage.id} preview is not one of its artifact frames.`);
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

let registryPromise: Promise<readonly CasePackageV1[]> | undefined;

async function buildRegistry(): Promise<readonly CasePackageV1[]> {
  const seenIds = new Set<string>();
  const packages = await Promise.all(
    BUILTIN_CASE_DRAFTS.map(async (draft) => {
      if (seenIds.has(draft.id)) throw new Error(`Duplicate Case Package id: ${draft.id}`);
      seenIds.add(draft.id);
      const lessonPlan = await createBuiltinLessonPlan(draft);
      const { schemaVersion: _schemaVersion, ...input } = draft;
      const casePackage = await createCasePackageV1({
        ...input,
        lessonPlanRef: getLessonPlanRef(lessonPlan),
      });
      assertPreviewIsIncluded(casePackage);
      return deepFreeze(casePackage);
    }),
  );
  return Object.freeze(packages);
}

export function listCasePackages(): Promise<readonly CasePackageV1[]> {
  registryPromise ??= buildRegistry();
  return registryPromise;
}

export async function getCasePackage(caseId: string): Promise<CasePackageV1 | undefined> {
  const packages = await listCasePackages();
  return packages.find((casePackage) => casePackage.id === caseId);
}

export async function requireCasePackage(caseId: string): Promise<CasePackageV1> {
  const casePackage = await getCasePackage(caseId);
  if (!casePackage) throw new UnknownCasePackageError(caseId);
  return casePackage;
}

export function casePackageToSeries(casePackage: CasePackageV1): Series[] {
  if (casePackage.artifact.kind === 'image') {
    return [{
      id: `${casePackage.id}:${casePackage.artifact.seriesId}`,
      studyId: casePackage.id,
      description: casePackage.artifact.seriesLabel,
      modality: casePackage.artifact.modality,
      instanceCount: 1,
      instances: [casePackage.artifact.src],
    }];
  }

  return casePackage.artifact.series.map((series) => ({
    id: `${casePackage.id}:${series.id}`,
    studyId: casePackage.id,
    description: series.label,
    modality: series.modality,
    instanceCount: series.frames.length,
    instances: series.frames.map((frame) => frame.src),
  }));
}

export function countCaseFrames(casePackage: CasePackageV1): number {
  return casePackage.artifact.kind === 'image'
    ? 1
    : casePackage.artifact.series.reduce((total, series) => total + series.frames.length, 0);
}

export function primaryCaseModality(casePackage: CasePackageV1): string {
  return casePackage.artifact.kind === 'image'
    ? casePackage.artifact.modality
    : casePackage.artifact.series[0]?.modality ?? '';
}
