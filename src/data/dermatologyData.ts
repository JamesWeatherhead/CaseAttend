import { Study, Series } from '../types';

const DERM_CASES = [
  {
    studyId: 'derm-melanoma',
    patientName: '55M Evolving Pigmented Lesion',
    patientId: 'DERM-MEL-001',
    accessionNumber: 'DERM-001',
    description: 'Suspicious Pigmented Lesion, Melanoma (Wikimedia / National Cancer Institute, Public Domain)',
    seriesId: 'ser-derm-melanoma',
    seriesDescription: 'Clinical Photograph',
    folder: 'derm-melanoma',
  },
  {
    studyId: 'derm-bcc',
    patientName: '72M Nasal Lesion',
    patientId: 'DERM-BCC-001',
    accessionNumber: 'DERM-002',
    description: 'Nodular Basal Cell Carcinoma (Wikimedia, James Heilman MD, CC BY 3.0)',
    seriesId: 'ser-derm-bcc',
    seriesDescription: 'Clinical Photograph',
    folder: 'derm-bcc',
  },
  {
    studyId: 'derm-sebk',
    patientName: '65F Multiple Pigmented Lesions',
    patientId: 'DERM-SEBK-001',
    accessionNumber: 'DERM-003',
    description: 'Seborrheic Keratosis, close-up (Wikimedia, Assafn, CC BY-SA 4.0)',
    seriesId: 'ser-derm-sebk',
    seriesDescription: 'Clinical Photograph',
    folder: 'derm-sebk',
  },
] as const;

export const DERM_STUDIES: Study[] = DERM_CASES.map((c) => ({
  id: c.studyId,
  patientName: c.patientName,
  patientId: c.patientId,
  accessionNumber: c.accessionNumber,
  studyDate: '20260101',
  modality: 'XC',
  domain: 'dermatology',
  description: c.description,
  seriesCount: 1,
  instanceCount: 1,
}));

export const DERM_SERIES_MAP: Record<string, Series[]> = {};

DERM_CASES.forEach((c) => {
  DERM_SERIES_MAP[c.studyId] = [
    {
      id: c.seriesId,
      studyId: c.studyId,
      description: c.seriesDescription,
      modality: 'XC',
      instanceCount: 1,
      instances: [`/images/${c.folder}/1.jpg`],
    },
  ];
});

export const DERM_STUDY_IDS: string[] = DERM_CASES.map((c) => c.studyId);
