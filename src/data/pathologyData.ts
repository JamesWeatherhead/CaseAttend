import { Study, Series } from '../types';

export const PATHOLOGY_ASSET_BASE_URL = '/images/patho-1';

const generateImagePaths = (basePath: string, count: number): string[] => {
  return Array.from({ length: count }, (_, i) => `${basePath}/${i + 1}.webp`);
};

export const PATHOLOGY_STUDY_ID = 'patho-study-breast';

export const PATHOLOGY_SERIES_CONFIG = [
  {
    id: 'path-he-4x',
    description: 'H&E 4x',
    modality: 'PATH',
    folder: 'HE_4x',
    count: 1,
  },
  {
    id: 'path-he-10x',
    description: 'H&E 10x',
    modality: 'PATH',
    folder: 'HE_10x',
    count: 4,
  },
  {
    id: 'path-he-40x',
    description: 'H&E 40x',
    modality: 'PATH',
    folder: 'HE_40x',
    count: 4,
  },
];

export const PATHOLOGY_STUDY: Study = {
  id: PATHOLOGY_STUDY_ID,
  patientName: 'Pathology Demo Case',
  patientId: 'TCGA-AC-A62V',
  accessionNumber: 'PATH-001',
  studyDate: '20250101',
  modality: 'PATH',
  domain: 'pathology',
  description: 'Breast Invasive Ductal Carcinoma (TCGA, Open Access)',
  seriesCount: PATHOLOGY_SERIES_CONFIG.length,
  instanceCount: PATHOLOGY_SERIES_CONFIG.reduce((acc, s) => acc + s.count, 0),
};

export const PATHOLOGY_SERIES: Series[] = PATHOLOGY_SERIES_CONFIG.map((cfg) => ({
  id: cfg.id,
  studyId: PATHOLOGY_STUDY_ID,
  description: cfg.description,
  modality: cfg.modality,
  instanceCount: cfg.count,
  instances: generateImagePaths(`${PATHOLOGY_ASSET_BASE_URL}/${cfg.folder}`, cfg.count),
}));

// Descriptions for series tooltips
export const PATHOLOGY_SERIES_DESCRIPTIONS: Record<string, string> = {
  'H&E 4x': 'Low-power overview showing tissue architecture and overall pattern.',
  'H&E 10x': 'Medium power showing glandular structures and stromal features.',
  'H&E 40x': 'High power showing cellular detail, nuclear morphology, and mitotic figures.',
};
