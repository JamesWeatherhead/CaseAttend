import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const credentialMocks = vi.hoisted(() => ({ getKey: vi.fn(), getModel: vi.fn() }));
vi.mock('../services/byokStore', () => credentialMocks);

import { createCasePackageV1, finalizeCasePackageV1 } from '../core/casePackage';
import { finalizeLessonPlanV1, getLessonPlanRef } from '../core/lessonPlan';
import { createStarterLessonPlanV1 } from '../core/starterLesson';
import {
  evaluateObjectiveEvidence,
  OBJECTIVE_EVIDENCE_LIMITS as LIMITS,
  OBJECTIVE_EVIDENCE_MODEL_ID as MODEL,
  type ObjectiveEvidenceModelRequest,
  type ObjectiveEvidenceRequest,
  type ObjectiveEvidenceTransport,
} from '../services/objectiveEvidence';
import { requestObjectiveEvidenceWithOpenRouter } from '../services/openrouterClient';

const PRIVATE_ANSWER = 'EDUCATOR_ONLY_ANSWER: the teaching diagram shows two example circles.';
const LEARNER_TEXT = 'Two round areas appear in the upper region. I cannot infer their cause from this image.';
const QUOTE = 'Two round areas appear in the upper region.';
const KEY = 'test-only-credential-never-returned';

async function fixture(): Promise<ObjectiveEvidenceRequest> {
  const starter = await createStarterLessonPlanV1({
    caseId: 'objective-example', neutralDescription: 'A synthetic teaching diagram with two regions.',
    teachingNotes: [PRIVATE_ANSWER], sourceName: 'Synthetic teaching fixture', sourceUrl: 'https://example.org/diagram',
    learnerLevels: ['ms_preclinical', 'resident'],
  });
  const { manifest: _lessonManifest, ...draft } = starter;
  const lessonPlan = await finalizeLessonPlanV1({
    ...draft,
    objectives: draft.objectives.map((objective, index) => ({ ...objective, learnerLevels: [index === 2 ? 'resident' : 'ms_preclinical'] })),
  });
  const image = { src: '/images/example.png', mimeType: 'image/png', sha256: '1'.repeat(64), alt: 'A teaching diagram.' };
  const casePackage = await createCasePackageV1({
    id: 'objective-example', title: 'Teaching diagram', vignette: 'An educational example.', domain: 'radiology', difficulty: 'introductory',
    artifact: { ...image, kind: 'image', modality: 'OT', seriesId: 'diagram', seriesLabel: 'Diagram' }, preview: image,
    artifactHints: { showWindowLevel: false, showSeriesSelector: false, showSegmentation: false },
    provenance: { sourceName: 'Synthetic fixture', license: { name: 'CC0' }, attribution: 'Test fixture', clinicianReview: { reviewed: false } },
    deidentification: { status: 'synthetic' }, contentWarnings: [], neutralDescription: lessonPlan.neutralDescription,
    teachingNotes: lessonPlan.teachingNotes, lessonPlanRef: getLessonPlanRef(lessonPlan),
    presentation: { subtitle: 'Teaching', category: 'diagram', accentColor: '#123456', accentGlow: '#123456', accentBorder: '#123456', textClass: 'text-green-400' },
  });
  return { casePackage, lessonPlan, learnerLevel: 'ms_preclinical', sessionId: 'session-1', turnId: 'turn-1', learnerText: LEARNER_TEXT, assistance: 'none' };
}

function payload(input: ObjectiveEvidenceRequest, changes: Record<string, unknown> = {}) {
  return {
    objectives: [
      { objectiveId: input.lessonPlan.objectives[0].id, status: 'observed', quote: QUOTE, reasonCode: 'supported', ...changes },
      { objectiveId: input.lessonPlan.objectives[1].id, status: 'not_observed', quote: '', reasonCode: 'not_demonstrated' },
    ],
  };
}

function providerResponse(content: string, extra: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ model: MODEL, choices: [{ finish_reason: 'stop', message: { content } }], ...extra }), { headers: { 'Content-Type': 'application/json' } });
}

let input: ObjectiveEvidenceRequest;
beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal('crypto', webcrypto);
  credentialMocks.getKey.mockReturnValue(KEY);
  credentialMocks.getModel.mockReturnValue('the-separate-coaching-model');
  input = await fixture();
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('objective evidence evaluator', () => {
  it('uses only the selected audience and exact manifests, with app-owned attribution and quoted learner evidence', async () => {
    const transport = vi.fn<ObjectiveEvidenceTransport>().mockResolvedValue({ modelId: MODEL, content: JSON.stringify(payload(input)) });
    const result = await evaluateObjectiveEvidence(input, { transport });
    expect(result).toMatchObject({
      status: 'assessed', sessionId: 'session-1', turnId: 'turn-1', learnerLevel: 'ms_preclinical', assistance: 'none', modelId: MODEL,
      caseRef: { id: input.casePackage.id, schemaVersion: '1.0', sha256: input.casePackage.manifest.sha256 },
      lessonRef: getLessonPlanRef(input.lessonPlan),
      objectives: [{ objectiveId: input.lessonPlan.objectives[0].id, status: 'observed', quote: QUOTE }, { status: 'not_observed', quote: '' }],
    });
    const request = transport.mock.calls[0][0];
    const modelInput = JSON.parse(request.userContent);
    expect(modelInput.objectives).toHaveLength(2);
    expect(modelInput.rubric).toHaveLength(2);
    expect(modelInput.educatorFacts).toEqual([PRIVATE_ANSWER]);
    expect(modelInput).not.toHaveProperty('sessionId');
    expect(JSON.stringify(result)).not.toContain(PRIVATE_ANSWER);
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it.each(['hint', 'explanation'] as const)('preserves assistance=%s instead of claiming independent performance', async (assistance) => {
    const result = await evaluateObjectiveEvidence({ ...input, assistance }, { transport: async () => ({ modelId: MODEL, content: JSON.stringify(payload(input)) }) });
    expect(result).toMatchObject({ status: 'assessed', assistance });
  });

  it.each([
    { quote: 'A fabricated quotation absent from the response.' },
    { quote: '' },
    { objectiveId: 'unknown-objective' },
    { objectiveId: 'state-uncertainty' },
    { status: 'mastered' },
    { reason: PRIVATE_ANSWER },
    { reasonCode: PRIVATE_ANSWER },
    { status: 'partial', reasonCode: 'supported' },
  ])('discards invalid or leaking model output as not assessed (%j)', async (change) => {
    const result = await evaluateObjectiveEvidence(input, { transport: async () => ({ modelId: MODEL, content: JSON.stringify(payload(input, change)) }) });
    expect(result).toMatchObject({ status: 'not_assessed', objectives: [], errorCode: 'invalid_response' });
    expect(JSON.stringify(result)).not.toContain(PRIVATE_ANSWER);
  });

  it('rejects omitted/duplicated objectives, extra identity fields, and a mismatched model', async () => {
    const original = payload(input);
    for (const output of [
      { objectives: original.objectives.slice(0, 1) },
      { objectives: [original.objectives[0], original.objectives[0]] },
      { ...original, sessionId: 'invented-session' },
    ]) {
      await expect(evaluateObjectiveEvidence(input, { transport: async () => ({ modelId: MODEL, content: JSON.stringify(output) }) })).resolves.toMatchObject({ status: 'not_assessed', objectives: [], errorCode: 'invalid_response' });
    }
    await expect(evaluateObjectiveEvidence(input, { transport: async () => ({ modelId: 'different-model', content: JSON.stringify(original) }) })).resolves.toMatchObject({ errorCode: 'invalid_response' });
  });

  it.each(['', 'Thanks! Got it.', 'I do not know.'])('does not send participation-only text (%s)', async (learnerText) => {
    const transport = vi.fn<ObjectiveEvidenceTransport>();
    await expect(evaluateObjectiveEvidence({ ...input, learnerText }, { transport })).resolves.toMatchObject({ status: 'not_assessed', objectives: [], errorCode: 'empty_attempt' });
    expect(transport).not.toHaveBeenCalled();
  });

  it('does not credit copied tutor responses or a copied excerpt within a fresh response', async () => {
    const transport = vi.fn<ObjectiveEvidenceTransport>().mockResolvedValue({ modelId: MODEL, content: JSON.stringify(payload(input)) });
    await expect(evaluateObjectiveEvidence({ ...input, priorTutorText: `Earlier explanation: ${LEARNER_TEXT}` }, { transport })).resolves.toMatchObject({ status: 'not_assessed', objectives: [], errorCode: 'copied_answer' });
    expect(transport).not.toHaveBeenCalled();
    const result = await evaluateObjectiveEvidence({ ...input, priorTutorText: `Earlier hint: ${QUOTE}` }, { transport });
    expect(result).toMatchObject({ status: 'assessed', objectives: expect.arrayContaining([expect.objectContaining({ status: 'needs_review', quote: QUOTE })]) });
  });

  it('rejects stale manifests, mismatched lesson references, and unavailable levels before provider access', async () => {
    const transport = vi.fn<ObjectiveEvidenceTransport>();
    const { manifest: _manifest, ...caseDraft } = input.casePackage;
    const changedCase = await finalizeCasePackageV1({ ...caseDraft, lessonPlanRef: { ...input.casePackage.lessonPlanRef, sha256: '2'.repeat(64) } });
    for (const invalid of [
      { ...input, casePackage: { ...input.casePackage, title: 'Changed after hashing' } },
      { ...input, lessonPlan: { ...input.lessonPlan, teachingNotes: ['Changed after hashing'] } },
      { ...input, casePackage: changedCase },
      { ...input, learnerLevel: 'highschool' as const },
      { ...input, sessionId: '' },
    ]) {
      await expect(evaluateObjectiveEvidence(invalid, { transport })).resolves.toMatchObject({ status: 'not_assessed', objectives: [], errorCode: 'invalid_context' });
    }
    expect(transport).not.toHaveBeenCalled();
  });

  it('snapshots content and attribution before async work', async () => {
    let finish!: (value: { modelId: string; content: string }) => void;
    const transport = vi.fn<ObjectiveEvidenceTransport>(() => new Promise((resolve) => { finish = resolve; }));
    const original = payload(input);
    const pending = evaluateObjectiveEvidence(input, { transport });
    input.turnId = 'mutated-turn';
    input.learnerText = 'mutated learner text';
    input.lessonPlan.teachingNotes = ['changed'];
    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
    finish({ modelId: MODEL, content: JSON.stringify(original) });
    await expect(pending).resolves.toMatchObject({ status: 'assessed', turnId: 'turn-1', objectives: expect.arrayContaining([expect.objectContaining({ quote: QUOTE })]) });
  });

  it('fails closed on excessive input/output and never exposes raw transport errors', async () => {
    const transport = vi.fn<ObjectiveEvidenceTransport>();
    await expect(evaluateObjectiveEvidence({ ...input, learnerText: 'x'.repeat(LIMITS.maxLearnerCharacters + 1) }, { transport })).resolves.toMatchObject({ errorCode: 'input_limit', objectives: [] });
    expect(transport).not.toHaveBeenCalled();
    await expect(evaluateObjectiveEvidence(input, { transport: async () => ({ modelId: MODEL, content: 'x'.repeat(LIMITS.maxResponseBytes + 1) }) })).resolves.toMatchObject({ errorCode: 'invalid_response', objectives: [] });
    const result = await evaluateObjectiveEvidence(input, { transport: async () => { throw new Error(`${KEY} ${PRIVATE_ANSWER}`); } });
    expect(result).toMatchObject({ errorCode: 'provider_error', objectives: [] });
    expect(JSON.stringify(result)).not.toContain(KEY);
    expect(JSON.stringify(result)).not.toContain(PRIVATE_ANSWER);
  });

  it('cancels before dispatch and discards an in-flight result even if the transport ignores abort', async () => {
    const controller = new AbortController(); controller.abort();
    const transport = vi.fn<ObjectiveEvidenceTransport>();
    await expect(evaluateObjectiveEvidence({ ...input, signal: controller.signal }, { transport })).resolves.toMatchObject({ errorCode: 'request_aborted', objectives: [] });
    expect(transport).not.toHaveBeenCalled();
    const active = new AbortController();
    let finish!: (value: { modelId: string; content: string }) => void;
    transport.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const pending = evaluateObjectiveEvidence({ ...input, signal: active.signal }, { transport });
    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
    active.abort();
    await expect(pending).resolves.toMatchObject({ errorCode: 'request_aborted', objectives: [] });
    expect(transport.mock.calls[0][0].signal.aborted).toBe(true);
    finish({ modelId: MODEL, content: JSON.stringify(payload(input)) });
  });

  it('returns not assessed on the service deadline even when the transport never settles', async () => {
    vi.useFakeTimers();
    const transport = vi.fn<ObjectiveEvidenceTransport>(() => new Promise(() => {}));
    const pending = evaluateObjectiveEvidence(input, { transport });
    await vi.waitFor(() => expect(transport).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(LIMITS.timeoutMs);
    await expect(pending).resolves.toMatchObject({ status: 'not_assessed', errorCode: 'timeout', objectives: [] });
    expect(transport.mock.calls[0][0].signal.aborted).toBe(true);
  });
});

describe('objective evidence OpenRouter credential boundary', () => {
  const adapterRequest = (): ObjectiveEvidenceModelRequest => ({ modelId: MODEL, systemPrompt: 'Assessment rules', userContent: 'Learner evidence', responseSchema: { type: 'object' }, signal: new AbortController().signal });

  it('uses the default adapter, fixed model/endpoint, bounded tokens, and the key only in Authorization', async () => {
    const fetch = vi.fn().mockResolvedValue(providerResponse(JSON.stringify(payload(input))));
    vi.stubGlobal('fetch', fetch);
    const result = await evaluateObjectiveEvidence(input);
    expect(result.status).toBe('assessed');
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(options).toMatchObject({ redirect: 'error', credentials: 'omit', headers: { Authorization: `Bearer ${KEY}` } });
    expect(JSON.parse(options.body)).toMatchObject({ model: MODEL, max_tokens: LIMITS.maxTokens, stream: false, response_format: { type: 'json_schema', json_schema: { strict: true } } });
    expect(options.body).not.toContain(KEY);
    expect(JSON.stringify(result)).not.toContain(KEY);
    expect(credentialMocks.getModel).not.toHaveBeenCalled();
  });

  it('returns safe missing-key and HTTP errors without reading provider error bodies', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    credentialMocks.getKey.mockReturnValue(null);
    await expect(evaluateObjectiveEvidence(input)).resolves.toMatchObject({ errorCode: 'missing_key', objectives: [] });
    expect(fetch).not.toHaveBeenCalled();
    credentialMocks.getKey.mockReturnValue(KEY);
    const body = vi.fn();
    fetch.mockResolvedValue({ ok: false, status: 402, json: body, text: body });
    await expect(evaluateObjectiveEvidence(input)).resolves.toMatchObject({ errorCode: 'payment_required', objectives: [] });
    expect(body).not.toHaveBeenCalled();
  });

  it('bounds streamed response bytes and rejects incomplete/model-mismatched responses', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    fetch.mockResolvedValueOnce(new Response('x'.repeat(LIMITS.maxResponseBytes + 1)));
    await expect(requestObjectiveEvidenceWithOpenRouter(adapterRequest())).rejects.toMatchObject({ code: 'invalid_response' });
    fetch.mockResolvedValueOnce(providerResponse('{}', { model: 'other-model' }));
    await expect(requestObjectiveEvidenceWithOpenRouter(adapterRequest())).rejects.toMatchObject({ code: 'invalid_response' });
    fetch.mockResolvedValueOnce(providerResponse('{}', { choices: [{ finish_reason: 'length', message: { content: '{}' } }] }));
    await expect(requestObjectiveEvidenceWithOpenRouter(adapterRequest())).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('keeps its deadline active while a provider body stalls after successful headers', async () => {
    vi.useFakeTimers();
    const cancelled = vi.fn();
    const fetch = vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel: cancelled })));
    vi.stubGlobal('fetch', fetch);
    const pending = requestObjectiveEvidenceWithOpenRouter(adapterRequest());
    const assertion = expect(pending).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(LIMITS.timeoutMs);
    await assertion;
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(cancelled).toHaveBeenCalled();
  });
});
