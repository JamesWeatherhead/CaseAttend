// @vitest-environment jsdom

import React from 'react';
import { webcrypto } from 'node:crypto';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LessonBuilder from '../components/LessonBuilder';
import type { CasePackageV1 } from '../core/casePackage';
import { createStarterLessonPlanV1 } from '../core/starterLesson';
import { finalizeLessonPlanV1 } from '../core/lessonPlan';
import type { LessonSourceOutline } from '../services/lessonSourceImport';

const digest = '0'.repeat(64);

const teachingCase: CasePackageV1 = {
  schemaVersion: '1.0',
  id: 'teaching-case',
  title: 'Teaching case',
  vignette: 'A neutral teaching vignette.',
  domain: 'radiology',
  difficulty: 'introductory',
  artifact: {
    kind: 'image',
    modality: 'CR',
    seriesId: 'series-1',
    seriesLabel: 'Image',
    src: '/images/teaching-case.jpg',
    mimeType: 'image/jpeg',
    sha256: digest,
    alt: 'Neutral teaching image.',
  },
  preview: {
    src: '/images/teaching-case.jpg',
    mimeType: 'image/jpeg',
    sha256: digest,
    alt: 'Neutral teaching image.',
  },
  artifactHints: {
    showWindowLevel: false,
    showSeriesSelector: false,
    showSegmentation: false,
  },
  provenance: {
    sourceName: 'Teaching source',
    sourceUrl: 'https://example.org/teaching-source',
    license: { name: 'Public domain' },
    attribution: 'Teaching attribution',
    clinicianReview: { reviewed: false },
  },
  deidentification: { status: 'not-reviewed' },
  contentWarnings: [],
  neutralDescription: 'Neutral teaching image.',
  teachingNotes: ['Answer note.'],
  lessonPlanRef: { id: 'teaching-case-lesson', version: '1.0.0', sha256: digest },
  presentation: {
    subtitle: 'X-ray',
    category: 'xray',
    accentColor: 'rgba(59,130,246,1)',
    accentGlow: 'rgba(59,130,246,0.15)',
    accentBorder: 'rgba(59,130,246,0.3)',
    textClass: 'text-blue-400',
  },
  manifest: { algorithm: 'SHA-256', sha256: digest },
};

const secondTeachingCase: CasePackageV1 = {
  ...teachingCase,
  id: 'second-teaching-case',
  title: 'Second teaching case',
  vignette: 'A different neutral teaching vignette.',
  artifact: {
    kind: 'image',
    modality: 'CR',
    seriesId: 'series-2',
    seriesLabel: 'Second image',
    src: '/images/second-teaching-case.jpg',
    mimeType: 'image/jpeg',
    sha256: digest,
    alt: 'Second neutral teaching image.',
  },
  preview: {
    ...teachingCase.preview,
    src: '/images/second-teaching-case.jpg',
    alt: 'Second neutral teaching image.',
  },
  provenance: {
    ...teachingCase.provenance,
    sourceName: 'Second teaching source',
    sourceUrl: 'https://example.org/second-teaching-source',
  },
  neutralDescription: 'Second neutral teaching image.',
  teachingNotes: ['Second answer note.'],
  lessonPlanRef: { id: 'second-teaching-case-lesson', version: '1.0.0', sha256: digest },
};

const localTeachingCase: CasePackageV1 = {
  ...secondTeachingCase,
  id: 'browser-local-teaching-case',
  title: 'Browser-local teaching case',
  artifact: {
    kind: 'image',
    modality: 'CR',
    seriesId: 'browser-local-series',
    seriesLabel: 'Browser-local teaching image',
    src: `case://assets/${digest}.jpg`,
    mimeType: 'image/jpeg',
    sha256: digest,
    alt: 'Second neutral teaching image.',
  },
  preview: {
    ...secondTeachingCase.preview,
    src: `case://assets/${digest}.jpg`,
  },
  lessonPlanRef: { id: 'browser-local-teaching-case-lesson', version: '1.0.0', sha256: digest },
};

const loadCasePackages = vi.fn(async () => [teachingCase] as readonly CasePackageV1[]);
const loadTwoCasePackages = vi.fn(async () => [teachingCase, secondTeachingCase] as readonly CasePackageV1[]);
const loadLocalCasePackages = vi.fn(async () => [teachingCase, localTeachingCase] as readonly CasePackageV1[]);

const importedOutline: LessonSourceOutline = {
  format: 'pdf',
  sections: [{
    index: 1,
    label: 'Page 1',
    text: 'Imported visual reasoning\nIdentify the key visible finding.',
  }],
  unitCount: 3,
  warnings: ['One page had no selectable text.'],
  titleCandidate: 'Imported visual reasoning',
  objectiveCandidates: [
    'Identify the key visible finding using neutral descriptive language',
    'Explain how the visible finding supports the interpretation',
  ],
  teachingNoteDraft: '## Page 1\nEDUCATOR IMPORTED NOTE',
  detectedLinks: ['https://example.org/unverified-reading'],
  extractedCharacters: 58,
};

describe('LessonBuilder', () => {
  beforeEach(() => {
    loadCasePackages.mockClear();
    loadTwoCasePackages.mockClear();
    loadLocalCasePackages.mockClear();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('crypto', webcrypto);
    vi.stubGlobal('confirm', vi.fn(() => true));
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('offers all five semantic steps without reading a key or contacting a server', async () => {
    render(<LessonBuilder onExit={() => undefined} loadCasePackages={loadCasePackages} />);

    expect(await screen.findByRole('heading', { name: 'Set up the lesson' })).toBeTruthy();
    const navigation = screen.getByRole('navigation', { name: 'Lesson builder steps' });
    for (const label of ['Setup', 'Objectives/evidence', 'Tutor path', 'Sources/review', 'Review/export']) {
      expect(within(navigation).getByRole('button', { name: new RegExp(label.replace('/', '\\/')) })).toBeTruthy();
    }
    expect(screen.getByText(/does not contact a model or read an API key/i)).toBeTruthy();
    expect(screen.getByText(/the terms are not synonyms/i)).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('turns a local PDF into an editable, unreviewed lesson draft without retaining its filename', async () => {
    const parseLessonSource = vi.fn(async () => importedOutline);
    render(
      <LessonBuilder
        onExit={() => undefined}
        loadCasePackages={loadCasePackages}
        parseLessonSource={parseLessonSource}
      />,
    );
    await screen.findByRole('heading', { name: 'Set up the lesson' });

    const source = new File(['local bytes'], 'PATIENT-NAME-teaching.pdf', { type: 'application/pdf' });
    const fileInput = screen.getByLabelText('Choose PDF or PowerPoint');
    expect((fileInput as HTMLInputElement).tabIndex).toBe(-1);
    expect((fileInput as HTMLInputElement).hidden).toBe(true);
    fireEvent.change(fileInput, {
      target: { files: [source] },
    });
    const previewHeading = await screen.findByRole('heading', { name: 'PDF draft ready to review' });
    await waitFor(() => expect(document.activeElement).toBe(previewHeading));
    expect(screen.getByRole('status').textContent).toContain('PDF draft ready to review');
    expect(screen.getByText('Links found—not verified or added as sources')).toBeTruthy();
    expect(document.body.textContent).not.toContain('PATIENT-NAME');
    fireEvent.click(screen.getByRole('button', { name: 'Apply imported draft' }));

    expect(parseLessonSource).toHaveBeenCalledWith(source, {
      signal: expect.any(AbortSignal),
    });
    expect(confirm).not.toHaveBeenCalled();
    expect((screen.getByLabelText(/Lesson title/) as HTMLInputElement).value)
      .toBe('Imported visual reasoning');
    expect(screen.getByText(/Imported draft · educator review required/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Choose another file' }));
    const dropzone = screen.getByRole('button', { name: /Drop a PDF or .pptx here/ });
    await waitFor(() => expect(document.activeElement).toBe(dropzone));
    expect(screen.getByText('Document import cleared. Choose another file.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Objectives\/evidence/ }));
    expect((screen.getAllByLabelText(/Learner-facing objective/)[0] as HTMLInputElement).value)
      .toContain('Identify the key visible finding');
    expect(screen.getAllByLabelText(/Learner-facing objective/)).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: /Tutor path/ }));
    expect((screen.getByLabelText(/Socratic opening/) as HTMLTextAreaElement).value)
      .toContain('connects to this teaching material');
    expect((screen.getByLabelText(/Answer-revealing teaching notes/) as HTMLTextAreaElement).value)
      .toContain('EDUCATOR IMPORTED NOTE');

    fireEvent.click(screen.getByRole('button', { name: /Sources\/review/ }));
    expect((screen.getByLabelText(/Reviewed by a qualified clinician/) as HTMLInputElement).checked)
      .toBe(false);
    expect(screen.queryByDisplayValue('https://example.org/unverified-reading')).toBeNull();
    expect((screen.getByLabelText(/HTTPS URL/) as HTMLInputElement).value)
      .toBe(teachingCase.provenance.sourceUrl);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('asks before replacing lesson edits with an imported draft', async () => {
    const parseLessonSource = vi.fn(async () => ({ ...importedOutline, format: 'pptx' as const }));
    vi.mocked(confirm).mockReturnValue(false);
    render(
      <LessonBuilder
        onExit={() => undefined}
        loadCasePackages={loadCasePackages}
        parseLessonSource={parseLessonSource}
      />,
    );
    await screen.findByRole('heading', { name: 'Set up the lesson' });
    fireEvent.change(screen.getByLabelText(/Lesson title/), { target: { value: 'Keep my edited title' } });
    fireEvent.change(screen.getByLabelText('Choose PDF or PowerPoint'), {
      target: { files: [new File(['bytes'], 'teaching.pptx')] },
    });
    await screen.findByRole('heading', { name: 'PowerPoint draft ready to review' });
    fireEvent.click(screen.getByRole('button', { name: 'Apply imported draft' }));

    expect(confirm).toHaveBeenCalledWith(
      'Applying this imported draft will replace lesson fields you have edited. Continue?',
    );
    expect((screen.getByLabelText(/Lesson title/) as HTMLInputElement).value)
      .toBe('Keep my edited title');
    expect(screen.getByRole('button', { name: 'Apply imported draft' })).toBeTruthy();
  });

  it('uses native step buttons and exposes the current step', async () => {
    render(<LessonBuilder onExit={() => undefined} loadCasePackages={loadCasePackages} />);
    await screen.findByRole('heading', { name: 'Set up the lesson' });

    const objectivesButton = screen.getByRole('button', { name: /Objectives\/evidence/ });
    expect(objectivesButton.tagName).toBe('BUTTON');
    objectivesButton.focus();
    fireEvent.click(objectivesButton);

    expect(await screen.findByRole('heading', { name: 'Define objectives and evidence' })).toBeTruthy();
    expect(objectivesButton.getAttribute('aria-current')).toBe('step');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('offers keyboard-accessible controls for reordering objectives', async () => {
    render(<LessonBuilder onExit={() => undefined} loadCasePackages={loadCasePackages} />);
    await screen.findByRole('heading', { name: 'Set up the lesson' });
    fireEvent.click(screen.getByRole('button', { name: /Objectives\/evidence/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add objective' }));

    const moveUp = screen.getByRole('button', { name: 'Move objective 2 up' });
    expect(moveUp.tagName).toBe('BUTTON');
    moveUp.focus();
    fireEvent.click(moveUp);

    const objectiveIds = screen.getAllByLabelText(/Objective ID/) as HTMLInputElement[];
    expect(objectiveIds.map((input) => input.value)).toEqual(['objective-2', 'objective-1']);
    expect(screen.getByRole('button', { name: 'Move objective 1 up' }).hasAttribute('disabled')).toBe(true);
  });

  it('focuses an actionable error summary when required setup data is invalid', async () => {
    render(<LessonBuilder onExit={() => undefined} loadCasePackages={loadCasePackages} />);
    await screen.findByRole('heading', { name: 'Set up the lesson' });

    fireEvent.change(screen.getByLabelText(/Lesson title/), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Next: objectives\/evidence/i }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Enter a lesson title.')).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('separates artifact provenance from clinical teaching evidence', async () => {
    render(<LessonBuilder onExit={() => undefined} loadCasePackages={loadCasePackages} />);
    await screen.findByRole('heading', { name: 'Set up the lesson' });
    fireEvent.click(screen.getByRole('button', { name: /Sources\/review/ }));

    const initialScope = screen.getByRole('combobox', { name: /Source role/ }) as HTMLSelectElement;
    expect(initialScope.value).toBe('artifact-provenance');
    fireEvent.click(screen.getByRole('button', { name: 'Add source' }));
    const scopes = screen.getAllByRole('combobox', { name: /Source role/ }) as HTMLSelectElement[];
    expect(scopes.map((select) => select.value)).toEqual(['artifact-provenance', 'clinical-teaching']);

    fireEvent.click(screen.getByRole('button', { name: 'Remove source 2' }));
    fireEvent.click(screen.getByLabelText(/Reviewed by a qualified clinician/));
    fireEvent.click(screen.getByRole('button', { name: 'Review lesson' }));
    expect(await screen.findByText(/needs at least one clinical-teaching source/i)).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('finalizes an exact linked case and lesson bundle entirely in the browser', async () => {
    const exportPortableCase = vi.fn(async () => undefined);
    const createObjectURL = vi.fn(() => 'blob:lesson-json');
    const revokeObjectURL = vi.fn();
    const NativeURL = URL;
    class TestURL extends NativeURL {}
    Object.assign(TestURL, { createObjectURL, revokeObjectURL });
    vi.stubGlobal('URL', TestURL);
    let downloadedName = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function captureDownload(this: HTMLAnchorElement) {
      downloadedName = this.download;
    });
    render(
      <LessonBuilder
        onExit={() => undefined}
        loadCasePackages={loadCasePackages}
        exportPortableCase={exportPortableCase}
      />,
    );
    await screen.findByRole('heading', { name: 'Set up the lesson' });

    fireEvent.click(screen.getByRole('button', { name: /Objectives\/evidence/ }));
    fireEvent.change(screen.getByLabelText(/Learner-facing objective/), { target: { value: 'Describe the visible finding using neutral terms.' } });
    fireEvent.change(screen.getByLabelText(/Assessment criterion/), { target: { value: 'The learner gives a specific neutral description.' } });
    fireEvent.change(screen.getByLabelText(/Observable evidence/), { target: { value: 'Names location\nNames shape' } });

    fireEvent.click(screen.getByRole('button', { name: /Tutor path/ }));
    fireEvent.change(screen.getByLabelText(/Socratic opening/), { target: { value: 'What do you notice first?' } });
    fireEvent.change(screen.getByLabelText(/Hint text/), { target: { value: 'Start with location and shape.' } });
    const whenFields = screen.getAllByLabelText(/^When/);
    fireEvent.change(whenFields[0], { target: { value: 'the learner gives two vague attempts' } });
    fireEvent.change(screen.getByLabelText(/Tutor action/), { target: { value: 'offer the allowed hint' } });
    fireEvent.change(whenFields[1], { target: { value: 'the learner completes the objective' } });
    fireEvent.change(screen.getByLabelText(/Learner message/), { target: { value: 'Summarize the evidence and stop.' } });
    fireEvent.change(screen.getByLabelText(/Educator tutor instructions/), { target: { value: 'Ask one focused question at a time.' } });
    fireEvent.change(screen.getByLabelText(/Answer-revealing teaching notes/), { target: { value: 'Answer note for the educator.' } });

    fireEvent.click(screen.getByRole('button', { name: /Review\/export/ }));

    expect(await screen.findByText('Validated draft ready to export')).toBeTruthy();
    expect(screen.getByText('Fixed by CaseAttend')).toBeTruthy();
    expect(screen.getByText('Educator controlled')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Download JSON bundle' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Export JSON bundle' }));
    expect(await screen.findByText('The versioned case and lesson bundle was downloaded from this browser.')).toBeTruthy();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:lesson-json');
    expect(downloadedName).toMatch(/\.json$/);
    expect(exportPortableCase).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('clears all case-specific lesson content before switching to another case', async () => {
    render(<LessonBuilder onExit={() => undefined} loadCasePackages={loadTwoCasePackages} />);
    await screen.findByRole('heading', { name: 'Set up the lesson' });

    fireEvent.click(screen.getByRole('button', { name: /Objectives\/evidence/ }));
    fireEvent.change(screen.getByLabelText(/Learner-facing objective/), { target: { value: 'CASE A PRIVATE OBJECTIVE' } });
    fireEvent.change(screen.getByLabelText(/Observable evidence/), { target: { value: 'CASE A PRIVATE EVIDENCE' } });
    fireEvent.click(screen.getByRole('button', { name: /Tutor path/ }));
    fireEvent.change(screen.getByLabelText(/Educator tutor instructions/), { target: { value: 'CASE A PRIVATE TUTOR INSTRUCTIONS' } });
    fireEvent.change(screen.getByLabelText(/Answer-revealing teaching notes/), { target: { value: 'CASE A PRIVATE ANSWER' } });

    fireEvent.click(screen.getByRole('button', { name: /Setup/ }));
    fireEvent.change(screen.getByRole('combobox', { name: /Case Package/ }), { target: { value: secondTeachingCase.id } });

    expect(confirm).toHaveBeenCalledWith(
      'Changing the Case Package will clear the lesson content entered for this case. Continue?',
    );
    expect((screen.getByLabelText(/Lesson title/) as HTMLInputElement).value).toContain('Second teaching case');
    expect((screen.getByLabelText(/Stable lesson ID/) as HTMLInputElement).value).toBe('second-teaching-case-lesson');

    fireEvent.click(screen.getByRole('button', { name: /Objectives\/evidence/ }));
    expect((screen.getByLabelText(/Learner-facing objective/) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/Observable evidence/) as HTMLTextAreaElement).value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: /Tutor path/ }));
    expect((screen.getByLabelText(/Educator tutor instructions/) as HTMLTextAreaElement).value).toBe('');
    expect((screen.getByLabelText(/Answer-revealing teaching notes/) as HTMLTextAreaElement).value).toBe('');
    expect(document.body.textContent).not.toContain('CASE A PRIVATE');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('loads the exact browser-local lesson when switching to a custom case', async () => {
    const storedLesson = await createStarterLessonPlanV1({
      caseId: localTeachingCase.id,
      title: 'Exact saved custom lesson',
      neutralDescription: localTeachingCase.neutralDescription,
      teachingNotes: localTeachingCase.teachingNotes,
      sourceName: localTeachingCase.provenance.sourceName,
      sourceUrl: localTeachingCase.provenance.sourceUrl!,
      learnerLevels: ['undergrad'],
    });
    const loadStoredLesson = vi.fn(async (casePackage: CasePackageV1) => (
      casePackage.id === localTeachingCase.id ? storedLesson : null
    ));
    const resolveAssetUri = vi.fn(async () => 'blob:resolved-lesson-preview');
    render(
      <LessonBuilder
        onExit={() => undefined}
        loadCasePackages={loadLocalCasePackages}
        loadStoredLesson={loadStoredLesson}
        resolveAssetUri={resolveAssetUri}
      />,
    );
    await screen.findByRole('heading', { name: 'Set up the lesson' });

    fireEvent.change(screen.getByRole('combobox', { name: /Case Package/ }), {
      target: { value: localTeachingCase.id },
    });

    await waitFor(() => {
      expect((screen.getByLabelText(/Stable lesson ID/) as HTMLInputElement).value)
        .toBe(storedLesson.id);
    });
    expect((screen.getByLabelText(/Lesson title/) as HTMLInputElement).value)
      .toBe('Exact saved custom lesson');
    expect((screen.getByLabelText(/Neutral case description/) as HTMLTextAreaElement).value)
      .toBe(storedLesson.neutralDescription);
    expect(loadStoredLesson).toHaveBeenCalledWith(localTeachingCase);
    await waitFor(
      () => expect(resolveAssetUri).toHaveBeenCalledWith(localTeachingCase.preview.src),
      { timeout: 5_000 },
    );
    await waitFor(() => {
      expect((screen.getByRole('img', { name: localTeachingCase.preview.alt }) as HTMLImageElement).src)
        .toContain('blob:resolved-lesson-preview');
    }, { timeout: 5_000 });
    fireEvent.click(screen.getByRole('button', { name: /Tutor path/ }));
    await waitFor(() => {
      expect((screen.getByLabelText(/Socratic opening/) as HTMLTextAreaElement).value)
        .toBe(storedLesson.socraticOpening);
      expect((screen.getByLabelText(/Answer-revealing teaching notes/) as HTMLTextAreaElement).value)
        .toBe(storedLesson.teachingNotes.join('\n'));
    }, { timeout: 5_000 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps a browser-local lesson and focuses an actionable error when portable export fails', async () => {
    const storedLesson = await createStarterLessonPlanV1({
      caseId: localTeachingCase.id,
      title: 'Saved local lesson',
      neutralDescription: localTeachingCase.neutralDescription,
      teachingNotes: localTeachingCase.teachingNotes,
      sourceName: localTeachingCase.provenance.sourceName,
      sourceUrl: localTeachingCase.provenance.sourceUrl!,
      learnerLevels: ['undergrad'],
    });
    const exportPortableCase = vi.fn(async () => {
      throw new Error('Browser download was blocked.');
    });
    render(
      <LessonBuilder
        onExit={() => undefined}
        initialCaseId={localTeachingCase.id}
        loadCasePackages={loadLocalCasePackages}
        loadStoredLesson={vi.fn(async () => storedLesson)}
        saveUpdatedBundle={vi.fn(async () => true)}
        exportPortableCase={exportPortableCase}
        resolveAssetUri={vi.fn(async () => 'blob:resolved-lesson-preview')}
      />,
    );
    await screen.findByRole('heading', { name: 'Set up the lesson' });

    fireEvent.click(screen.getByRole('button', { name: /Review\/export/ }));
    expect(await screen.findByText('Validated draft ready to export')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Download portable case' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Export portable case' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('The export could not be completed: Browser download was blocked.');
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect(exportPortableCase).toHaveBeenCalledWith(expect.objectContaining({ id: localTeachingCase.id }));
    fireEvent.click(screen.getByRole('button', { name: /^Setup$/ }));
    await waitFor(() => {
      expect((screen.getByLabelText(/Lesson title/) as HTMLInputElement).value).toBe('Saved local lesson');
    }, { timeout: 5_000 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses a valid advanced imported plan before the visual builder can flatten it', async () => {
    const starter = await createStarterLessonPlanV1({
      caseId: localTeachingCase.id,
      title: 'Advanced saved lesson',
      neutralDescription: localTeachingCase.neutralDescription,
      teachingNotes: localTeachingCase.teachingNotes,
      sourceName: localTeachingCase.provenance.sourceName,
      sourceUrl: localTeachingCase.provenance.sourceUrl!,
      learnerLevels: ['undergrad'],
    });
    const { manifest: _manifest, ...starterDraft } = starter;
    const advancedLesson = await finalizeLessonPlanV1({
      ...starterDraft,
      learnerOpenings: [{
        learnerLevel: 'undergrad',
        content: 'What visual feature would you describe first at your current level?',
      }],
    });
    const loadStoredLesson = vi.fn(async (casePackage: CasePackageV1) => (
      casePackage.id === localTeachingCase.id ? advancedLesson : null
    ));
    render(
      <LessonBuilder
        onExit={() => undefined}
        loadCasePackages={loadLocalCasePackages}
        loadStoredLesson={loadStoredLesson}
      />,
    );
    await screen.findByRole('heading', { name: 'Set up the lesson' });
    const originalTitle = (screen.getByLabelText(/Lesson title/) as HTMLInputElement).value;

    fireEvent.change(screen.getByRole('combobox', { name: /Case Package/ }), {
      target: { value: localTeachingCase.id },
    });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('audience-specific learner openings');
    expect(alert.textContent).toContain('No lesson content was changed.');
    expect((screen.getByLabelText(/Lesson title/) as HTMLInputElement).value).toBe(originalTitle);
    expect((screen.getByRole('combobox', { name: /Case Package/ }) as HTMLSelectElement).value)
      .toBe(teachingCase.id);
    expect(fetch).not.toHaveBeenCalled();
  });
});
