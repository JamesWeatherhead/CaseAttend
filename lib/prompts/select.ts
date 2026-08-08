/**
 * System-prompt selection + assembly for the browser-direct OpenRouter (BYOK)
 * path via functions/api/prompt.ts. Never touches an API key: picks the
 * teaching prompt for a case, layers on learner-level / mode / image guidance,
 * hands the assembled instructions back to the browser so it can call
 * OpenRouter itself.
 */

import { RADIOLOGY_SYSTEM_PROMPT } from './radiology.js';
import { PATHOLOGY_SYSTEM_PROMPT } from './pathology.js';
import { DERMATOLOGY_SYSTEM_PROMPT } from './dermatology.js';
import { CXR_CASE_CONTEXTS } from './cxr-cases.js';
import { LEVEL_INSTRUCTIONS } from './shared.js';

export type Modality = 'radiology' | 'pathology' | 'dermatology';
export type AiMode = 'chat' | 'deep_think' | 'search';
export type LearnerLevel = 'highschool' | 'undergrad' | 'ms_preclinical' | 'ms_clinical' | 'resident';

/** Pick the base teaching prompt for a modality + optional CXR case. */
export function getSystemPrompt(modality: Modality, caseId?: string): string {
  if (modality === 'pathology') return PATHOLOGY_SYSTEM_PROMPT;
  if (modality === 'dermatology') return DERMATOLOGY_SYSTEM_PROMPT;

  let prompt = RADIOLOGY_SYSTEM_PROMPT;

  if (caseId && CXR_CASE_CONTEXTS[caseId]) {
    const caseContextStart = prompt.indexOf('## CASE CONTEXT');
    const radiologyOrientationStart = prompt.indexOf('## RADIOLOGY ORIENTATION RULES');
    if (caseContextStart !== -1 && radiologyOrientationStart !== -1) {
      prompt = prompt.substring(0, caseContextStart)
        + CXR_CASE_CONTEXTS[caseId]
        + '\n\n'
        + prompt.substring(radiologyOrientationStart);
    } else {
      prompt += '\n\n' + CXR_CASE_CONTEXTS[caseId];
    }
  }

  return prompt;
}

/**
 * Build the FULL system instruction (base prompt + learner-level + mode + image
 * guidance) exactly the way the provider adapters do internally. Used by the
 * browser-direct OpenRouter path, which has no server-side adapter to assemble it.
 */
export function buildInstructions(opts: {
  modality: Modality;
  caseId?: string;
  learnerLevel: LearnerLevel;
  mode: AiMode;
  hasImage: boolean;
}): string {
  const { modality, caseId, learnerLevel, mode, hasImage } = opts;

  let instructions = getSystemPrompt(modality, caseId) + '\n\n';
  const domainLabel = modality === 'pathology' ? 'pathology' : modality === 'dermatology' ? 'dermatology' : 'radiology';
  instructions += `You are CaseAttend, a ${domainLabel} teaching assistant. ${LEVEL_INSTRUCTIONS[learnerLevel]} Do not provide diagnoses or treatment.\n\n`;

  if (mode === 'deep_think') {
    instructions += 'You are in DEEP THINK mode. Reason carefully and thoroughly before answering. Present a structured explanation.\n\n';
  } else if (mode === 'search') {
    instructions += 'You are in SEARCH mode. Cite specific medical guidelines, textbooks, or literature where relevant. Include source names.\n\n';
  }

  if (!hasImage) {
    instructions += 'There is no captured image attached. If the user asks about "this image", tell them to capture a slice first.\n';
  } else {
    instructions += 'There is one captured image attached. Analyze it when the user refers to "this image" or "this slice".\n';
  }

  return instructions;
}
