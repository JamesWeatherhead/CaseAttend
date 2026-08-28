// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StudyList from '../components/StudyList';
import type { CasePackageV1 } from '../core/casePackage';

const mocks = vi.hoisted(() => ({
  searchDicomWebStudies: vi.fn(),
  resolveAssetUri: vi.fn(),
}));

vi.mock('../services/dicomService', () => ({
  searchDicomWebStudies: mocks.searchDicomWebStudies,
}));

vi.mock('../services/openrouterAuth', () => ({
  beginOpenRouterOAuth: vi.fn(),
}));

vi.mock('../services/byokStore', () => ({
  BYOK_CHANGED_EVENT: 'caseattend:byok-changed',
  hasKey: () => false,
}));

vi.mock('../services/casePackageStore', () => ({
  casePackageStore: {
    resolveAssetUri: mocks.resolveAssetUri,
  },
}));

const digest = 'a'.repeat(64);
const localCase = {
  schemaVersion: '1.0',
  id: 'local-dermatology-case',
  title: 'Local dermatology case',
  vignette: 'A synthetic visual teaching case.',
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
    alt: 'Neutral synthetic dermatology teaching image.',
  },
  preview: {
    src: `case://assets/${digest}.webp`,
    mimeType: 'image/webp',
    sha256: digest,
    alt: 'Neutral synthetic dermatology teaching image.',
  },
  artifactHints: {
    showWindowLevel: false,
    showSeriesSelector: false,
    showSegmentation: false,
  },
  provenance: {
    sourceName: 'Synthetic source',
    sourceUrl: 'https://example.edu/source',
    license: { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
    attribution: 'Example educator',
    clinicianReview: { reviewed: false },
  },
  deidentification: { status: 'synthetic' },
  contentWarnings: ['Medical image'],
  neutralDescription: 'A neutral synthetic teaching image.',
  teachingNotes: ['Educator-only note.'],
  lessonPlanRef: { id: 'local-dermatology-case-lesson', version: '1.0.0', sha256: digest },
  presentation: {
    subtitle: 'Dermatology',
    category: 'derm',
    accentColor: 'rgba(59,130,246,1)',
    accentGlow: 'rgba(59,130,246,0.15)',
    accentBorder: 'rgba(59,130,246,0.3)',
    textClass: 'text-blue-400',
  },
  manifest: { algorithm: 'SHA-256', sha256: digest },
} as unknown as CasePackageV1;

const cardiologyCase = {
  ...localCase,
  id: 'ecg-conduction-case',
  title: 'ECG conduction case',
  vignette: 'A learner reviews an ECG with a conduction abnormality.',
  domain: 'ecg',
  preview: {
    ...localCase.preview,
    src: '/cases/ecg-conduction.webp',
    alt: 'Synthetic ECG tracing for a teaching case.',
  },
  presentation: {
    ...localCase.presentation,
    subtitle: 'Cardiology · ECG',
    category: 'ecg',
  },
} as CasePackageV1;

describe('StudyList case loading', () => {
  beforeEach(() => {
    mocks.searchDicomWebStudies.mockReset();
    mocks.resolveAssetUri.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps the landing shell visible while cases load and after a recoverable error', async () => {
    let rejectInitialLoad: (reason: Error) => void = () => undefined;
    mocks.searchDicomWebStudies
      .mockImplementationOnce(() => new Promise((_, reject) => { rejectInitialLoad = reject; }))
      .mockResolvedValueOnce([]);

    render(
      <StudyList
        onSelectStudy={() => undefined}
        connectionType="DICOMWEB"
        setConnectionType={() => undefined}
        dicomConfig={{ url: 'local', name: 'Built-in cases' }}
        setDicomConfig={() => undefined}
      />,
    );

    expect(screen.getByRole('main')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'CaseAttend' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Cases' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try a sample case' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('status', { name: 'Loading cases' })).toBeTruthy();

    await act(async () => rejectInitialLoad(new Error('registry unavailable')));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Cases could not be loaded. Your browser-local session data is still available.',
    );
    expect(screen.getByRole('heading', { level: 1, name: 'CaseAttend' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Cases' })).toBeTruthy();
    expect(screen.queryByRole('status', { name: 'Loading cases' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Try loading cases again' }));
    await waitFor(() => expect(mocks.searchDicomWebStudies).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('heading', { level: 3, name: 'No cases found' })).toBeTruthy();
  });

  it('starts the first sample and exposes semantic case and authoring controls', async () => {
    const onSelectStudy = vi.fn();
    const onOpenCaseStudio = vi.fn();
    const onOpenResearchSetup = vi.fn();
    const onDeleteLocalCase = vi.fn(async () => undefined);
    mocks.searchDicomWebStudies.mockResolvedValue([localCase]);
    mocks.resolveAssetUri.mockResolvedValue('blob:resolved-local-preview');
    vi.stubGlobal('confirm', vi.fn(() => true));

    render(
      <StudyList
        onSelectStudy={onSelectStudy}
        connectionType="DICOMWEB"
        setConnectionType={() => undefined}
        dicomConfig={{ url: 'local', name: 'Built-in and browser-local cases' }}
        setDicomConfig={() => undefined}
        onOpenCaseStudio={onOpenCaseStudio}
        onOpenResearchSetup={onOpenResearchSetup}
        onDeleteLocalCase={onDeleteLocalCase}
      />,
    );

    const sampleCase = await screen.findByRole('button', { name: 'Try a sample case' });
    expect(sampleCase).toHaveProperty('disabled', false);
    fireEvent.click(sampleCase);
    expect(onSelectStudy).toHaveBeenCalledWith(localCase);

    const createCase = screen.getByRole('button', { name: 'Create from PDF, PowerPoint, or images' });
    expect(createCase.className).toContain('min-h-11');
    fireEvent.click(createCase);
    expect(onOpenCaseStudio).toHaveBeenCalledTimes(1);
    const researchSetup = screen.getByRole('button', { name: 'Set up a research study' });
    expect(researchSetup.className).toContain('min-h-11');
    fireEvent.click(researchSetup);
    expect(onOpenResearchSetup).toHaveBeenCalledTimes(1);

    expect(screen.getByRole('heading', { level: 2, name: 'Cases' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: localCase.title })).toBeTruthy();
    const filterGroup = screen.getByRole('group', { name: 'Filter cases' });
    expect(filterGroup.className).toContain('overflow-x-auto');
    const filterButtons = Array.from(filterGroup.querySelectorAll('button'));
    expect(filterButtons.map((button) => button.textContent)).toEqual(expect.arrayContaining([
      'Step 1',
      'Step 2',
      'Clerkship',
      'ECG',
      'Ultrasound',
      'Ophthalmology',
    ]));
    expect(filterButtons.every((button) => button.className.includes('min-h-11'))).toBe(true);
    expect(screen.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true');

    const preview = screen.getByRole('img', { name: localCase.preview.alt });
    expect(preview.tagName).toBe('IMG');
    expect(preview.getAttribute('loading')).toBe('lazy');
    expect(preview.getAttribute('decoding')).toBe('async');
    await waitFor(() => expect(preview.getAttribute('src')).toBe('blob:resolved-local-preview'));
    expect(mocks.resolveAssetUri).toHaveBeenCalledWith(localCase.preview.src);

    onSelectStudy.mockClear();
    fireEvent.click(screen.getByRole('button', { name: `Start case: ${localCase.title}` }));
    expect(onSelectStudy).toHaveBeenCalledWith(localCase);

    fireEvent.click(screen.getByRole('button', { name: `Delete browser-local case: ${localCase.title}` }));
    await waitFor(() => expect(onDeleteLocalCase).toHaveBeenCalledWith(localCase.id));
    expect(confirm).toHaveBeenCalled();
  });

  it('searches cases, reports the result count, and offers a clear empty state', async () => {
    mocks.searchDicomWebStudies.mockResolvedValue([localCase, cardiologyCase]);
    mocks.resolveAssetUri.mockResolvedValue('blob:resolved-local-preview');

    render(
      <StudyList
        onSelectStudy={() => undefined}
        connectionType="DICOMWEB"
        setConnectionType={() => undefined}
        dicomConfig={{ url: 'local', name: 'Built-in cases' }}
        setDicomConfig={() => undefined}
      />,
    );

    expect(await screen.findByText('Showing 2 of 2 cases')).toBeTruthy();
    const search = screen.getByRole('searchbox', { name: 'Search cases' });
    fireEvent.change(search, { target: { value: 'cardiology' } });

    expect(screen.getByText('Showing 1 of 2 cases')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: cardiologyCase.title })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 3, name: localCase.title })).toBeNull();

    fireEvent.change(search, { target: { value: 'not-a-real-case' } });
    expect(screen.getByText('Showing 0 of 2 cases')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'No cases found' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Clear search and filters' }));
    expect(search).toHaveProperty('value', '');
    expect(screen.getByText('Showing 2 of 2 cases')).toBeTruthy();
  });

  it('provides direct safety and user-guide actions from the landing shell', async () => {
    const onShowSafety = vi.fn();
    mocks.searchDicomWebStudies.mockResolvedValue([]);

    render(
      <StudyList
        onSelectStudy={() => undefined}
        connectionType="DICOMWEB"
        setConnectionType={() => undefined}
        dicomConfig={{ url: 'local', name: 'Built-in cases' }}
        setDicomConfig={() => undefined}
        onShowSafety={onShowSafety}
      />,
    );

    const safetyAction = screen.getByRole('button', { name: 'Safety & privacy' });
    fireEvent.click(safetyAction);
    expect(onShowSafety).toHaveBeenCalledTimes(1);

    const guides = screen.getByRole('link', { name: 'User guides' });
    expect(guides.getAttribute('href')).toBe('https://github.com/JamesWeatherhead/CaseAttend/blob/main/docs/README.md');
    expect(guides.getAttribute('target')).toBe('_blank');

    const logo = document.querySelector<HTMLImageElement>('img[src="/logo.svg"]');
    expect(logo?.getAttribute('alt')).toBe('');
    expect(await screen.findByRole('heading', { level: 3, name: 'No cases found' })).toBeTruthy();
  });

  it('disables testimonial animation when reduced motion is preferred', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
    mocks.searchDicomWebStudies.mockResolvedValue([]);

    render(
      <StudyList
        onSelectStudy={() => undefined}
        connectionType="DICOMWEB"
        setConnectionType={() => undefined}
        dicomConfig={{ url: 'local', name: 'Built-in cases' }}
        setDicomConfig={() => undefined}
      />,
    );

    const firstQuote = screen.getByText(/I thought I had a good grasp on tension pneumothorax/);
    expect(firstQuote.parentElement?.style.transition).toBe('none');
    fireEvent.click(screen.getByRole('button', { name: 'Show testimonial 2 of 2' }));
    expect(screen.getByText(/It doesn't feel like an app/)).toBeTruthy();
  });
});
