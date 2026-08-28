// @vitest-environment jsdom

import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import type { CasePackageV1 } from '../core/casePackage';
import type { Series } from '../types';

const mocks = vi.hoisted(() => {
  const digest = 'a'.repeat(64);
  const stackCase = {
    schemaVersion: '1.0',
    id: 'stack-case',
    title: 'Stack case',
    domain: 'radiology',
    artifact: {
      kind: 'image-stack',
      series: [{
        id: 'axial',
        label: 'Axial stack',
        modality: 'CT',
        frames: [
          {
            id: 'frame-one',
            src: '/frame-one.png',
            mimeType: 'image/png',
            sha256: digest,
            alt: 'Authored description for the first frame.',
          },
          {
            id: 'frame-two',
            src: '/frame-two.png',
            mimeType: 'image/png',
            sha256: digest,
            alt: 'Authored description for the second frame.',
          },
        ],
      }],
    },
    artifactHints: {
      showWindowLevel: true,
      showSeriesSelector: true,
      showSegmentation: false,
    },
    neutralDescription: 'Neutral fallback description.',
    contentWarnings: [],
    teachingNotes: [],
    lessonPlanRef: {
      id: 'stack-case-lesson',
      version: '1.0.0',
      sha256: digest,
    },
    manifest: {
      algorithm: 'SHA-256',
      sha256: digest,
    },
  } as unknown as CasePackageV1;
  const participantCase = {
    ...stackCase,
    id: 'participant-case',
    title: 'Participant case',
    contentWarnings: ['Contains a potentially distressing medical image.'],
    manifest: {
      algorithm: 'SHA-256',
      sha256: 'b'.repeat(64),
    },
  } as CasePackageV1;
  const frozen = {
    id: 'accessibility-study',
    version: '1.0.0',
    sha256: 'c'.repeat(64),
    frozenAt: '2026-08-28T12:00:00.000Z',
    draft: {},
    bundle: {},
    launchErrors: [],
  };
  const storage = {
    mode: 'indexeddb' as const,
    persistent: true as const,
    launchAllowed: true as const,
    message: 'Research data is stored only in this browser.' as const,
  };
  const session = {
    participantReference: 'd'.repeat(64),
    armId: 'question-first',
    recorder: {
      end: vi.fn(async () => null),
      abandon: vi.fn(),
      record: vi.fn(async () => ({})),
    },
    bundle: {
      researchManifest: {
        tasks: { pre: [], post: [] },
        manifest: { sha256: frozen.sha256 },
      },
    },
    arm: {
      viewerPolicy: {
        version: '1.0',
        allowSeriesSwitch: false,
        allowFrameNavigation: false,
        allowWindowLevel: false,
        allowPanZoom: false,
        allowAnnotations: false,
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
      systemPromptSha256: 'e'.repeat(64),
      requestTemplateVersion: '1.0',
    },
    inferenceConfigSha256: 'f'.repeat(64),
    portableCase: {
      casePackage: participantCase,
      lessonPlan: { manifest: { sha256: participantCase.lessonPlanRef.sha256 } },
    },
    series: [],
    releaseAssets: vi.fn(),
  };

  return {
    stackCase,
    frozen,
    session,
    storage,
    fetchDicomWebSeries: vi.fn(async () => [{
      id: 'stack-case:axial',
      studyId: 'stack-case',
      description: 'Axial stack',
      modality: 'CT',
      instanceCount: 2,
      instances: ['/frame-one.png', '/frame-two.png'],
    }] satisfies Series[]),
    controller: {
      getStorageStatus: vi.fn(() => storage),
      subscribeStorageStatus: vi.fn(() => () => undefined),
      initialize: vi.fn(async () => storage),
      listMaterials: vi.fn(async () => []),
      saveDraft: vi.fn(async () => undefined),
      exportSupportPacket: vi.fn(async () => undefined),
      freeze: vi.fn(async () => frozen),
      createParticipantLaunchConfig: vi.fn(() => ({ studyTitle: 'Accessibility study' })),
      startParticipant: vi.fn(async () => session),
    },
  };
});

vi.mock('../services/researchSetupController', () => ({
  researchSetupController: mocks.controller,
}));
vi.mock('../services/caseStudioController', () => ({
  createCaseStudioController: () => ({
    processFiles: vi.fn(),
    scanAssets: vi.fn(),
    saveCase: vi.fn(),
    importCase: vi.fn(),
    exportCase: vi.fn(),
    loadStoredLesson: vi.fn(),
    saveUpdatedBundle: vi.fn(),
    resolveAssetUri: vi.fn(),
    releaseAsset: vi.fn(),
    getStorageStatus: vi.fn(),
    subscribeStorageStatus: vi.fn(),
    deleteCase: vi.fn(),
  }),
}));
vi.mock('../services/openrouterAuth', () => ({
  completeOpenRouterOAuth: vi.fn(),
  pendingOAuthCode: () => null,
}));
vi.mock('../services/byokStore', () => ({
  BYOK_CHANGED_EVENT: 'caseattend:byok-changed',
  hasKey: () => true,
}));
vi.mock('../services/browserTeachingEngine', () => ({
  browserTeachingEngine: { runTurn: vi.fn() },
}));
vi.mock('../services/dicomService', () => ({
  fetchDicomWebSeries: mocks.fetchDicomWebSeries,
}));
vi.mock('../data/caseRegistry', () => ({ primaryCaseModality: () => 'CT' }));

vi.mock('../components/StudyList', () => ({
  default: ({
    onSelectStudy,
    onOpenResearchSetup,
  }: {
    onSelectStudy: (casePackage: CasePackageV1) => void;
    onOpenResearchSetup: () => void;
  }) => (
    <main aria-label="Case catalog">
      <button type="button" onClick={() => onSelectStudy(mocks.stackCase)}>Open stack case</button>
      <button type="button" onClick={onOpenResearchSetup}>Set up research</button>
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
      <button type="button" onClick={() => { void onFreeze({}).then(onLaunchParticipant); }}>
        Freeze and launch
      </button>
    </main>
  ),
}));
vi.mock('../components/ParticipantMode/ParticipantMode', () => ({
  default: ({
    onStart,
    renderActivity,
  }: {
    onStart: (code: string) => Promise<{ participantReference: string; armId: string }>;
    renderActivity?: () => React.ReactNode;
  }) => {
    const [started, setStarted] = useState(false);
    return (
      <main>
        <button
          type="button"
          onClick={() => { void onStart('0123456789ABCDEFGHJK').then(() => setStarted(true)); }}
        >
          Start participant
        </button>
        {started && renderActivity?.()}
      </main>
    );
  },
}));
vi.mock('../components/ViewerCanvas', () => ({
  default: ({
    accessibleDescription,
    sliceIndex,
    onSliceChange,
  }: {
    accessibleDescription: string;
    sliceIndex: number;
    onSliceChange: (index: number) => void;
  }) => (
    <section aria-label="Mock viewer canvas">
      <output data-testid="viewer-accessible-description">{accessibleDescription}</output>
      <output data-testid="viewer-frame-index">{sliceIndex}</output>
      <button type="button" onClick={() => onSliceChange(0)}>Show first frame</button>
      <button type="button" onClick={() => onSliceChange(1)}>Show second frame</button>
    </section>
  ),
}));
vi.mock('../components/SeriesSelector', () => ({ default: () => null }));
vi.mock('../components/AiAssistantPanel', () => ({ default: () => null }));
vi.mock('../components/FloatingToolbar', () => ({ default: () => null }));
vi.mock('../components/GuidedTour', () => ({ default: () => null }));
vi.mock('../components/LessonBuilder', () => ({ default: () => null }));
vi.mock('../components/CaseStudio/CaseStudio', () => ({ default: () => null }));
vi.mock('../components/MeasurementPanel', () => ({ default: () => null }));
vi.mock('../components/SegmentationPanel', () => ({ default: () => null }));
vi.mock('../components/SessionDataPanel', () => ({ default: () => null }));
vi.mock('../components/SafetyModal', () => ({ default: () => null }));

describe('App viewer accessibility integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('caseattend.guidedTour.completed', 'true');
  });

  afterEach(() => cleanup());

  it('passes the current authored frame description to ViewerCanvas as frames change', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Open stack case' }));

    await waitFor(() => {
      expect(screen.getByTestId('viewer-frame-index').textContent).toBe('1');
      expect(screen.getByTestId('viewer-accessible-description').textContent)
        .toBe('Authored description for the second frame.');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Show first frame' }));
    await waitFor(() => {
      expect(screen.getByTestId('viewer-frame-index').textContent).toBe('0');
      expect(screen.getByTestId('viewer-accessible-description').textContent)
        .toBe('Authored description for the first frame.');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Show second frame' }));
    await waitFor(() => {
      expect(screen.getByTestId('viewer-frame-index').textContent).toBe('1');
      expect(screen.getByTestId('viewer-accessible-description').textContent)
        .toBe('Authored description for the second frame.');
    });
  });

  it('shows the selected case content warning inside participant mode', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Set up research' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Freeze and launch' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Start participant' }));

    expect((await screen.findByRole('note', { name: 'Case content warning' })).textContent)
      .toContain('Contains a potentially distressing medical image.');
  });
});
