import type { LearnerLevel } from '../../constants';

export type DomainKey =
  | 'radiology'
  | 'pathology'
  | 'dermatology'
  | 'ecg'
  | 'ultrasound'
  | 'ophthalmology';

export interface ArtifactHints {
  showWindowLevel: boolean;
  showSeriesSelector: boolean;
  showSegmentation: boolean;
}

export interface Domain {
  key: DomainKey;
  label: string;
  artifactHints: ArtifactHints;
  welcomeMessage: (level: LearnerLevel, studyId?: string) => string;
  getInitialSuggestions: (level: LearnerLevel, hasImage: boolean, studyId?: string) => string[];
  contextLabel: (dicomModality: string) => string;
  captureLabel: (dicomModality: string) => string;
}
