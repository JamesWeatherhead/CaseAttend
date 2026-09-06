import type { LearnerLevel } from '../../constants';
import type { Domain } from './types';

const OPENINGS: Record<LearnerLevel, string> = {
  highschool: 'Describe the bright, gray, and dark areas before deciding what they represent.',
  undergrad: 'Identify the imaging plane and visible landmarks before interpreting a finding.',
  ms_preclinical: 'Connect echogenicity and anatomy with the fictional vignette. What stands out first?',
  ms_clinical: 'State the view, image adequacy, visible findings, and important limitations.',
  ms_step2: 'State the view, image adequacy, visible findings, and important limitations.',
  resident: 'Interpret the static teaching image systematically and separate visible evidence from acquisition assumptions.',
};

const WITH_IMAGE: Record<LearnerLevel, string[]> = {
  highschool: ['What do bright and dark areas mean?', 'Help me find a landmark.'],
  undergrad: ['What view is this?', 'Walk me through the visible anatomy.'],
  ms_preclinical: ['Connect the image appearance to anatomy.', 'What artifact could mimic this finding?'],
  ms_clinical: ['Let me describe image adequacy and findings.', 'How does this image change the differential?'],
  ms_step2: ['Let me describe image adequacy and findings.', 'How does this image change the differential?'],
  resident: ['Challenge my POCUS interpretation.', 'What acquisition limitation should I state?'],
};

const WITHOUT_IMAGE: Record<LearnerLevel, string[]> = {
  highschool: ['How does ultrasound make an image?', 'Why are some areas black?'],
  undergrad: ['Teach me echogenicity and common artifacts.', 'How are ultrasound planes described?'],
  ms_preclinical: ['Review probe orientation and anatomy.', 'Teach me common ultrasound artifacts.'],
  ms_clinical: ['Review a focused POCUS workflow.', 'How should image adequacy be documented?'],
  ms_step2: ['Review a focused POCUS workflow.', 'How should image adequacy be documented?'],
  resident: ['Review POCUS limitations and pitfalls.', 'How should a static frame be interpreted cautiously?'],
};

export const ultrasound: Domain = {
  key: 'ultrasound',
  label: 'Ultrasound',
  artifactHints: {
    showWindowLevel: false,
    showSeriesSelector: false,
    showSegmentation: true,
  },
  welcomeMessage: (level) => `**Welcome to an ultrasound teaching case.**\n\n${OPENINGS[level]}`,
  getInitialSuggestions: (level, hasImage) => (hasImage ? WITH_IMAGE : WITHOUT_IMAGE)[level],
  contextLabel: () => 'Ultrasound',
  captureLabel: () => 'Ultrasound image',
};
