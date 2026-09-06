import React from 'react';
import { webcrypto } from 'node:crypto';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AiAssistantPanel from '../components/AiAssistantPanel';
import { finalizeCasePackageV1 } from '../core/casePackage';
import { finalizeLessonPlanV1, getLessonPlanRef, getLessonObjectivesForLevel } from '../core/lessonPlan';
import type { SessionEventV1 } from '../core/sessionEvents';
import type { ObjectiveEvidenceRequest, ObjectiveEvidenceResult } from '../services/objectiveEvidence';
import { PREFERENCE_KEYS } from '../services/preferenceStore';
import { clearCaseTransition } from '../services/sessionRecorder';
import { SESSION_DATA_DELETED_EVENT } from '../services/sessionStore';
import { makeEditableLessonCase } from './lessonBuilderTestFixture';
import * as caseRegistry from '../data/caseRegistry';
import * as lessonRegistry from '../data/lessonRegistry';

const mocks = vi.hoisted(() => ({ requireCase: vi.fn(), requireLesson: vi.fn(), runTurn: vi.fn(), loadIntroCache: vi.fn() }));
vi.mock('../services/introCacheStore', () => ({ loadIntroCache: mocks.loadIntroCache }));
vi.mock('../services/byokStore', () => ({
  BYOK_CHANGED_EVENT: 'caseattend:byok-changed', hasKey: () => true,
  getModel: () => 'test/tutor', modelLabel: () => 'Test tutor',
}));
vi.mock('../components/ConnectKeyModal', () => ({ default: () => null }));

beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('fetch', vi.fn());
  localStorage.clear();
  localStorage.setItem(PREFERENCE_KEYS.learnerLevel, 'undergrad');
  mocks.requireCase.mockReset(); mocks.requireLesson.mockReset();
  mocks.loadIntroCache.mockReset().mockResolvedValue({ levels: { undergrad: {
    introPrompt: 'PRIVATE CACHED INTRO', introQuestions: [{ id: 'secret', label: 'PRIVATE CACHED QUESTION', prompt: 'Cached prompt', cachedAnswer: 'PRIVATE CACHED ANSWER' }],
  } } });
  mocks.runTurn.mockReset().mockImplementation(async (...args) => {
    args[4]('What visible feature supports your observation?');
    return { promptSha256: 'a'.repeat(64), provider: 'openrouter', model: 'test/tutor', latencyMs: 1 };
  });
});
afterEach(() => { cleanup(); clearCaseTransition(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function makeCase(id = 'guided-software-exercise') {
  const base = await makeEditableLessonCase(id);
  const { manifest: _manifest, ...draft } = base.lessonPlan;
  const objectives = [
    { id: 'undergrad-observation', description: 'PRIVATE UNDERGRAD OBJECTIVE ANSWER', learnerLevels: ['undergrad' as const] },
    { id: 'step-two-reasoning', description: 'PRIVATE STEP TWO OBJECTIVE ANSWER', learnerLevels: ['ms_step2' as const] },
  ];
  const lessonPlan = await finalizeLessonPlanV1({
    ...draft, practiceMode: 'guided', learner: { ...draft.learner, levels: ['undergrad', 'ms_step2'] },
    socraticOpening: 'PRIVATE EDUCATOR OPENING', teachingNotes: ['PRIVATE EDUCATOR ANSWER KEY'], objectives,
    allowedHints: objectives.map(objective => ({ id: `hint-${objective.id}`, objectiveIds: [objective.id], text: 'PRIVATE AUTHORED HINT' })),
    rubric: { criteria: objectives.map(objective => ({ id: `criterion-${objective.id}`, objectiveIds: [objective.id],
      criterion: 'PRIVATE RUBRIC ANSWER', observableEvidence: ['PRIVATE EXPECTED EVIDENCE'] })) },
  });
  const { manifest: _caseManifest, ...caseDraft } = base.casePackage;
  const casePackage = await finalizeCasePackageV1({ ...caseDraft, teachingNotes: lessonPlan.teachingNotes, lessonPlanRef: getLessonPlanRef(lessonPlan) });
  return { ...base, casePackage, lessonPlan };
}
type Material = Awaited<ReturnType<typeof makeCase>>;

function bind(...materials: Material[]) {
  vi.spyOn(caseRegistry, 'requireCasePackage').mockImplementation(mocks.requireCase);
  vi.spyOn(lessonRegistry, 'requireLessonPlanForCase').mockImplementation(mocks.requireLesson);
  mocks.requireCase.mockImplementation(async id => materials.find(material => material.casePackage.id === id)!.casePackage);
  mocks.requireLesson.mockImplementation(async casePackage => materials.find(material => material.casePackage.id === casePackage.id)!.lessonPlan);
}
function propsFor(material: Material, evaluator = vi.fn(async (request: ObjectiveEvidenceRequest) => assessed(request))) {
  const events: SessionEventV1[] = [];
  return {
    events,
    props: {
      objectiveEvidenceEvaluator: evaluator,
      teachingEngine: { runTurn: mocks.runTurn },
      captureCurrentView: vi.fn(() => ({
        image: 'data:image/jpeg;base64,/9j/2Q==', mimeType: 'image/jpeg' as const, width: 640, height: 480,
        capturePipelineVersion: 'caseattend-canvas-jpeg-v1' as const, slice: 1, total: 1, label: 'Synthetic image',
        viewSnapshot: { artifactKind: 'image' as const, seriesId: 'test-image', frameIndex: 0 as const, frameCount: 1 as const,
          assetSha256: material.assets[0].sha256,
          annotation: { present: false, measurementCount: 0, segmentedFrameCount: 0, activeFrameLabelCount: 0, revision: 0 } },
      })),
      studyMetadata: { studyId: material.casePackage.id, description: 'Synthetic exercise', modality: 'OT', domain: material.casePackage.domain },
      sessionContext: {
        casePackageRef: { id: material.casePackage.id, schemaVersion: material.casePackage.schemaVersion, sha256: material.casePackage.manifest.sha256 },
        lessonPlanRef: getLessonPlanRef(material.lessonPlan),
      },
      sessionEventStore: { append: vi.fn(async (event: SessionEventV1) => { events.push(event); }) },
    },
  };
}
function assessed(request: ObjectiveEvidenceRequest, status: 'observed' | 'partial' | 'not_observed' | 'needs_review' = 'observed'): ObjectiveEvidenceResult {
  return {
    status: 'assessed', sessionId: request.sessionId, turnId: request.turnId,
    caseRef: { id: request.casePackage.id, schemaVersion: request.casePackage.schemaVersion, sha256: request.casePackage.manifest.sha256 },
    lessonRef: getLessonPlanRef(request.lessonPlan), learnerLevel: request.learnerLevel, assistance: request.assistance,
    modelId: 'test/evaluator', objectives: getLessonObjectivesForLevel(request.lessonPlan, request.learnerLevel).map(objective => ({
      objectiveId: objective.id, status, quote: request.learnerText, reason: 'PRIVATE EVALUATOR REASON',
    })),
  };
}
async function ready() { await screen.findByRole('button', { name: 'Send view and attempt' }); }
async function optIntoEvidence() {
  await ready();
  const checkbox = screen.getByRole('checkbox', { name: 'Check objective evidence' }) as HTMLInputElement;
  expect(checkbox.checked).toBe(false);
  fireEvent.click(checkbox);
  expect(checkbox.checked).toBe(true);
}
function send(text = 'I notice a straight border in the synthetic image.') {
  fireEvent.change(screen.getByLabelText('Question for the AI tutor'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Send view and attempt' }));
}
function evidence() { return within(screen.getByRole('complementary', { name: 'Objective evidence' })); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

it('opens with a neutral question and no hidden answers or automatic model calls', async () => {
  const material = await makeCase(); bind(material);
  const { props } = propsFor(material);
  render(<AiAssistantPanel {...props} />); await ready();
  expect((screen.getByRole('checkbox', { name: 'Check objective evidence' }) as HTMLInputElement).checked).toBe(false);
  expect(screen.getByText('What do you notice in the image? Describe one visible feature and explain what supports it.')).toBeTruthy();
  expect(screen.queryByText(/PRIVATE/)).toBeNull();
  expect(mocks.loadIntroCache).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: /Show pre-cached/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Unassisted this visit' }));
  expect(props.objectiveEvidenceEvaluator).not.toHaveBeenCalled();
  expect(mocks.runTurn).not.toHaveBeenCalled();
  expect(props.captureCurrentView).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it('keeps an early Send capture and learner message while requiring opt-in after the guided lesson resolves', async () => {
  const material = await makeCase(); bind(material);
  const pendingLesson = deferred<Material['lessonPlan']>();
  mocks.requireLesson.mockReturnValue(pendingLesson.promise);
  localStorage.setItem(PREFERENCE_KEYS.learnerLevel, 'resident');
  const { props, events } = propsFor(material);
  render(<AiAssistantPanel {...props} />);
  await waitFor(() => expect(mocks.requireLesson).toHaveBeenCalled());
  const text = 'My observation was submitted before the lesson finished loading.';
  fireEvent.change(screen.getByLabelText('Question for the AI tutor'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Send view and question' }));
  expect(props.captureCurrentView).toHaveBeenCalledTimes(1);
  expect(props.objectiveEvidenceEvaluator).not.toHaveBeenCalled();
  expect(mocks.runTurn).not.toHaveBeenCalled();
  await act(async () => pendingLesson.resolve(material.lessonPlan));
  await waitFor(() => expect(mocks.runTurn).toHaveBeenCalledTimes(1));
  expect(props.objectiveEvidenceEvaluator).not.toHaveBeenCalled();
  expect(mocks.runTurn.mock.calls[0][2]).toBe('undergrad');
  expect(props.captureCurrentView).toHaveBeenCalledTimes(1);
  expect(within(screen.getByRole('log', { name: 'AI tutor conversation' })).getByText(text)).toBeTruthy();
  expect(events.find(event => event.event.type === 'learner_message_submitted')?.event).toMatchObject({ learnerLevel: 'undergrad' });
  expect(evidence().getByText('Not assessed')).toBeTruthy();
  await waitFor(() => expect((screen.getByLabelText('Question for the AI tutor') as HTMLInputElement).disabled).toBe(false));
  await optIntoEvidence();
  send('A second observation after opting into the paid check.');
  await waitFor(() => expect(props.objectiveEvidenceEvaluator).toHaveBeenCalledTimes(1));
  expect(props.objectiveEvidenceEvaluator.mock.calls[0][0]).toMatchObject({ learnerLevel: 'undergrad', assistance: 'explanation' });
});

it('evaluates an immutable pre-feedback attempt while coaching streams, then credits only that exact session and level', async () => {
  const material = await makeCase(); bind(material);
  const pending = deferred<ObjectiveEvidenceResult>();
  const evaluator = vi.fn((_request: ObjectiveEvidenceRequest) => pending.promise);
  const { props, events } = propsFor(material, evaluator);
  render(<AiAssistantPanel {...props} />); await optIntoEvidence(); send();
  await waitFor(() => expect(evaluator).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(mocks.runTurn).toHaveBeenCalledTimes(1));
  expect(screen.getByText('What visible feature supports your observation?')).toBeTruthy();
  const request = evaluator.mock.calls[0][0];
  expect(request.assistance).toBe('none');
  expect(request.priorTutorText).toBe('');
  expect(request.learnerLevel).toBe('undergrad');
  expect(request.casePackage.manifest.sha256).toBe(material.casePackage.manifest.sha256);
  expect(evidence().getByText('Checking your submitted attempt…')).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Send view and attempt' }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => pending.resolve(assessed(request)));
  await waitFor(() => expect(evidence().getByText('Evidence observed')).toBeTruthy());
  expect(evidence().getByText('Turn 1 · Before help in this visit')).toBeTruthy();
  expect(evidence().getByText(`“${request.learnerText}”`)).toBeTruthy();
  expect(screen.queryByText(/PRIVATE/)).toBeNull();
  await waitFor(() => expect(events.some(event => event.event.type === 'lesson_completed')).toBe(true));
  const recorded = events.find(event => event.event.type === 'objective_evidence_recorded')!;
  expect(recorded.sessionId).toBe(request.sessionId);
  expect(recorded.event).toEqual({ type: 'objective_evidence_recorded', turnId: request.turnId, objectiveId: 'undergrad-observation', source: 'learner_turn' });
  expect(JSON.stringify(events)).not.toContain(request.learnerText);
  expect(JSON.stringify(events)).not.toContain('PRIVATE');
  expect(events.find(event => event.event.type === 'lesson_completed')?.event).toMatchObject({ objectivesMet: 1, reason: 'objectives_met' });
});

it('requests one explicit allowed hint, preserves a draft, and keeps later practice marked as assisted', async () => {
  const material = await makeCase(); bind(material);
  const { props, events } = propsFor(material);
  render(<AiAssistantPanel {...props} />); await optIntoEvidence();
  fireEvent.change(screen.getByLabelText('Question for the AI tutor'), { target: { value: 'My unfinished observation' } });
  fireEvent.click(screen.getByRole('button', { name: 'Get a hint' }));
  await waitFor(() => expect(mocks.runTurn).toHaveBeenCalledTimes(1));
  await waitFor(() => expect((screen.getByLabelText('Question for the AI tutor') as HTMLInputElement).disabled).toBe(false));
  expect(props.objectiveEvidenceEvaluator).not.toHaveBeenCalled();
  expect((screen.getByLabelText('Question for the AI tutor') as HTMLInputElement).value).toBe('My unfinished observation');
  expect(mocks.runTurn.mock.calls[0][11]).toContain('Use only allowed hint hint-undergrad-observation');
  expect(mocks.runTurn.mock.calls[0][11]).not.toContain('hint-step-two-reasoning');
  expect(screen.getByRole('button', { name: 'All hints used' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Practice without a new hint' }));
  expect(mocks.runTurn).toHaveBeenCalledTimes(1);
  send('My own observation after the hint.');
  await waitFor(() => expect(props.objectiveEvidenceEvaluator).toHaveBeenCalledTimes(1));
  expect(props.objectiveEvidenceEvaluator.mock.calls[0][0].assistance).toBe('hint');
  await waitFor(() => expect(evidence().getByText('Evidence observed')).toBeTruthy());
  expect(evidence().getByText('Turn 2 · After a hint')).toBeTruthy();
  await waitFor(() => expect(events.some(event => event.event.type === 'lesson_completed')).toBe(true));
  expect(events.some(event => event.event.type === 'objective_evidence_recorded')).toBe(true);
  expect(evidence().getByText(/Practice complete for this level/)).toBeTruthy();
});

it.each(['clear', 'cancel', 'delete', 'unmount'] as const)('aborts and discards a late assessment on %s', async action => {
  const material = await makeCase(); bind(material);
  const pending = deferred<ObjectiveEvidenceResult>();
  const evaluator = vi.fn((_request: ObjectiveEvidenceRequest) => pending.promise);
  const { props, events } = propsFor(material, evaluator);
  const view = render(<AiAssistantPanel {...props} />); await optIntoEvidence(); send();
  await waitFor(() => expect(evaluator).toHaveBeenCalledTimes(1));
  const request = evaluator.mock.calls[0][0];
  if (action === 'clear') fireEvent.click(screen.getByRole('button', { name: 'Clear chat and start a new conversation' }));
  if (action === 'cancel') fireEvent.click(screen.getByRole('button', { name: 'Cancel AI response' }));
  if (action === 'delete') act(() => window.dispatchEvent(new CustomEvent(SESSION_DATA_DELETED_EVENT, { detail: { all: true } })));
  if (action === 'unmount') view.unmount();
  if (action === 'clear' || action === 'delete') {
    expect((screen.getByRole('checkbox', { name: 'Check objective evidence' }) as HTMLInputElement).checked).toBe(false);
  }
  expect(request.signal?.aborted).toBe(true);
  await act(async () => pending.resolve(assessed(request)));
  expect(events.some(event => event.event.type === 'objective_evidence_recorded')).toBe(false);
  expect(screen.queryByText('Evidence observed')).toBeNull();
});

it('resets evidence on level change while preserving prior help and uses a fresh recording session without automatic inference', async () => {
  const material = await makeCase(); bind(material);
  const { props } = propsFor(material);
  render(<AiAssistantPanel {...props} />); await optIntoEvidence(); send();
  await waitFor(() => expect(evidence().getByText('Evidence observed')).toBeTruthy());
  await waitFor(() => expect((screen.getByRole('combobox', { name: 'Your level' }) as HTMLSelectElement).disabled).toBe(false));
  const previous = props.objectiveEvidenceEvaluator.mock.calls[0][0];
  fireEvent.change(screen.getByRole('combobox', { name: 'Your level' }), { target: { value: 'ms_step2' } });
  expect(screen.queryByText('Evidence observed')).toBeNull();
  expect(props.objectiveEvidenceEvaluator).toHaveBeenCalledTimes(1);
  expect(mocks.runTurn).toHaveBeenCalledTimes(1);
  await optIntoEvidence();
  send('A fresh Step 2 observation.');
  await waitFor(() => expect(props.objectiveEvidenceEvaluator).toHaveBeenCalledTimes(2));
  const next = props.objectiveEvidenceEvaluator.mock.calls[1][0];
  expect(next.learnerLevel).toBe('ms_step2');
  expect(next.assistance).toBe('explanation');
  expect(next.priorTutorText).toBe('');
  expect(next.sessionId).not.toBe(previous.sessionId);
});

it('clears evidence on restart but does not relabel previously coached same-case work as unassisted', async () => {
  const material = await makeCase(); bind(material);
  const { props, events } = propsFor(material);
  render(<AiAssistantPanel {...props} />); await optIntoEvidence(); send();
  await waitFor(() => expect(evidence().getByText('Evidence observed')).toBeTruthy());
  await waitFor(() => expect((screen.getByLabelText('Question for the AI tutor') as HTMLInputElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Clear chat and start a new conversation' }));
  expect(screen.queryByText('Evidence observed')).toBeNull();
  expect(screen.getByRole('button', { name: 'Practice without a new hint' })).toBeTruthy();
  await optIntoEvidence();
  send('A new response after restarting the same case.');
  await waitFor(() => expect(props.objectiveEvidenceEvaluator).toHaveBeenCalledTimes(2));
  const request = props.objectiveEvidenceEvaluator.mock.calls[1][0];
  expect(request.assistance).toBe('explanation');
  expect(request.priorTutorText).toBe('');
  await waitFor(() => expect(evidence().getByText('Turn 1 · After tutor feedback')).toBeTruthy());
  expect(events.filter(event => event.sessionId === request.sessionId).some(event => event.event.type === 'objective_evidence_recorded')).toBe(true);
});

it('retains hint exposure after Clear while binding the new attempt to the restarted session', async () => {
  const material = await makeCase(); bind(material);
  const { props } = propsFor(material);
  render(<AiAssistantPanel {...props} />); await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Get a hint' }));
  await waitFor(() => expect(mocks.runTurn).toHaveBeenCalledTimes(1));
  await waitFor(() => expect((screen.getByLabelText('Question for the AI tutor') as HTMLInputElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Clear chat and start a new conversation' }));
  expect(screen.getByRole('button', { name: 'Practice without a new hint' })).toBeTruthy();
  await optIntoEvidence();
  send('My response after seeing a hint in the previous conversation.');
  await waitFor(() => expect(props.objectiveEvidenceEvaluator).toHaveBeenCalledTimes(1));
  expect(props.objectiveEvidenceEvaluator.mock.calls[0][0].assistance).toBe('hint');
  await waitFor(() => expect(evidence().getByText('Turn 1 · After a hint')).toBeTruthy());
});

it('ignores an assessment from the previous case after a case switch', async () => {
  const first = await makeCase('first-guided-case'); const second = await makeCase('second-guided-case'); bind(first, second);
  const pending = deferred<ObjectiveEvidenceResult>();
  const evaluator = vi.fn((_request: ObjectiveEvidenceRequest) => pending.promise);
  const firstView = propsFor(first, evaluator); const secondView = propsFor(second, evaluator);
  const view = render(<AiAssistantPanel {...firstView.props} />); await optIntoEvidence(); send();
  await waitFor(() => expect(evaluator).toHaveBeenCalledTimes(1));
  const request = evaluator.mock.calls[0][0];
  view.rerender(<AiAssistantPanel {...secondView.props} />); await ready();
  expect(request.signal?.aborted).toBe(true);
  await act(async () => pending.resolve(assessed(request)));
  expect(screen.queryByText('Evidence observed')).toBeNull();
  expect(secondView.events.some(event => event.event.type === 'objective_evidence_recorded')).toBe(false);
});

it('marks mismatched attribution as not assessed and never renders evaluator reasons', async () => {
  const material = await makeCase(); bind(material);
  const evaluator = vi.fn(async (request: ObjectiveEvidenceRequest) => ({ ...assessed(request), turnId: crypto.randomUUID() }));
  const { props, events } = propsFor(material, evaluator);
  render(<AiAssistantPanel {...props} />); await optIntoEvidence(); send();
  await waitFor(() => expect(evidence().getByText('Not assessed')).toBeTruthy());
  expect(evidence().getByText('This attempt could not be assessed. No new evidence was credited.')).toBeTruthy();
  expect(screen.queryByText(/PRIVATE/)).toBeNull();
  expect(events.some(event => event.event.type === 'objective_evidence_recorded')).toBe(false);
});

it('defaults paid checks off and supports explicit opt-in and opt-out without blocking coaching', async () => {
  const material = await makeCase(); bind(material);
  const { props, events } = propsFor(material);
  render(<AiAssistantPanel {...props} />); await ready();
  expect(screen.getByText(/Uses a separate paid model/)).toBeTruthy();
  const checkbox = screen.getByRole('checkbox', { name: 'Check objective evidence' }) as HTMLInputElement;
  expect(checkbox.checked).toBe(false);
  fireEvent.click(checkbox);
  expect(checkbox.checked).toBe(true);
  fireEvent.click(checkbox);
  expect(checkbox.checked).toBe(false);
  expect(props.objectiveEvidenceEvaluator).not.toHaveBeenCalled();
  send();
  await waitFor(() => expect(mocks.runTurn).toHaveBeenCalledTimes(1));
  expect(props.objectiveEvidenceEvaluator).not.toHaveBeenCalled();
  expect(evidence().getByText('Not assessed')).toBeTruthy();
  expect(evidence().getByText('Checks are off. New attempts are not assessed; coaching continues.')).toBeTruthy();
  expect(evidence().queryByText('This attempt could not be assessed. No new evidence was credited.')).toBeNull();
  expect(events.some(event => event.event.type === 'objective_evidence_recorded')).toBe(false);
  expect(screen.getByText('What visible feature supports your observation?')).toBeTruthy();
});

it.each(['checks off', 'evaluation unavailable'] as const)('retains prior observed evidence and its original attribution when a later attempt has %s', async outcome => {
  const material = await makeCase(); bind(material);
  const evaluator = vi.fn(async (request: ObjectiveEvidenceRequest): Promise<ObjectiveEvidenceResult> => assessed(request));
  const { props, events } = propsFor(material, evaluator);
  const firstText = 'My first observation provides evidence for this objective.';
  render(<AiAssistantPanel {...props} />); await optIntoEvidence(); send(firstText);
  await waitFor(() => expect(evidence().getByText('Evidence observed')).toBeTruthy());
  await waitFor(() => expect((screen.getByRole('checkbox', { name: 'Check objective evidence' }) as HTMLInputElement).disabled).toBe(false));
  const firstRequest = evaluator.mock.calls[0][0];
  if (outcome === 'checks off') fireEvent.click(screen.getByRole('checkbox', { name: 'Check objective evidence' }));
  else evaluator.mockRejectedValueOnce(new Error('PRIVATE unavailable evaluator detail'));

  send('A later attempt that is not assessed.');
  await waitFor(() => expect(mocks.runTurn).toHaveBeenCalledTimes(2));
  await waitFor(() => expect((screen.getByRole('checkbox', { name: 'Check objective evidence' }) as HTMLInputElement).disabled).toBe(false));
  expect(evaluator).toHaveBeenCalledTimes(outcome === 'checks off' ? 1 : 2);
  expect(evidence().getByText('Evidence observed')).toBeTruthy();
  expect(evidence().getByText(`“${firstText}”`)).toBeTruthy();
  expect(evidence().getByText('Turn 1 · Before help in this visit')).toBeTruthy();
  expect(evidence().getByText(/Practice complete for this level/)).toBeTruthy();
  const recordedEvidence = events.filter(event => event.event.type === 'objective_evidence_recorded');
  expect(recordedEvidence).toHaveLength(1);
  expect(recordedEvidence[0].event).toMatchObject({ turnId: firstRequest.turnId });
  if (outcome === 'checks off') {
    expect(evidence().getByText('Checks are off. New attempts are not assessed; coaching continues.')).toBeTruthy();
    expect(evidence().queryByText('This attempt could not be assessed. No new evidence was credited.')).toBeNull();
  } else expect(evidence().getByText('This attempt could not be assessed. No new evidence was credited.')).toBeTruthy();
  expect(screen.queryByText(/PRIVATE/)).toBeNull();
});

it('retains cumulative observed evidence and its original attribution after a valid partial response', async () => {
  const material = await makeCase(); bind(material);
  const evaluator = vi.fn(async (request: ObjectiveEvidenceRequest): Promise<ObjectiveEvidenceResult> => assessed(request));
  const { props, events } = propsFor(material, evaluator);
  const firstText = 'My earlier observation provides evidence for this objective.';
  render(<AiAssistantPanel {...props} />); await optIntoEvidence(); send(firstText);
  await waitFor(() => expect(evidence().getByText('Evidence observed')).toBeTruthy());
  await waitFor(() => expect((screen.getByRole('checkbox', { name: 'Check objective evidence' }) as HTMLInputElement).disabled).toBe(false));
  const firstRequest = evaluator.mock.calls[0][0];
  evaluator.mockImplementationOnce(async request => assessed(request, 'partial'));
  const laterText = 'My later response provides only partial evidence.';
  send(laterText);
  await waitFor(() => expect(evaluator).toHaveBeenCalledTimes(2));
  await waitFor(() => expect((screen.getByRole('checkbox', { name: 'Check objective evidence' }) as HTMLInputElement).disabled).toBe(false));
  expect(evaluator.mock.calls[1][0].assistance).toBe('explanation');
  expect(evidence().getByText('Evidence observed')).toBeTruthy();
  expect(evidence().getByText(`“${firstText}”`)).toBeTruthy();
  expect(evidence().queryByText(`“${laterText}”`)).toBeNull();
  expect(evidence().getByText('Turn 1 · Before help in this visit')).toBeTruthy();
  expect(evidence().getByText(/Practice complete for this level/)).toBeTruthy();
  expect(evidence().queryByText('This attempt could not be assessed. No new evidence was credited.')).toBeNull();
  const recordedEvidence = events.filter(event => event.event.type === 'objective_evidence_recorded');
  expect(recordedEvidence).toHaveLength(1);
  expect(recordedEvidence[0].event).toMatchObject({ turnId: firstRequest.turnId });
});

it('keeps coaching available when evaluation fails and hides unsafe provider error details', async () => {
  const material = await makeCase(); bind(material);
  const evaluator = vi.fn(async (_request: ObjectiveEvidenceRequest): Promise<ObjectiveEvidenceResult> => {
    throw new Error('PRIVATE provider response containing credential-like data');
  });
  const { props, events } = propsFor(material, evaluator);
  render(<AiAssistantPanel {...props} />); await optIntoEvidence(); send();
  await waitFor(() => expect(evidence().getByText('Not assessed')).toBeTruthy());
  await waitFor(() => expect(mocks.runTurn).toHaveBeenCalledTimes(1));
  expect(screen.queryByText(/PRIVATE/)).toBeNull();
  expect(events.some(event => event.event.type === 'objective_evidence_recorded')).toBe(false);
});

it('does not assess an unbound embed without an exact ordinary session context', async () => {
  const material = await makeCase(); bind(material);
  const { props } = propsFor(material);
  const { sessionContext: _sessionContext, ...unbound } = props;
  render(<AiAssistantPanel {...unbound} />); await optIntoEvidence(); send();
  await waitFor(() => expect(mocks.runTurn).toHaveBeenCalledTimes(1));
  expect(props.objectiveEvidenceEvaluator).not.toHaveBeenCalled();
  expect(evidence().getByText('Not assessed')).toBeTruthy();
});

it('never activates guided UI or the secondary evaluator in a frozen research session', async () => {
  const material = await makeCase(); bind(material);
  const { props, events } = propsFor(material);
  const runtime = {
    casePackage: material.casePackage, lessonPlan: material.lessonPlan,
    expectedSystemPromptSha256: 'b'.repeat(64), historyWindowMessages: 4, requestTemplateVersion: '1.0' as const,
    openRouterPolicy: { model: 'test/locked', upstreamProviderId: 'test-provider', temperature: 0, topP: 1, maxTokens: 512,
      allowFallbacks: false as const, requireParameters: true as const, zeroDataRetention: true as const, dataCollection: 'deny' as const },
  };
  render(<AiAssistantPanel {...props} lockedTutor={{ manifestSha256: 'c'.repeat(64), learnerLevel: 'undergrad', mode: 'chat', runtime,
    research: { recorder: { record: vi.fn().mockResolvedValue({}) }, caseStepId: 'frozen-step', inferenceConfigSha256: 'd'.repeat(64) } }} />);
  expect(screen.queryByRole('complementary', { name: 'Objective evidence' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Get a hint' })).toBeNull();
  fireEvent.change(screen.getByLabelText('Question for the AI tutor'), { target: { value: 'A frozen research response.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send view and question' }));
  await waitFor(() => expect(mocks.runTurn).toHaveBeenCalledTimes(1));
  expect(props.objectiveEvidenceEvaluator).not.toHaveBeenCalled();
  expect(mocks.runTurn.mock.calls[0][10]).toBe(runtime);
  expect(mocks.runTurn.mock.calls[0][11]).toBe('');
  expect(events).toEqual([]);
});
