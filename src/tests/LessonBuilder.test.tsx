// @vitest-environment jsdom

import React from 'react';
import { webcrypto } from 'node:crypto';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LessonBuilder from '../components/LessonBuilder';
import type { CasePackageV1 } from '../core/casePackage';

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

const loadCasePackages = vi.fn(async () => [teachingCase] as readonly CasePackageV1[]);
const loadTwoCasePackages = vi.fn(async () => [teachingCase, secondTeachingCase] as readonly CasePackageV1[]);

describe('LessonBuilder', () => {
  beforeEach(() => {
    loadCasePackages.mockClear();
    loadTwoCasePackages.mockClear();
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
    expect(fetch).not.toHaveBeenCalled();
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
    render(<LessonBuilder onExit={() => undefined} loadCasePackages={loadCasePackages} />);
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
    expect(screen.getByRole('button', { name: 'Export bundle' })).toBeTruthy();
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
});
