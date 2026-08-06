import { Study, Series } from '../types';

// ── Asset Paths ──────────────────────────────────────────────────────────
// CXR images live at /public/images/cxr-<case>/1.jpg
// Each case is a single PA chest X-ray (1 series, 1 instance).

const CXR_CASES = [
  {
    studyId: 'cxr-pneumothorax',
    patientName: '21M Tension Pneumothorax',
    patientId: 'CXR-PTX-001',
    accessionNumber: 'CXR-001',
    description: 'Left-Sided Tension Pneumothorax (Wikimedia, CC BY-SA 4.0)',
    seriesId: 'ser-cxr-pneumothorax',
    seriesDescription: 'PA Chest X-ray',
    folder: 'cxr-pneumothorax',
  },
  {
    studyId: 'cxr-pneumonia',
    patientName: '67M RML Pneumonia',
    patientId: 'CXR-PNA-001',
    accessionNumber: 'CXR-002',
    description: 'Right Middle Lobe Lobar Pneumonia (Wikimedia, CC0)',
    seriesId: 'ser-cxr-pneumonia',
    seriesDescription: 'PA Chest X-ray',
    folder: 'cxr-pneumonia',
  },
  {
    studyId: 'cxr-chf',
    patientName: '68M Pulmonary Edema',
    patientId: 'CXR-CHF-001',
    accessionNumber: 'CXR-003',
    description: 'Acute Decompensated Heart Failure with Pulmonary Edema (Wikimedia, CC BY-SA 3.0)',
    seriesId: 'ser-cxr-chf',
    seriesDescription: 'PA Chest X-ray',
    folder: 'cxr-chf',
  },
  {
    studyId: 'cxr-effusion',
    patientName: '58M Pleural Effusion',
    patientId: 'CXR-EFF-001',
    accessionNumber: 'CXR-004',
    description: 'Massive Left-Sided Pleural Effusion (Wikimedia, CC BY-SA 3.0)',
    seriesId: 'ser-cxr-effusion',
    seriesDescription: 'PA Chest X-ray',
    folder: 'cxr-effusion',
  },
  {
    studyId: 'axr-sbo',
    patientName: '45F Small Bowel Obstruction',
    patientId: 'AXR-SBO-001',
    accessionNumber: 'AXR-001',
    description: 'Small Bowel Obstruction, Upright Abdominal X-ray (Wikimedia, CC BY-SA 3.0)',
    seriesId: 'ser-axr-sbo',
    seriesDescription: 'Upright Abdominal X-ray',
    folder: 'axr-sbo',
  },
  {
    studyId: 'ct-epidural',
    patientName: '87F Epidural Hematoma',
    patientId: 'CT-EDH-001',
    accessionNumber: 'CT-001',
    description: 'Epidural Hematoma, Head CT (Wikimedia, CC BY-SA 4.0)',
    seriesId: 'ser-ct-epidural',
    seriesDescription: 'Axial Head CT',
    folder: 'ct-epidural',
  },
  {
    studyId: 'ct-subdural',
    patientName: '80F Subdural Hematoma',
    patientId: 'CT-SDH-001',
    accessionNumber: 'CT-002',
    description: 'Parafalcine Subdural Hematoma, Head CT (Wikimedia, CC BY-SA 4.0)',
    seriesId: 'ser-ct-subdural',
    seriesDescription: 'Axial Head CT',
    folder: 'ct-subdural',
  },
  {
    studyId: 'cxr-pneumoperitoneum',
    patientName: '71F Pneumoperitoneum',
    patientId: 'CXR-PERF-001',
    accessionNumber: 'CXR-005',
    description: 'Pneumoperitoneum from Sigmoid Perforation (Wikimedia, CC BY-SA 4.0)',
    seriesId: 'ser-cxr-pneumoperitoneum',
    seriesDescription: 'Upright AP X-ray',
    folder: 'cxr-pneumoperitoneum',
  },
  {
    studyId: 'axr-nec',
    patientName: 'Neonate NEC',
    patientId: 'AXR-NEC-001',
    accessionNumber: 'AXR-002',
    description: 'Necrotizing Enterocolitis with Pneumatosis (Wikimedia, CC BY-SA 4.0)',
    seriesId: 'ser-axr-nec',
    seriesDescription: 'AP Abdominal X-ray',
    folder: 'axr-nec',
  },
  {
    studyId: 'xr-colles',
    patientName: 'Adult Colles Fracture',
    patientId: 'XR-COL-001',
    accessionNumber: 'XR-001',
    description: 'Colles Fracture, Wrist X-ray (Wikimedia, CC BY-SA 3.0)',
    seriesId: 'ser-xr-colles',
    seriesDescription: 'Wrist X-ray',
    folder: 'xr-colles',
  },
] as const;

// ── Study Objects ────────────────────────────────────────────────────────

export const CXR_STUDIES: Study[] = CXR_CASES.map((c) => ({
  id: c.studyId,
  patientName: c.patientName,
  patientId: c.patientId,
  accessionNumber: c.accessionNumber,
  studyDate: '20260101',
  modality: 'CR',
  description: c.description,
  seriesCount: 1,
  instanceCount: 1,
}));

// ── Series Objects ───────────────────────────────────────────────────────

export const CXR_SERIES_MAP: Record<string, Series[]> = {};

CXR_CASES.forEach((c) => {
  CXR_SERIES_MAP[c.studyId] = [
    {
      id: c.seriesId,
      studyId: c.studyId,
      description: c.seriesDescription,
      modality: 'CR',
      instanceCount: 1,
      instances: [`/images/${c.folder}/1.jpg`],
    },
  ];
});

// ── Convenience Exports ──────────────────────────────────────────────────

export const CXR_STUDY_IDS: string[] = CXR_CASES.map((c) => c.studyId);
