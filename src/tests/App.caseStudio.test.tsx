// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import type { CasePackageV1 } from '../core/casePackage';

const mocks = vi.hoisted(() => {
  const digest = 'a'.repeat(64);
  const localCase = {
    schemaVersion: '1.0',
    id: 'browser-local-case',
    title: 'Browser local case',
    vignette: 'A synthetic teaching vignette.',
    domain: 'dermatology',
    difficulty: 'introductory',
    artifact: {
      kind: 'image',
      modality: 'XC',
      seriesId: 'teaching-image',
      seriesLabel: 'Teaching image',
      src: `case://assets/${digest}.webp`,
      mimeType: 'image/webp',
      sha256: digest,
      alt: 'Neutral synthetic teaching image.',
      width: 640,
      height: 480,
    },
    preview: {
      src: `case://assets/${digest}.webp`,
      mimeType: 'image/webp',
      sha256: digest,
      alt: 'Neutral synthetic teaching image.',
      width: 640,
      height: 480,
    },
    artifactHints: {
      showWindowLevel: false,
      showSeriesSelector: false,
      showSegmentation: false,
    },
    provenance: {
      sourceName: 'Synthetic collection',
      sourceUrl: 'https://example.edu/source',
      license: { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
      attribution: 'Example educator',
      clinicianReview: { reviewed: false },
    },
    deidentification: { status: 'synthetic' },
    contentWarnings: ['Medical image'],
    neutralDescription: 'A neutral synthetic teaching image.',
    teachingNotes: ['Educator-only note.'],
    lessonPlanRef: { id: 'browser-local-case-lesson', version: '1.0.0', sha256: digest },
    presentation: {
      subtitle: 'Dermatology',
      category: 'derm',
      accentColor: 'rgba(59,130,246,1)',
      accentGlow: 'rgba(59,130,246,0.15)',
      accentBorder: 'rgba(59,130,246,0.3)',
      textClass: 'text-blue-400',
    },
    manifest: { algorithm: 'SHA-256', sha256: digest },
  };
  const controller = {
    processFiles: vi.fn(async () => []),
    scanAssets: vi.fn(async () => []),
    saveCase: vi.fn(async () => localCase),
    importCase: vi.fn(),
    exportCase: vi.fn(async () => undefined),
    loadStoredLesson: vi.fn(async () => null),
    saveUpdatedBundle: vi.fn(async () => true),
    resolveAssetUri: vi.fn(async () => 'blob:browser-local-case'),
    releaseAsset: vi.fn(),
    getStorageStatus: vi.fn(async () => ({ persistent: true, message: 'Saved in this browser.' })),
    deleteCase: vi.fn(async () => undefined),
  };
  return {
    controller,
    fetchDicomWebSeries: vi.fn(async () => [{
      id: 'browser-local-case:teaching-image',
      studyId: 'browser-local-case',
      description: 'Teaching image',
      modality: 'XC',
      instanceCount: 1,
      instances: [`case://assets/${digest}.webp`],
    }]),
    localCase,
  };
});

vi.mock('../services/caseStudioController', () => ({
  createCaseStudioController: () => mocks.controller,
}));

vi.mock('../services/dicomService', () => ({
  fetchDicomWebSeries: mocks.fetchDicomWebSeries,
}));

vi.mock('../services/openrouterAuth', () => ({
  completeOpenRouterOAuth: vi.fn(),
  pendingOAuthCode: () => null,
}));

vi.mock('../data/caseRegistry', () => ({
  primaryCaseModality: () => 'XC',
}));

vi.mock('../components/StudyList', () => ({
  default: ({
    onOpenCaseStudio,
    onOpenLessonBuilder,
    onDeleteLocalCase,
  }: {
    onOpenCaseStudio?: () => void;
    onOpenLessonBuilder?: () => void;
    onDeleteLocalCase?: (caseId: string) => Promise<void>;
  }) => (
    <main aria-label="Case catalog">
      <button type="button" onClick={onOpenCaseStudio}>Create a case</button>
      <button type="button" onClick={onOpenLessonBuilder}>Create a lesson</button>
      <button type="button" onClick={() => void onDeleteLocalCase?.(mocks.localCase.id)}>Delete local case</button>
    </main>
  ),
}));

vi.mock('../components/CaseStudio/CaseStudio', () => ({
  default: ({
    onExit,
    onPreview,
    onOpenLessonBuilder,
  }: {
    onExit: () => void;
    onPreview: (casePackage: CasePackageV1) => void;
    onOpenLessonBuilder: (caseId: string) => void;
  }) => (
    <main>
      <h1>Case Studio test surface</h1>
      <button type="button" onClick={() => onOpenLessonBuilder(mocks.localCase.id)}>Build saved case lesson</button>
      <button type="button" onClick={() => onPreview(mocks.localCase as unknown as CasePackageV1)}>Preview saved case</button>
      <button type="button" onClick={onExit}>Exit Case Studio</button>
    </main>
  ),
}));

vi.mock('../components/LessonBuilder', () => ({
  default: ({
    onExit,
    initialCaseId,
    loadStoredLesson,
  }: {
    onExit: () => void;
    initialCaseId?: string;
    loadStoredLesson?: (casePackage: CasePackageV1) => Promise<unknown>;
  }) => (
    <main>
      <h1>Lesson Builder test surface</h1>
      <output aria-label="Initial case">{initialCaseId ?? 'none'}</output>
      <button type="button" onClick={() => void loadStoredLesson?.(mocks.localCase as unknown as CasePackageV1)}>Load exact local lesson</button>
      <button type="button" onClick={onExit}>Exit Lesson Builder</button>
    </main>
  ),
}));

vi.mock('../components/ViewerCanvas', () => ({
  default: ({ series }: { series: { id: string } | null }) => (
    <output aria-label="Active local series">{series?.id ?? 'none'}</output>
  ),
}));
vi.mock('../components/SeriesSelector', () => ({ default: () => null }));
vi.mock('../components/AiAssistantPanel', () => ({ default: () => null }));
vi.mock('../components/FloatingToolbar', () => ({ default: () => null }));
vi.mock('../components/GuidedTour', () => ({ default: () => null }));
vi.mock('../components/MeasurementPanel', () => ({ default: () => null }));
vi.mock('../components/SegmentationPanel', () => ({ default: () => null }));
vi.mock('../components/SessionDataPanel', () => ({ default: () => null }));
vi.mock('../components/SafetyModal', () => ({ default: () => null }));

describe('App Case Studio integration', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('caseattend.guidedTour.completed', 'true');
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('routes a saved browser-local case into its exact lesson and the viewer', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Create a case' }));
    expect(screen.getByRole('heading', { name: 'Case Studio test surface' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Build saved case lesson' }));
    expect(screen.getByRole('heading', { name: 'Lesson Builder test surface' })).toBeTruthy();
    expect(screen.getByRole('status', { name: 'Initial case' }).textContent).toBe(mocks.localCase.id);

    fireEvent.click(screen.getByRole('button', { name: 'Load exact local lesson' }));
    await waitFor(() => expect(mocks.controller.loadStoredLesson).toHaveBeenCalledWith(mocks.localCase));

    fireEvent.click(screen.getByRole('button', { name: 'Exit Lesson Builder' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create a case' }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview saved case' }));

    await waitFor(() => expect(mocks.fetchDicomWebSeries).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'local' }),
      mocks.localCase.id,
    ));
    expect(await screen.findByText('browser-local-case:teaching-image')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Back to study list' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete local case' }));
    await waitFor(() => expect(mocks.controller.deleteCase).toHaveBeenCalledWith(mocks.localCase.id));
  });

  it('opens a generic lesson without retaining the previously selected local case', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Create a lesson' }));
    expect(screen.getByRole('status', { name: 'Initial case' }).textContent).toBe('none');
  });
});
