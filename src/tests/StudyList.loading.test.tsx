// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('shows a recoverable error instead of spinning forever when the registry rejects', async () => {
    mocks.searchDicomWebStudies
      .mockRejectedValueOnce(new Error('registry unavailable'))
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

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Cases could not be loaded. Your browser-local session data is still available.',
    );
    expect(screen.queryByRole('status', { name: 'Loading cases' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Try loading cases again' }));
    await waitFor(() => expect(mocks.searchDicomWebStudies).toHaveBeenCalledTimes(2));
    await screen.findByText('Cases');
  });

  it('shows a resolved browser-local preview and mobile-safe authoring and filter controls', async () => {
    const onSelectStudy = vi.fn();
    const onOpenCaseStudio = vi.fn();
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
        onDeleteLocalCase={onDeleteLocalCase}
      />,
    );

    const createCase = await screen.findByRole('button', { name: 'Create a case' });
    expect(createCase.className).toContain('min-h-11');
    fireEvent.click(createCase);
    expect(onOpenCaseStudio).toHaveBeenCalledTimes(1);

    const filterGroup = screen.getByLabelText('Filter cases');
    expect(filterGroup.className).toContain('overflow-x-auto');
    const filterButtons = Array.from(filterGroup.querySelectorAll('button'));
    expect(filterButtons.length).toBeGreaterThan(1);
    expect(filterButtons.every((button) => button.className.includes('min-h-11'))).toBe(true);
    expect(screen.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true');

    const preview = screen.getByRole('img', { name: localCase.preview.alt });
    await waitFor(() => expect(preview.getAttribute('style')).toContain('blob:resolved-local-preview'));
    expect(mocks.resolveAssetUri).toHaveBeenCalledWith(localCase.preview.src);

    fireEvent.click(screen.getByRole('button', { name: `Start case: ${localCase.title}` }));
    expect(onSelectStudy).toHaveBeenCalledWith(localCase);

    fireEvent.click(screen.getByRole('button', { name: `Delete browser-local case: ${localCase.title}` }));
    await waitFor(() => expect(onDeleteLocalCase).toHaveBeenCalledWith(localCase.id));
    expect(confirm).toHaveBeenCalled();
  });
});
