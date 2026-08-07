import type { LearnerLevel } from '../../constants';

export type DomainKey = 'radiology' | 'pathology';

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
  preAnalysisPrompt: (studyDescription: string, seriesDescription: string) => string;
  contextLabel: (dicomModality: string) => string;
  captureLabel: (dicomModality: string) => string;
}
