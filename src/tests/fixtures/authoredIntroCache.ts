import { INTRO_CACHE_REQUEST_TEMPLATE_VERSION, INTRO_CACHE_SCHEMA, INTRO_CACHE_SCHEMA_VERSION, type IntroCacheV1 } from '../../core/introCache';

export function authoredIntroDraft(caseId = 'local-teaching-case', introPrompt = 'What do you notice first?'): IntroCacheV1 {
  const level = { introPrompt, introQuestions: [{ id: 'notice-first', label: 'What should I notice?', prompt: 'What should I notice first?', cachedAnswer: 'Compare the visible shapes. Educational use only.' }] };
  return {
    schema: INTRO_CACHE_SCHEMA,
    schemaVersion: INTRO_CACHE_SCHEMA_VERSION,
    caseId,
    lessonPlanSha256: 'c'.repeat(64),
    provenance: {
      modelId: 'test/model', systemPromptSha256: 'b'.repeat(64), requestTemplateVersion: INTRO_CACHE_REQUEST_TEMPLATE_VERSION,
      mediaSha: 'a'.repeat(64), generatedAt: '2026-09-05T12:00:00.000Z',
    },
    review: { status: 'draft' },
    levels: { highschool: level, undergrad: level, ms_preclinical: level, ms_clinical: level, resident: level },
  };
}
