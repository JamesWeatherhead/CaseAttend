import type { LearnerLevel } from '../../constants';
import type { Domain } from './types';

const OPENINGS: Record<LearnerLevel, string> = {
  highschool: 'Describe the colors, shapes, and branching vessels before naming a condition.',
  undergrad: 'Locate the optic disc, macula, vessels, and background retina before interpreting a finding.',
  ms_preclinical: 'Connect visible retinal anatomy with the fictional vignette. What feature stands out first?',
  ms_clinical: 'Describe the image systematically, then build a differential from the visible evidence.',
  ms_step2: 'Describe the image systematically, then build a differential from the visible evidence.',
  resident: 'Give a structured ocular image interpretation and state image-quality limitations.',
};

const WITH_IMAGE: Record<LearnerLevel, string[]> = {
  highschool: ['Help me find the main structures.', 'What are the branching lines?'],
  undergrad: ['Walk me through retinal anatomy.', 'Help me compare the disc and macula.'],
  ms_preclinical: ['Connect the visible anatomy to physiology.', 'What patterns should I describe neutrally?'],
  ms_clinical: ['Let me give a systematic fundus description.', 'What visible features narrow the differential?'],
  ms_step2: ['Let me give a systematic fundus description.', 'What visible features narrow the differential?'],
  resident: ['Challenge my ocular image read.', 'What subtle vascular or disc features matter?'],
};

const WITHOUT_IMAGE: Record<LearnerLevel, string[]> = {
  highschool: ['What is the retina?', 'How is the back of the eye photographed?'],
  undergrad: ['Review fundus anatomy.', 'How do ocular imaging modalities differ?'],
  ms_preclinical: ['Connect retinal anatomy to visual pathways.', 'Review normal disc and vessel appearance.'],
  ms_clinical: ['Teach me a systematic fundus exam.', 'How should ocular image findings be described?'],
  ms_step2: ['Teach me a systematic fundus exam.', 'How should ocular image findings be described?'],
  resident: ['Review ocular imaging pitfalls.', 'How should image quality limit interpretation?'],
};

export const ophthalmology: Domain = {
  key: 'ophthalmology',
  label: 'Ophthalmology',
  artifactHints: {
    showWindowLevel: false,
    showSeriesSelector: false,
    showSegmentation: true,
  },
  welcomeMessage: (level) => `**Welcome to an ophthalmology teaching case.**\n\n${OPENINGS[level]}`,
  getInitialSuggestions: (level, hasImage) => (hasImage ? WITH_IMAGE : WITHOUT_IMAGE)[level],
  contextLabel: () => 'Ophthalmic image',
  captureLabel: () => 'Ophthalmic image',
};
