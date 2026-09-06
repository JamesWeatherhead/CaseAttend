import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import TeachingDeckImport from '../components/TeachingDeckImport';
import type { PortableCasePackageV1 } from '../core/portableCasePackage';
import { extractPowerPointTeachingDeck, type PowerPointTeachingDeck } from '../services/pptxTeachingDeck';
import { importLessonObjectives, type LessonObjectiveImportRow } from '../services/lessonObjectivesImport';
import { assembleTeachingDeckLesson } from '../services/teachingDeckAssembly';
import { exportPortableCaseArchive } from '../services/portableCaseArchive';

vi.mock('../services/pptxTeachingDeck', () => ({ extractPowerPointTeachingDeck: vi.fn() }));
vi.mock('../services/lessonObjectivesImport', () => ({ importLessonObjectives: vi.fn() }));
vi.mock('../services/teachingDeckAssembly', async importOriginal => ({
  ...await importOriginal<typeof import('../services/teachingDeckAssembly')>(),
  assembleTeachingDeckLesson: vi.fn(),
}));
vi.mock('../services/portableCaseArchive', async importOriginal => ({
  ...await importOriginal<typeof import('../services/portableCaseArchive')>(),
  exportPortableCaseArchive: vi.fn(),
}));

const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), character => character.charCodeAt(0));
const deck: PowerPointTeachingDeck = {
  slides: [{ index: 23, text: 'Instructor source text', notes: 'Instructor source speaker notes', images: [{ id: 'slide-23-rId3', path: 'ppt/media/image28.png', mimeType: 'image/png', bytes }] }],
  warnings: ['Slide arrows and layout are omitted.'],
};
const objective: LessonObjectiveImportRow = { rowNumber: 2, level: 'Step 1', objective: 'Explain the visible pattern.', evidence: 'Links an observation to the interpretation.', answerKey: 'Educator-confirmed finding.', hint: 'Describe the evidence first.', slides: [23], sourceUrl: 'https://example.edu/teaching' };
let portable: PortableCasePackageV1;
const extract = vi.mocked(extractPowerPointTeachingDeck);
const importObjectives = vi.mocked(importLessonObjectives);
const assemble = vi.mocked(assembleTeachingDeckLesson);
const exportArchive = vi.mocked(exportPortableCaseArchive);

beforeAll(async () => {
  const actual = await vi.importActual<typeof import('../services/teachingDeckAssembly')>('../services/teachingDeckAssembly');
  portable = await actual.assembleTeachingDeckLesson({ deck, rows: [objective], selectedImageIds: ['slide-23-rId3'], title: 'A closer look', neutralDescription: 'Observe the teaching image.', source: { name: 'Test teaching source', url: 'https://example.edu/teaching', attribution: 'Synthetic software test image.', license: { name: 'CC0 1.0' } }, reviewed: true }, {
    caseId: 'teaching-component-test',
    imagePipelineOptions: {
      decode: async () => ({ source: {} as CanvasImageSource, width: 1, height: 1 }),
      createCanvas: () => ({ width: 0, height: 0, getContext: () => ({ drawImage: () => {} }), toBlob: (callback: BlobCallback, type?: string) => callback(new Blob([bytes.slice().buffer], { type })) }),
    },
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  extract.mockReset().mockResolvedValue(deck);
  importObjectives.mockReset().mockResolvedValue({ sheetName: 'Objectives', rows: [{ ...objective }], warnings: [] });
  assemble.mockReset().mockResolvedValue(portable);
  exportArchive.mockReset().mockResolvedValue(new Uint8Array([1, 2, 3]));
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:teaching-test');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function props(persistent = true) {
  return { onCancel: vi.fn(), onCreated: vi.fn(), onEditExistingCase: vi.fn(), saveLesson: vi.fn(async () => ({ persistent })) };
}
function disabled(name: string | RegExp) { return (screen.getByRole('button', { name }) as HTMLButtonElement).disabled; }
function chooseFiles() {
  fireEvent.change(screen.getByLabelText('Teaching PowerPoint'), { target: { files: [new File(['slides'], 'teaching.pptx')] } });
  fireEvent.change(screen.getByLabelText('Learning objectives spreadsheet'), { target: { files: [new File(['objectives'], 'objectives.xlsx')] } });
}
async function readFiles() {
  chooseFiles();
  fireEvent.click(screen.getByRole('button', { name: 'Review my material' }));
  await screen.findByRole('heading', { name: 'Choose your teaching images' });
}
function fillReview() {
  const values: Record<string, string> = { 'Lesson title': 'A closer look', 'Student introduction': 'Observe the teaching image.', 'Source name': 'Test teaching source', 'Source URL': 'https://example.edu/teaching', 'Author attribution': 'Synthetic software test image.', 'Image licence': 'CC0 1.0' };
  for (const [label, value] of Object.entries(values)) fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
async function reachReview() {
  await readFiles();
  fireEvent.click(screen.getByRole('button', { name: 'Continue to review' }));
  await screen.findByRole('heading', { name: 'What students will see' });
  fillReview();
}
async function createLesson() {
  fireEvent.click(screen.getByRole('checkbox', { name: /I reviewed the selected images/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Create lesson' }));
  await screen.findByRole('heading', { name: 'Your lesson is ready.' });
}

describe('TeachingDeckImport', () => {
  it('imports both files, preserves educator corrections, requires review, and opens the exact saved bundle', async () => {
    const callbacks = props();
    render(<TeachingDeckImport {...callbacks} />);
    expect(disabled('Review my material')).toBe(true);
    await readFiles();
    expect(extract.mock.calls[0][0].name).toBe('teaching.pptx');
    expect(importObjectives.mock.calls[0][0].name).toBe('objectives.xlsx');
    expect(await screen.findByRole('img', { name: 'Extracted image from slide 23' })).toBeTruthy();
    fireEvent.click(screen.getByText('Review answer key, evidence & hint'));
    fireEvent.change(screen.getByLabelText('Educator answer key'), { target: { value: 'Corrected educator answer.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue to review' }));
    fillReview();
    expect(disabled('Create lesson')).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: /I reviewed the selected images/ }));
    expect(disabled('Create lesson')).toBe(false);
    fireEvent.change(screen.getByLabelText('Author attribution'), { target: { value: 'Updated source credit.' } });
    expect(disabled('Create lesson')).toBe(true);
    await createLesson();
    expect(assemble).toHaveBeenCalledOnce();
    expect(assemble.mock.calls[0][0]).toMatchObject({ reviewed: true, rows: [{ answerKey: 'Corrected educator answer.' }], source: { attribution: 'Updated source credit.' } });
    expect(callbacks.saveLesson).toHaveBeenCalledWith(portable);
    expect(screen.getByText(/Saved in this browser/)).toBeTruthy();
    expect(callbacks.onCreated).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Open lesson' }));
    expect(callbacks.onCreated).toHaveBeenCalledWith(portable.casePackage, portable.lessonPlan);
  });

  it('shows an importer failure without creating partial material and supports retry', async () => {
    extract.mockRejectedValueOnce(new Error('This presentation contains no usable slides.'));
    render(<TeachingDeckImport {...props()} />);
    chooseFiles();
    fireEvent.click(screen.getByRole('button', { name: 'Review my material' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'This presentation contains no usable slides.');
    expect(importObjectives).not.toHaveBeenCalled();
    expect(assemble).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Review my material' }));
    await screen.findByRole('heading', { name: 'Choose your teaching images' });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('blocks missing media and excess per-level objectives until the educator corrects the selection', async () => {
    importObjectives.mockResolvedValue({ sheetName: 'Objectives', rows: Array.from({ length: 25 }, (_, index) => ({ ...objective, rowNumber: index + 2, objective: `Objective ${index + 1}` })), warnings: [] });
    render(<TeachingDeckImport {...props()} />);
    await readFiles();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to review' }));
    expect(screen.getByRole('alert').textContent).toContain('no more than 24 objectives');
    fireEvent.click(screen.getByRole('checkbox', { name: /Step 1\s*Objective 25/ }));
    fireEvent.click(screen.getByLabelText('Slide 23', { selector: 'input' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to review' }));
    expect(screen.getByRole('alert').textContent).toContain('Select at least one teaching image');
    fireEvent.click(screen.getByLabelText('Slide 23', { selector: 'input' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to review' }));
    expect(screen.getByRole('heading', { name: 'What students will see' })).toBeTruthy();
    expect(assemble).not.toHaveBeenCalled();
  });

  it('requires a portable export before opening a memory-only lesson and does not treat export failure as success', async () => {
    const callbacks = props(false);
    render(<TeachingDeckImport {...callbacks} />);
    await reachReview(); await createLesson();
    expect(screen.getByText(/Available only in this visit/)).toBeTruthy();
    expect(disabled('Open lesson')).toBe(true);
    exportArchive.mockRejectedValueOnce(new Error('The portable archive could not be prepared.'));
    fireEvent.click(screen.getByRole('button', { name: 'Export portable copy' }));
    expect((await screen.findByRole('alert')).textContent).toContain('could not be prepared');
    expect(disabled('Open lesson')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Export portable copy' }));
    await screen.findByText(/Download started/);
    expect(exportArchive).toHaveBeenLastCalledWith(portable);
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
    expect(disabled('Open lesson')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Open lesson' }));
    expect(callbacks.onCreated).toHaveBeenCalledWith(portable.casePackage, portable.lessonPlan);
  });

  it('preserves an assembled lesson after failed storage but only opens after a successful retry', async () => {
    const callbacks = props();
    callbacks.saveLesson.mockRejectedValueOnce(new Error('Storage unavailable.'));
    render(<TeachingDeckImport {...callbacks} />);
    await reachReview(); await createLesson();
    expect(screen.getByRole('alert').textContent).toContain('could not save');
    expect(disabled('Open lesson')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Export portable copy' }));
    await screen.findByText(/Download started/);
    expect(disabled('Open lesson')).toBe(true);
    expect(callbacks.onCreated).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry save' }));
    await screen.findByText(/Saved in this browser/);
    expect(callbacks.saveLesson).toHaveBeenCalledTimes(2);
    expect(assemble).toHaveBeenCalledOnce();
    expect(disabled('Open lesson')).toBe(false);
    expect(screen.queryByRole('button', { name: 'Retry save' })).toBeNull();
  });

  it('cancels pending imports without continuing to objectives or creating a lesson', async () => {
    let finish!: (value: PowerPointTeachingDeck) => void;
    extract.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(<TeachingDeckImport {...props()} />);
    chooseFiles();
    fireEvent.click(screen.getByRole('button', { name: 'Review my material' }));
    const signal = extract.mock.calls[0][1]?.signal;
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(signal?.aborted).toBe(true);
    await act(async () => { finish(deck); });
    expect(importObjectives).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Choose your teaching images' })).toBeNull();
    expect(disabled('Review my material')).toBe(false);
    expect(assemble).not.toHaveBeenCalled();
  });

  it.each(['Teaching PowerPoint', 'Learning objectives spreadsheet'])('clears example source assumptions when the educator replaces %s', async label => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob(['example file']) })));
    render(<TeachingDeckImport {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Use MRI example' }));
    await screen.findByRole('heading', { name: 'Choose your teaching images' });
    fireEvent.click(screen.getByRole('button', { name: 'Files' }));
    fireEvent.change(screen.getByLabelText(label), { target: { files: [new File(['replacement'], label === 'Teaching PowerPoint' ? 'different.pptx' : 'different.xlsx')] } });
    fireEvent.click(screen.getByRole('button', { name: 'Review my material' }));
    await screen.findByRole('heading', { name: 'Choose your teaching images' });
    fireEvent.click(screen.getByRole('button', { name: 'Continue to review' }));
    expect((screen.getByLabelText('Image licence') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Author attribution') as HTMLTextAreaElement).value).toBe('');
    expect((screen.getByLabelText('Lesson title') as HTMLInputElement).value).toBe('');
  });

  it('protects an unsaved draft on navigation and releases image previews on unmount', async () => {
    const callbacks = props();
    const view = render(<TeachingDeckImport {...callbacks} />);
    await readFiles();
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: 'Cases' }));
    expect(callbacks.onCancel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cases' }));
    expect(callbacks.onCancel).toHaveBeenCalledOnce();
    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:teaching-test');
  });
});
