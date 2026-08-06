

import { Study, Series } from "../types";

// Serve images from the local public directory.
// In production (Vercel), these are served as static assets from /images/sub-1/
// Images use numeric naming: 1.png, 2.png, etc.
export const ASSET_BASE_URL = "/images/sub-1";

// Helper to generate file paths: 1.png, 2.png, ... N.png
const generateImagePaths = (basePath: string, count: number): string[] => {
  // We use simple numeric naming: 1.png, 2.png, etc.
  return Array.from({ length: count }, (_, i) => `${basePath}/${i + 1}.png`);
};

export const LOCAL_STUDY_ID = "local-study-sub1";
export const LOCAL_PATIENT_NAME = "Local Demo Patient";

export const LOCAL_SERIES_CONFIG = [
  {
    id: "ser-flair",
    description: "FLAIR",
    modality: "MR",
    folder: "FLAIR",
    count: 28,
  },
  {
    id: "ser-t1",
    description: "T1 Weighted",
    modality: "MR",
    folder: "T1",
    count: 26,
  },
  {
    id: "ser-dwi",
    description: "DWI Trace",
    modality: "MR",
    folder: "DWI_TRACE",
    count: 26,
  },
  {
    id: "ser-adc",
    description: "ADC Map",
    modality: "MR",
    folder: "ADC",
    count: 26,
  }
];

// Construct the Study Object
export const LOCAL_STUDY: Study = {
  id: LOCAL_STUDY_ID,
  patientName: LOCAL_PATIENT_NAME,
  patientId: "SUB-01",
  accessionNumber: "ACC-001",
  studyDate: "20250101",
  modality: "MR",
  description: "Brain Stroke Protocol (CC0)",
  seriesCount: LOCAL_SERIES_CONFIG.length,
  instanceCount: LOCAL_SERIES_CONFIG.reduce((acc, s) => acc + s.count, 0),
};

// Construct the Series Objects
export const LOCAL_SERIES: Series[] = LOCAL_SERIES_CONFIG.map(cfg => ({
  id: cfg.id,
  studyId: LOCAL_STUDY_ID,
  description: cfg.description,
  modality: cfg.modality,
  instanceCount: cfg.count,
  // Use absolute path starting with /public/ to match the file server structure
  instances: generateImagePaths(`${ASSET_BASE_URL}/${cfg.folder}`, cfg.count)
}));