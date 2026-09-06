// @vitest-environment jsdom
import React from 'react';
import { webcrypto } from 'node:crypto';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AiAssistantPanel from '../components/AiAssistantPanel';
import type { LearnerLevel } from '../constants';
import { finalizeCasePackageV1 } from '../core/casePackage';
import { composeLessonPrompt, finalizeLessonPlanV1, getLessonPlanRef } from '../core/lessonPlan';
import type { SessionEventV1 } from '../core/sessionEvents';
import { PREFERENCE_KEYS } from '../services/preferenceStore';
import { clearCaseTransition } from '../services/sessionRecorder';
import { makeEditableLessonCase } from './lessonBuilderTestFixture';
import * as caseRegistry from '../data/caseRegistry';
import * as lessonRegistry from '../data/lessonRegistry';

const mocks = vi.hoisted(() => ({
  requireCase: vi.fn(), requireLesson: vi.fn(), runTurn: vi.fn(),
}));
vi.mock('../services/introCacheStore', () => ({ loadIntroCache: async () => null }));
vi.mock('../services/byokStore', () => ({
  BYOK_CHANGED_EVENT: 'caseattend:byok-changed', hasKey: () => true,
  getModel: () => 'test/tutor', modelLabel: () => 'Test tutor',
}));
vi.mock('../components/ConnectKeyModal', () => ({ default: () => null }));

beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('fetch', vi.fn());
  localStorage.clear();
  mocks.requireCase.mockReset();
  mocks.requireLesson.mockReset();
  mocks.runTurn.mockReset().mockResolvedValue({
    promptSha256: 'a'.repeat(64), provider: 'openrouter', model: 'test/tutor', latencyMs: 1,
  });
});
afterEach(() => {
  cleanup(); clearCaseTransition(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

async function makeCase(levels: readonly LearnerLevel[], id = 'lesson-level-check') {
  const base = await makeEditableLessonCase(id);
  const { manifest: _lessonManifest, ...draft } = base.lessonPlan;
  const lessonPlan = await finalizeLessonPlanV1({ ...draft, learner: { ...draft.learner, levels } });
  const { manifest: _caseManifest, ...caseDraft } = base.casePackage;
  const casePackage = await finalizeCasePackageV1({ ...caseDraft, lessonPlanRef: getLessonPlanRef(lessonPlan) });
  return { ...base, casePackage, lessonPlan };
}

type TestCase = Awaited<ReturnType<typeof makeCase>>;
function propsFor(material: TestCase) {
  const captureCurrentView = vi.fn(() => ({
    image: 'data:image/jpeg;base64,/9j/2Q==', mimeType: 'image/jpeg' as const,
    width: 640, height: 480, capturePipelineVersion: 'caseattend-canvas-jpeg-v1' as const,
    slice: 1, total: 1, label: 'Synthetic image',
    viewSnapshot: {
      artifactKind: 'image' as const, seriesId: 'test-image', frameIndex: 0 as const, frameCount: 1 as const,
      assetSha256: material.assets[0].sha256,
      annotation: { present: false, measurementCount: 0, segmentedFrameCount: 0, activeFrameLabelCount: 0, revision: 0 },
    },
  }));
  return {
    captureCurrentView,
    teachingEngine: { runTurn: mocks.runTurn },
    studyMetadata: { studyId: material.casePackage.id, description: 'Synthetic exercise', modality: 'OT', domain: material.casePackage.domain },
    sessionContext: {
      casePackageRef: { id: material.casePackage.id, schemaVersion: material.casePackage.schemaVersion, sha256: material.casePackage.manifest.sha256 },
      lessonPlanRef: getLessonPlanRef(material.lessonPlan),
    },
  };
}

function register(material: TestCase) {
  bindRegistry();
  mocks.requireCase.mockResolvedValue(material.casePackage);
  mocks.requireLesson.mockResolvedValue(material.lessonPlan);
}

function bindRegistry() {
  vi.spyOn(caseRegistry, 'requireCasePackage').mockImplementation(mocks.requireCase);
  vi.spyOn(lessonRegistry, 'requireLessonPlanForCase').mockImplementation(mocks.requireLesson);
}

function levelSelect() { return screen.getByRole('combobox', { name: 'Your level' }) as HTMLSelectElement; }
function selectedOptions() { return Array.from(levelSelect().options, option => option.value); }
function sendQuestion() {
  fireEvent.change(screen.getByLabelText('Question for the AI tutor'), { target: { value: 'Help me describe the synthetic image.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send view and question' }));
}

it('reconciles an incompatible preference and prepares the first request at the lesson’s only supported level', async () => {
  const material = await makeCase(['undergrad']);
  register(material);
  localStorage.setItem(PREFERENCE_KEYS.learnerLevel, 'resident');
  const props = propsFor(material);
  render(<AiAssistantPanel {...props} />);
  await waitFor(() => expect(levelSelect().disabled).toBe(false));
  expect(selectedOptions()).toEqual(['undergrad']);
  expect(levelSelect().value).toBe('undergrad');
  await waitFor(() => expect(localStorage.getItem(PREFERENCE_KEYS.learnerLevel)).toBe('undergrad'));
  expect(mocks.runTurn).not.toHaveBeenCalled();
  expect(props.captureCurrentView).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();

  sendQuestion();
  await waitFor(() => expect(mocks.runTurn).toHaveBeenCalledTimes(1));
  expect(mocks.runTurn.mock.calls[0][2]).toBe('undergrad');
  await expect(composeLessonPrompt(material.lessonPlan, {
    learnerLevel: mocks.runTurn.mock.calls[0][2], mode: 'chat', hasImage: true,
    caseContext: material.casePackage,
  })).resolves.toHaveProperty('providerPrompt');
});

it('retains a compatible preference and changes among supported levels without capture or inference', async () => {
  const material = await makeCase(['highschool', 'resident']);
  register(material);
  localStorage.setItem(PREFERENCE_KEYS.learnerLevel, 'resident');
  const props = propsFor(material);
  render(<AiAssistantPanel {...props} />);
  await waitFor(() => expect(levelSelect().disabled).toBe(false));
  expect(selectedOptions()).toEqual(['highschool', 'resident']);
  expect(levelSelect().value).toBe('resident');
  fireEvent.change(levelSelect(), { target: { value: 'highschool' } });
  expect(levelSelect().value).toBe('highschool');
  expect(localStorage.getItem(PREFERENCE_KEYS.learnerLevel)).toBe('highschool');
  expect(mocks.runTurn).not.toHaveBeenCalled();
  expect(props.captureCurrentView).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it('keeps the send-time image and records the supported level when the lesson arrives after Send', async () => {
  const material = await makeCase(['undergrad']);
  register(material);
  let resolveLesson!: (plan: TestCase['lessonPlan']) => void;
  mocks.requireLesson.mockReturnValue(new Promise<TestCase['lessonPlan']>(resolve => { resolveLesson = resolve; }));
  localStorage.setItem(PREFERENCE_KEYS.learnerLevel, 'resident');
  const props = propsFor(material);
  const events: SessionEventV1[] = [];
  const store = { append: vi.fn(async (event: SessionEventV1) => { events.push(event); }) };
  render(<AiAssistantPanel {...props} sessionEventStore={store} />);
  expect(levelSelect().disabled).toBe(true);
  sendQuestion();
  expect(props.captureCurrentView).toHaveBeenCalledTimes(1);
  expect(mocks.runTurn).not.toHaveBeenCalled();
  await act(async () => resolveLesson(material.lessonPlan));
  await waitFor(() => expect(mocks.runTurn).toHaveBeenCalledTimes(1));
  expect(mocks.runTurn.mock.calls[0][2]).toBe('undergrad');
  expect(mocks.runTurn.mock.calls[0][3]).toBe('data:image/jpeg;base64,/9j/2Q==');
  expect(events.filter(event => event.event.type === 'learner_message_submitted').map(event => event.event)).toEqual([
    expect.objectContaining({ learnerLevel: 'undergrad', inputSource: 'typed' }),
  ]);
  expect(levelSelect().value).toBe('undergrad');
});

it('ignores an obsolete lesson result after switching to a differently restricted case', async () => {
  const first = await makeCase(['resident'], 'first-level-case');
  const second = await makeCase(['highschool'], 'second-level-case');
  bindRegistry();
  let resolveFirst!: (plan: TestCase['lessonPlan']) => void;
  const pending = new Promise<TestCase['lessonPlan']>(resolve => { resolveFirst = resolve; });
  mocks.requireCase.mockImplementation(async id => id === first.casePackage.id ? first.casePackage : second.casePackage);
  mocks.requireLesson.mockImplementation(casePackage => casePackage.id === first.casePackage.id ? pending : Promise.resolve(second.lessonPlan));
  const { rerender } = render(<AiAssistantPanel {...propsFor(first)} />);
  await waitFor(() => expect(mocks.requireLesson).toHaveBeenCalledWith(first.casePackage));
  rerender(<AiAssistantPanel {...propsFor(second)} />);
  await waitFor(() => expect(levelSelect().disabled).toBe(false));
  expect(selectedOptions()).toEqual(['highschool']);
  await act(async () => resolveFirst(first.lessonPlan));
  expect(selectedOptions()).toEqual(['highschool']);
  expect(levelSelect().value).toBe('highschool');
  expect(mocks.runTurn).not.toHaveBeenCalled();
});

it('retains the exact locked research level and leaves the ordinary preference unchanged', async () => {
  const material = await makeCase(['undergrad', 'resident']);
  bindRegistry();
  localStorage.setItem(PREFERENCE_KEYS.learnerLevel, 'highschool');
  const props = propsFor(material);
  const runtime = {
    casePackage: material.casePackage, lessonPlan: material.lessonPlan,
    expectedSystemPromptSha256: 'b'.repeat(64), historyWindowMessages: 4, requestTemplateVersion: '1.0' as const,
    openRouterPolicy: { model: 'test/locked', upstreamProviderId: 'test-provider', temperature: 0, topP: 1, maxTokens: 512,
      allowFallbacks: false as const, requireParameters: true as const, zeroDataRetention: true as const, dataCollection: 'deny' as const },
  };
  render(<AiAssistantPanel {...props} lockedTutor={{
    manifestSha256: 'c'.repeat(64), learnerLevel: 'resident', mode: 'chat', runtime,
    research: { recorder: { record: vi.fn().mockResolvedValue({}) }, caseStepId: 'step-one', inferenceConfigSha256: 'd'.repeat(64) },
  }} />);
  expect(screen.queryByRole('combobox', { name: 'Your level' })).toBeNull();
  expect(mocks.requireCase).not.toHaveBeenCalled();
  expect(mocks.requireLesson).not.toHaveBeenCalled();
  expect(mocks.runTurn).not.toHaveBeenCalled();
  sendQuestion();
  await waitFor(() => expect(mocks.runTurn).toHaveBeenCalledTimes(1));
  expect(mocks.runTurn.mock.calls[0][2]).toBe('resident');
  expect(mocks.runTurn.mock.calls[0][10]).toBe(runtime);
  expect(localStorage.getItem(PREFERENCE_KEYS.learnerLevel)).toBe('highschool');
});
