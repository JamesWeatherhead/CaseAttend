// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StudyList, { type CaseLibraryState } from '../components/StudyList';
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

// Synthetic metadata keeps UI tests independent of clinical content.
vi.mock('../data/builtinStarters.generated', () => ({
  BUILTIN_STARTERS: Object.fromEntries(['ecg-conduction-case', 'fundus-normal', ...Array.from({ length: 25 }, (_, i) => `case-${i}`)]
    .map(id => [id, ['a'.repeat(64), 'a'.repeat(64)]])),
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
    vi.useRealTimers();
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

  it('opens the first local case without claiming free starters and exposes semantic authoring controls', async () => {
    const onSelectStudy = vi.fn();
    const onOpenLessonBuilder = vi.fn();
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
        onOpenLessonBuilder={onOpenLessonBuilder}
        onOpenCaseStudio={onOpenCaseStudio}
        onOpenResearchSetup={onOpenResearchSetup}
        onDeleteLocalCase={onDeleteLocalCase}
      />,
    );

    const sampleCase = await screen.findByRole('button', { name: 'Open first case' });
    expect(sampleCase).toHaveProperty('disabled', false);
    expect(screen.queryByText(/built-in sample has free starter answers/i)).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Free starter samples only' })).toHaveProperty('checked', false);
    fireEvent.click(sampleCase);
    expect(onSelectStudy).toHaveBeenCalledWith(localCase);

    const createLesson = screen.getByRole('button', { name: 'Create a lesson from slides and objectives' });
    expect(createLesson.className).toContain('min-h-11');
    fireEvent.click(createLesson);
    expect(onOpenLessonBuilder).toHaveBeenCalledTimes(1);

    const createCase = screen.getByRole('button', { name: 'Create a case from images' });
    expect(createCase.className).toContain('min-h-11');
    fireEvent.click(createCase);
    expect(onOpenCaseStudio).toHaveBeenCalledTimes(1);
    const researchSetup = screen.getByRole('button', { name: 'Set up a research study' });
    expect(researchSetup.className).toContain('min-h-11');
    fireEvent.click(researchSetup);
    expect(onOpenResearchSetup).toHaveBeenCalledTimes(1);

    expect(screen.getByRole('heading', { level: 2, name: 'Cases' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: localCase.title })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Find cases' })).toBeTruthy();
    const caseTypes = screen.getByRole('combobox', { name: 'Case type' });
    const curricula = screen.getByRole('combobox', { name: 'Curriculum tag' });
    expect(caseTypes).toHaveProperty('value', 'all');
    expect(curricula).toHaveProperty('value', 'all');
    expect(Array.from(caseTypes.querySelectorAll('option')).map(option => option.textContent))
      .toEqual(expect.arrayContaining(['ECG', 'Ultrasound', 'Ophthalmology']));
    expect(Array.from(curricula.querySelectorAll('option')).map(option => option.textContent))
      .toEqual(['Any curriculum', 'Step 1', 'Step 2', 'Clerkship']);

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
    expect(screen.getByText('1 built-in sample has free starter answers. No account needed.')).toBeTruthy();
    const search = screen.getByRole('searchbox', { name: 'Search cases' });
    fireEvent.change(search, { target: { value: 'cardiology' } });

    expect(screen.getByText('Showing 1 of 1 case')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: cardiologyCase.title })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 3, name: localCase.title })).toBeNull();

    fireEvent.change(search, { target: { value: 'not-a-real-case' } });
    expect(screen.getByText('Showing 0 of 0 cases')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'No cases found' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Clear all search and filters' }));
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

  it('combines type and curriculum, preserves untagged defaults, and clears search independently', async () => {
    const tagged = { ...cardiologyCase, id: 'tagged-ecg', title: 'Tagged ECG case',
      presentation: { ...cardiologyCase.presentation, subtitle: 'ECG | Step 2' } };
    mocks.searchDicomWebStudies.mockResolvedValue([localCase, cardiologyCase, tagged]);
    mocks.resolveAssetUri.mockResolvedValue('blob:resolved-local-preview');
    const onSelectStudy = vi.fn();
    render(<StudyList onSelectStudy={onSelectStudy} connectionType="DICOMWEB"
      setConnectionType={() => undefined} dicomConfig={{ url: 'local', name: 'Cases' }} setDicomConfig={() => undefined} />);
    await screen.findByText('Showing 3 of 3 cases');
    fireEvent.change(screen.getByLabelText('Case type'), { target: { value: 'ecg' } });
    expect(screen.getByText('Showing 2 of 2 cases')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Curriculum tag'), { target: { value: 'step-2' } });
    expect(screen.getByText('Showing 1 of 1 case')).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'case tagged' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByLabelText('Case type')).toHaveProperty('value', 'ecg');
    expect(screen.getByLabelText('Curriculum tag')).toHaveProperty('value', 'step-2');
    fireEvent.click(screen.getByRole('button', { name: 'Start case: Tagged ECG case' }));
    expect(onSelectStudy.mock.calls[0][0]).toBe(tagged);
    fireEvent.change(screen.getByLabelText('Case type'), { target: { value: 'derm' } });
    expect(screen.getByLabelText('Curriculum tag')).toHaveProperty('value', 'step-2');
    expect(screen.getByRole('heading', { name: 'No cases found' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear all search and filters' }));
    expect(screen.getByLabelText('Case type')).toHaveProperty('value', 'all');
    expect(screen.getByLabelText('Curriculum tag')).toHaveProperty('value', 'all');
    expect(document.activeElement).toBe(screen.getByRole('searchbox'));
    expect(screen.getByText('Showing 3 of 3 cases')).toBeTruthy();
  });

  it('reveals more cases, focuses the first new case, and searches the entire library', async () => {
    const cases = Array.from({ length: 25 }, (_, index) => ({
      ...cardiologyCase,
      id: `case-${index}`,
      title: `Teaching case ${index}`,
    }));
    mocks.searchDicomWebStudies.mockResolvedValue(cases);
    render(<StudyList onSelectStudy={() => undefined} connectionType="DICOMWEB"
      setConnectionType={() => undefined} dicomConfig={{ url: 'local', name: 'Cases' }}
      setDicomConfig={() => undefined} />);

    expect(await screen.findByText('Showing 12 of 25 cases')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start case: Teaching case 24' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show more cases (13 remaining)' }));
    expect(screen.getByText('Showing 24 of 25 cases')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Start case: Teaching case 12' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Teaching case 24' } });
    expect(screen.getByText('Showing 1 of 1 case')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start case: Teaching case 24' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear all search and filters' }));
    expect(screen.getByText('Showing 12 of 25 cases')).toBeTruthy();
  });

  it.each(['Try a sample case', `Start case: ${cardiologyCase.title}`])('restores the exact sample trigger after %s, including a failed first reload', async (triggerName) => {
    mocks.searchDicomWebStudies.mockResolvedValue([cardiologyCase]);
    const stateRef = { current: undefined as CaseLibraryState | undefined };
    const props = { stateRef, onSelectStudy: vi.fn(), connectionType: 'DICOMWEB' as const,
      setConnectionType: () => undefined, dicomConfig: { url: 'local', name: 'Cases' }, setDicomConfig: () => undefined };
    const firstMount = render(<StudyList {...props} />);
    await screen.findByText('Showing 1 of 1 case');
    screen.getByRole('main').scrollTop = 360;
    fireEvent.click(screen.getByRole('button', { name: triggerName }));
    firstMount.unmount();
    mocks.searchDicomWebStudies.mockRejectedValueOnce(new Error('Offline'));
    render(<StudyList {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Try loading cases again' }));
    await screen.findByText('Showing 1 of 1 case');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: triggerName }));
    expect(screen.getByRole('main').scrollTop).toBe(360);
  });

  it('restores the search, loaded batch, scroll position, and originating card after a case', async () => {
    const cases = Array.from({ length: 25 }, (_, index) => ({ ...cardiologyCase, id: `case-${index}`, title: `Teaching case ${index}`,
      presentation: { ...cardiologyCase.presentation, subtitle: 'ECG | Step 2' } }));
    mocks.searchDicomWebStudies.mockResolvedValue(cases);
    const stateRef = { current: undefined as CaseLibraryState | undefined };
    const props = { stateRef, onSelectStudy: vi.fn(), connectionType: 'DICOMWEB' as const,
      setConnectionType: () => undefined, dicomConfig: { url: 'local', name: 'Cases' }, setDicomConfig: () => undefined };
    const firstMount = render(<StudyList {...props} />);
    await screen.findByText('Showing 12 of 25 cases');
    fireEvent.change(screen.getByLabelText('Case type'), { target: { value: 'ecg' } });
    fireEvent.change(screen.getByLabelText('Curriculum tag'), { target: { value: 'step-2' } });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Teaching' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Free starter samples only' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show more cases (13 remaining)' }));
    screen.getByRole('main').scrollTop = 920;
    fireEvent.click(screen.getByRole('button', { name: 'Start case: Teaching case 15' }));
    expect(stateRef.current).toMatchObject({ searchQuery: 'Teaching', caseTypeFilter: 'ecg', curriculumFilter: 'step-2', freeStarterOnly: true, visibleCount: 24, scrollTop: 920, focusTriggerId: 'case:case-15' });
    firstMount.unmount();
    render(<StudyList {...props} />);
    await screen.findByText('Showing 24 of 25 cases');
    expect(screen.getByRole('searchbox')).toHaveProperty('value', 'Teaching');
    expect(screen.getByRole('checkbox', { name: 'Free starter samples only' })).toHaveProperty('checked', true);
    expect(screen.getByLabelText('Case type')).toHaveProperty('value', 'ecg');
    expect(screen.getByLabelText('Curriculum tag')).toHaveProperty('value', 'step-2');
    expect(screen.getByRole('main').scrollTop).toBe(920);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Start case: Teaching case 15' }));
  });

  it('remembers changed controls when navigation unmounts the library without a click or scroll', async () => {
    const tagged = { ...cardiologyCase, presentation: { ...cardiologyCase.presentation, subtitle: 'ECG | Step 2' } };
    mocks.searchDicomWebStudies.mockResolvedValue([tagged]);
    const stateRef = { current: undefined as CaseLibraryState | undefined };
    const props = { stateRef, onSelectStudy: vi.fn(), connectionType: 'DICOMWEB' as const,
      setConnectionType: () => undefined, dicomConfig: { url: 'local', name: 'Cases' }, setDicomConfig: () => undefined };
    const firstMount = render(<StudyList {...props} />);
    await screen.findByText('Showing 1 of 1 case');
    fireEvent.change(screen.getByLabelText('Case type'), { target: { value: 'ecg' } });
    fireEvent.change(screen.getByLabelText('Curriculum tag'), { target: { value: 'step-2' } });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'conduction' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Free starter samples only' }));
    firstMount.unmount();
    render(<StudyList {...props} />);
    await screen.findByText('Showing 1 of 1 case');
    expect(screen.getByLabelText('Case type')).toHaveProperty('value', 'ecg');
    expect(screen.getByLabelText('Curriculum tag')).toHaveProperty('value', 'step-2');
    expect(screen.getByRole('searchbox')).toHaveProperty('value', 'conduction');
    expect(screen.getByRole('checkbox', { name: 'Free starter samples only' })).toHaveProperty('checked', true);
  });

  it('restores the sample trigger outside active filters and falls back to search for a missing card', async () => {
    mocks.searchDicomWebStudies.mockResolvedValue([cardiologyCase]);
    const stateRef = { current: { searchQuery: '', caseTypeFilter: 'derm', curriculumFilter: 'all', visibleCount: 12,
      scrollTop: 0, focusTriggerId: 'sample' } as CaseLibraryState | undefined };
    const props = { stateRef, onSelectStudy: vi.fn(), connectionType: 'DICOMWEB' as const,
      setConnectionType: () => undefined, dicomConfig: { url: 'local', name: 'Cases' }, setDicomConfig: () => undefined };
    const firstMount = render(<StudyList {...props} />);
    await screen.findByText('Showing 0 of 0 cases');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Try a sample case' }));
    firstMount.unmount();
    stateRef.current = { ...stateRef.current!, focusTriggerId: 'case:removed-case' };
    render(<StudyList {...props} />);
    await screen.findByText('Showing 0 of 0 cases');
    expect(document.activeElement).toBe(screen.getByRole('searchbox'));
  });

  it('finds verified starter samples with combined filters without fetching answers or replacing case objects', async () => {
    const ready = { ...cardiologyCase, presentation: { ...cardiologyCase.presentation, subtitle: 'ECG | Step 2' } };
    const stale = { ...cardiologyCase, id: 'case-0', title: 'Stale ECG case',
      lessonPlanRef: { ...cardiologyCase.lessonPlanRef, sha256: 'b'.repeat(64) } };
    mocks.searchDicomWebStudies.mockResolvedValue([localCase, stale, ready]);
    mocks.resolveAssetUri.mockResolvedValue('blob:resolved-local-preview');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const onSelectStudy = vi.fn();
    render(<StudyList onSelectStudy={onSelectStudy} connectionType="DICOMWEB"
      setConnectionType={() => undefined} dicomConfig={{ url: 'local', name: 'Cases' }} setDicomConfig={() => undefined} />);
    await screen.findByText('Showing 3 of 3 cases');
    const readyButton = screen.getByRole('button', { name: `Start case: ${ready.title}`, description: 'Free starter answers' });
    expect(screen.getByRole('button', { name: `Start case: ${stale.title}` }).getAttribute('aria-describedby')).toBeNull();
    expect(screen.getAllByText('Free starter answers')).toHaveLength(1);
    const toggle = screen.getByRole('checkbox', { name: 'Free starter samples only', description: 'Built-in cases with reviewed answers. No account needed.' });
    toggle.focus();
    fireEvent.click(toggle);
    expect(document.activeElement).toBe(toggle);
    expect(screen.getByText('Showing 1 of 1 case')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Case type'), { target: { value: 'ecg' } });
    fireEvent.change(screen.getByLabelText('Curriculum tag'), { target: { value: 'step-2' } });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'conduction' } });
    expect(screen.getByText('Showing 1 of 1 case')).toBeTruthy();
    fireEvent.click(readyButton);
    expect(onSelectStudy.mock.calls[0][0]).toBe(ready);
    fireEvent.change(screen.getByLabelText('Case type'), { target: { value: 'ct' } });
    expect(screen.getByText('Showing 0 of 0 cases')).toBeTruthy();
    expect(screen.getByText(/turn off “Free starter samples only”/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(toggle).toHaveProperty('checked', true);
    fireEvent.click(screen.getByRole('button', { name: 'Clear all search and filters' }));
    expect(toggle).toHaveProperty('checked', false);
    expect(screen.getByText('Showing 3 of 3 cases')).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('chooses a verified sample outside current filters and prefers the designated sample', async () => {
    const sample = { ...cardiologyCase, id: 'fundus-normal', title: 'Synthetic preferred sample' };
    const stale = { ...cardiologyCase, id: 'case-0', manifest: { ...cardiologyCase.manifest, sha256: 'b'.repeat(64) } };
    mocks.searchDicomWebStudies.mockResolvedValue([stale, cardiologyCase, sample]);
    const onSelectStudy = vi.fn();
    const props = { onSelectStudy, connectionType: 'DICOMWEB' as const, setConnectionType: () => undefined,
      dicomConfig: { url: 'local', name: 'Cases' }, setDicomConfig: () => undefined };
    const firstMount = render(<StudyList {...props} />);
    await screen.findByText('Showing 3 of 3 cases');
    fireEvent.change(screen.getByLabelText('Case type'), { target: { value: 'ct' } });
    fireEvent.click(screen.getByRole('button', { name: 'Try a sample case' }));
    expect(onSelectStudy.mock.calls[0][0]).toBe(sample);
    firstMount.unmount();
    mocks.searchDicomWebStudies.mockResolvedValue([stale, cardiologyCase]);
    render(<StudyList {...props} />);
    await screen.findByText('Showing 2 of 2 cases');
    fireEvent.click(screen.getByRole('button', { name: 'Try a sample case' }));
    expect(onSelectStudy.mock.calls[1][0]).toBe(cardiologyCase);
  });

  it('resets an expanded batch when the starter shortcut changes', async () => {
    const cases = Array.from({ length: 25 }, (_, i) => ({ ...cardiologyCase, id: `case-${i}`, title: `Teaching case ${i}` }));
    mocks.searchDicomWebStudies.mockResolvedValue(cases);
    render(<StudyList onSelectStudy={() => undefined} connectionType="DICOMWEB"
      setConnectionType={() => undefined} dicomConfig={{ url: 'local', name: 'Cases' }} setDicomConfig={() => undefined} />);
    await screen.findByText('Showing 12 of 25 cases');
    fireEvent.click(screen.getByRole('button', { name: 'Show more cases (13 remaining)' }));
    const toggle = screen.getByRole('checkbox', { name: 'Free starter samples only' });
    toggle.focus();
    fireEvent.click(toggle);
    expect(screen.getByText('Showing 12 of 25 cases')).toBeTruthy();
    expect(document.activeElement).toBe(toggle);
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

  it('keeps testimonials under the learner’s control instead of auto-rotating them', () => {
    vi.useFakeTimers();
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

    act(() => vi.advanceTimersByTime(30_000));

    expect(screen.getByText(/I thought I had a good grasp on tension pneumothorax/)).toBeTruthy();
    expect(screen.queryByText(/It doesn't feel like an app/)).toBeNull();
  });
});
