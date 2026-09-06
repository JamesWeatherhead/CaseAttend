import type { LearnerLevel } from '../../constants';
import type { Domain } from './types';

const OPENINGS: Record<LearnerLevel, string> = {
  highschool: 'Start with the repeating shapes. What looks regular, and what looks different?',
  undergrad: 'Describe the rate, regularity, and major waveform components before interpreting them.',
  ms_preclinical: 'Use a rate, rhythm, axis, intervals, and morphology sequence. What do you observe first?',
  ms_clinical: 'Read the tracing systematically, then connect the visible pattern with the fictional vignette.',
  ms_step2: 'Read the tracing systematically, then connect the visible pattern with the fictional vignette.',
  resident: 'Give a concise systematic ECG interpretation and state the visible evidence for each conclusion.',
};

const WITH_IMAGE: Record<LearnerLevel, string[]> = {
  highschool: ['Help me identify the repeating waves.', 'Does the tracing look regular?'],
  undergrad: ['Walk me through rate and rhythm.', 'Help me label P, QRS, and T waves.'],
  ms_preclinical: ['Check my interval measurements.', 'Help me connect the waveform to cardiac physiology.'],
  ms_clinical: ['Let me present my ECG interpretation.', 'What visible features narrow the differential?'],
  ms_step2: ['Let me present my ECG interpretation.', 'What visible features narrow the differential?'],
  resident: ['Challenge my systematic read.', 'What subtle morphology or lead relationships matter?'],
};

const WITHOUT_IMAGE: Record<LearnerLevel, string[]> = {
  highschool: ['What does an ECG measure?', 'Why does the tracing have waves?'],
  undergrad: ['Teach me the cardiac conduction sequence.', 'How do ECG leads view the heart?'],
  ms_preclinical: ['Review ECG intervals and normal values.', 'Teach me a systematic ECG approach.'],
  ms_clinical: ['How should I present an ECG?', 'Review a safe differential-first ECG workflow.'],
  ms_step2: ['How should I present an ECG?', 'Review a safe differential-first ECG workflow.'],
  resident: ['Review common ECG interpretation pitfalls.', 'How should serial tracings be compared?'],
};

export const ecg: Domain = {
  key: 'ecg',
  label: 'ECG',
  artifactHints: {
    showWindowLevel: false,
    showSeriesSelector: false,
    showSegmentation: true,
  },
  welcomeMessage: (level) => `**Welcome to an ECG teaching case.**\n\n${OPENINGS[level]}`,
  getInitialSuggestions: (level, hasImage) => (hasImage ? WITH_IMAGE : WITHOUT_IMAGE)[level],
  contextLabel: () => 'Electrocardiogram',
  captureLabel: () => 'ECG tracing',
};
