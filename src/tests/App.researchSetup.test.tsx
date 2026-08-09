// @vitest-environment jsdom

import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';

const mocks = vi.hoisted(() => {
  const frozen = {
    id: 'visual-reasoning-pilot',
    version: '1.0.0',
    sha256: 'a'.repeat(64),
    frozenAt: '2026-08-09T18:00:00.000Z',
    draft: {},
    bundle: {},
    launchErrors: [],
  };
  const releaseAssets = vi.fn();
  const recorder = {
    end: vi.fn(async () => null),
    abandon: vi.fn(),
    record: vi.fn(async () => ({})),
  };
  const casePackage = {
    id: 'research-case',
    schemaVersion: '1.0',
    manifest: { sha256: 'd'.repeat(64) },
    lessonPlanRef: { id: 'research-lesson', version: '1.0.0', sha256: 'e'.repeat(64) },
    artifactHints: {
      showWindowLevel: true, showSeriesSelector: true, showSegmentation: true,
    },
    neutralDescription: 'Answer-neutral teaching image.',
    teachingNotes: ['Answer-revealing note.'],
    domain: 'dermatology',
  };
  const lessonPlan = { manifest: { sha256: 'e'.repeat(64) } };
  const session = {
    participantReference: 'b'.repeat(64),
    armId: 'question-first',
    recorder,
    bundle: {
      researchManifest: {
        tasks: { pre: [], post: [] },
        manifest: { sha256: 'a'.repeat(64) },
      },
    },
    arm: {
      viewerPolicy: {
        version: '1.0', allowSeriesSwitch: false, allowFrameNavigation: false,
        allowWindowLevel: false, allowPanZoom: false, allowAnnotations: false,
        allowSegmentation: false,
      },
      capturePolicy: { includeVisibleAnnotations: false },
      inferencePolicy: {
        requestedModelId: 'locked/model-v1',
        provider: { only: ['locked-provider'] },
        temperature: 0.2,
        topP: 0.9,
        maxTokens: 512,
        historyWindowMessages: 4,
      },
    },
    step: {
      id: 'case-step-1',
      learnerLevel: 'undergrad',
      mode: 'chat',
      systemPromptSha256: 'f'.repeat(64),
      requestTemplateVersion: '1.0',
    },
    inferenceConfigSha256: 'c'.repeat(64),
    portableCase: {
      casePackage,
      lessonPlan,
    },
    series: [],
    releaseAssets,
  };
  const storage = {
    mode: 'indexeddb' as const,
    persistent: true as const,
    launchAllowed: true as const,
    message: 'Research data is stored only in this browser.' as const,
  };
  return {
    frozen,
    releaseAssets,
    recorder,
    session,
    storage,
    controller: {
      getStorageStatus: vi.fn(() => storage),
      subscribeStorageStatus: vi.fn(() => () => undefined),
      initialize: vi.fn(async () => storage),
      listMaterials: vi.fn(async () => [{ key: 'material-1', title: 'Material 1' }]),
      saveDraft: vi.fn(async () => undefined),
      exportSupportPacket: vi.fn(async () => undefined),
      freeze: vi.fn(async () => frozen),
      createParticipantLaunchConfig: vi.fn(() => ({ studyTitle: 'Visual reasoning pilot' })),
      startParticipant: vi.fn(async () => session),
    },
    aiProps: vi.fn(),
    viewerProps: vi.fn(),
    toolbarProps: vi.fn(),
    hasKey: vi.fn(() => true),
    browserTeachingEngine: { runTurn: vi.fn() },
  };
});

vi.mock('../services/researchSetupController', () => ({
  researchSetupController: mocks.controller,
}));

vi.mock('../services/caseStudioController', () => ({
  createCaseStudioController: () => ({
    processFiles: vi.fn(), scanAssets: vi.fn(), saveCase: vi.fn(), importCase: vi.fn(),
    exportCase: vi.fn(), loadStoredLesson: vi.fn(), saveUpdatedBundle: vi.fn(),
    resolveAssetUri: vi.fn(), releaseAsset: vi.fn(), getStorageStatus: vi.fn(),
    subscribeStorageStatus: vi.fn(), deleteCase: vi.fn(),
  }),
}));

vi.mock('../services/openrouterAuth', () => ({
  completeOpenRouterOAuth: vi.fn(),
  pendingOAuthCode: () => null,
}));
vi.mock('../services/byokStore', () => ({
  BYOK_CHANGED_EVENT: 'caseattend:byok-changed',
  hasKey: mocks.hasKey,
}));
vi.mock('../services/browserTeachingEngine', () => ({
  browserTeachingEngine: mocks.browserTeachingEngine,
}));
vi.mock('../services/dicomService', () => ({ fetchDicomWebSeries: vi.fn() }));
vi.mock('../data/caseRegistry', () => ({ primaryCaseModality: () => 'XC' }));

vi.mock('../components/StudyList', () => ({
  default: ({ onOpenResearchSetup }: { onOpenResearchSetup: () => void }) => (
    <main aria-label="Case catalog">
      <button type="button" onClick={onOpenResearchSetup}>Set up a research study</button>
    </main>
  ),
}));

vi.mock('../components/ResearchSetupWizard/ResearchSetupWizard', () => ({
  default: ({
    onFreeze,
    onLaunchParticipant,
  }: {
    onFreeze: (draft: unknown) => Promise<typeof mocks.frozen>;
    onLaunchParticipant: (frozen: typeof mocks.frozen) => void;
  }) => (
    <main>
      <h1>Research Setup test surface</h1>
      <button type="button" onClick={() => { void onFreeze({}).then(onLaunchParticipant); }}>Freeze and launch</button>
    </main>
  ),
}));

vi.mock('../components/ParticipantMode/ParticipantMode', () => ({
  default: ({
    onStart,
    onExit,
    renderActivity,
    inferenceReady,
  }: {
    onStart: (code: string) => Promise<{ participantReference: string; armId: string }>;
    onExit: () => void | Promise<void>;
    inferenceReady: boolean;
    renderActivity?: (context: { participantReference: string; config: unknown; arm: { id: string; label: string } }) => React.ReactNode;
  }) => {
    const [started, setStarted] = useState('');
    return (
      <main>
        <h1>Participant Mode test surface</h1>
        <button type="button" disabled={!inferenceReady} onClick={() => { void onStart('0123456789ABCDEFGHJK').then((result) => setStarted(result.armId)); }}>Start participant</button>
        <button type="button" onClick={() => { void onExit(); }}>Exit study</button>
        <output aria-label="Assigned arm">{started}</output>
        {started && renderActivity?.({
          participantReference: 'b'.repeat(64),
          config: {},
          arm: { id: started, label: 'Question first' },
        })}
      </main>
    );
  },
}));

vi.mock('../components/LessonBuilder', () => ({ default: () => null }));
vi.mock('../components/CaseStudio/CaseStudio', () => ({ default: () => null }));
vi.mock('../components/ViewerCanvas', () => ({ default: (props: unknown) => { mocks.viewerProps(props); return null; } }));
vi.mock('../components/SeriesSelector', () => ({ default: () => null }));
vi.mock('../components/AiAssistantPanel', () => ({ default: (props: unknown) => { mocks.aiProps(props); return null; } }));
vi.mock('../components/FloatingToolbar', () => ({ default: (props: unknown) => { mocks.toolbarProps(props); return null; } }));
vi.mock('../components/GuidedTour', () => ({ default: () => null }));
vi.mock('../components/MeasurementPanel', () => ({ default: () => null }));
vi.mock('../components/SegmentationPanel', () => ({ default: () => null }));
vi.mock('../components/SessionDataPanel', () => ({ default: () => null }));
vi.mock('../components/SafetyModal', () => ({ default: () => null }));

describe('App Research Setup integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasKey.mockReturnValue(true);
    localStorage.clear();
    localStorage.setItem('caseattend.guidedTour.completed', 'true');
  });

  afterEach(() => cleanup());

  it('routes freeze into Participant Mode, retains the exact session, and safely exits it', async () => {
    const { container } = render(<App />);
    expect(mocks.controller.listMaterials).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Set up a research study' }));
    await waitFor(() => expect(mocks.controller.listMaterials).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('heading', { name: 'Research Setup test surface' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Freeze and launch' }));
    expect(await screen.findByRole('heading', { name: 'Participant Mode test surface' })).toBeTruthy();
    expect(container.firstElementChild?.className).toContain('overflow-y-auto');
    expect(mocks.controller.createParticipantLaunchConfig).toHaveBeenCalledWith(mocks.frozen);

    fireEvent.click(screen.getByRole('button', { name: 'Start participant' }));
    await waitFor(() => expect(screen.getByRole('status', { name: 'Assigned arm' }).textContent).toBe('question-first'));
    expect(mocks.controller.startParticipant).toHaveBeenCalledWith(
      mocks.frozen,
      '0123456789ABCDEFGHJK',
    );
    await waitFor(() => expect(mocks.aiProps).toHaveBeenCalled());
    expect(mocks.aiProps.mock.lastCall?.[0]).toMatchObject({
      teachingEngine: mocks.browserTeachingEngine,
      lockedTutor: {
        manifestSha256: 'a'.repeat(64),
        learnerLevel: 'undergrad',
        mode: 'chat',
        runtime: {
          expectedSystemPromptSha256: 'f'.repeat(64),
          historyWindowMessages: 4,
          openRouterPolicy: {
            model: 'locked/model-v1',
            upstreamProviderId: 'locked-provider',
            allowFallbacks: false,
            requireParameters: true,
            zeroDataRetention: true,
            dataCollection: 'deny',
          },
        },
        research: {
          caseStepId: 'case-step-1',
          inferenceConfigSha256: 'c'.repeat(64),
        },
      },
    });
    expect(mocks.viewerProps.mock.lastCall?.[0]).toMatchObject({
      interactionPolicy: expect.objectContaining({
        allowFrameNavigation: false,
        allowPanZoom: false,
        allowAnnotations: false,
      }),
      includeAnnotationsInCapture: false,
    });
    expect(mocks.toolbarProps.mock.lastCall?.[0]).toMatchObject({
      interactionPolicy: expect.objectContaining({ allowAnnotations: false }),
      artifactHints: {
        showWindowLevel: false,
        showSeriesSelector: false,
        showSegmentation: false,
      },
    });
    expect(screen.queryByRole('button', { name: 'Open browser-local session data' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Exit study' }));
    expect(await screen.findByRole('main', { name: 'Case catalog' })).toBeTruthy();
    await waitFor(() => expect(mocks.releaseAssets).toHaveBeenCalled());
    expect(mocks.recorder.end).toHaveBeenCalledWith('withdrawn');
  });

  it('does not start a research recorder when the browser-held OpenRouter key is missing', async () => {
    mocks.hasKey.mockReturnValue(false);
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Set up a research study' }));
    await screen.findByRole('heading', { name: 'Research Setup test surface' });
    fireEvent.click(screen.getByRole('button', { name: 'Freeze and launch' }));
    await screen.findByRole('heading', { name: 'Participant Mode test surface' });

    expect(screen.getByRole('button', { name: 'Start participant' }).matches(':disabled')).toBe(true);
    expect(mocks.controller.startParticipant).not.toHaveBeenCalled();
  });
});
