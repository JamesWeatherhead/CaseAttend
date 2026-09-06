import { describe, expect, it, vi } from 'vitest';
import { LEARNER_LEVELS } from '../constants';
import { getLessonPlanRef } from '../core/lessonPlan';
import { validatePortableCasePackageV1 } from '../core/portableCasePackage';
import type { LessonObjectiveImportRow } from '../services/lessonObjectivesImport';
import type { PowerPointTeachingDeck } from '../services/pptxTeachingDeck';
import {
  assembleTeachingDeckLesson,
  teachingDeckImageCandidates,
  teachingLevel,
  validateTeachingObjectiveSelection,
  type TeachingDeckAssemblyInput,
} from '../services/teachingDeckAssembly';

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const png = () => Uint8Array.from(atob(PNG_BASE64), (character) => character.charCodeAt(0));
const image = (id: string, path = 'ppt/media/image28.png') => ({ id, path, mimeType: 'image/png', bytes: png() });
const deck: PowerPointTeachingDeck = {
  slides: [
    { index: 2, text: 'Earlier instructor answer slide', notes: 'Private source explanation', images: [image('slide-2-rId8')] },
    { index: 23, text: 'Instructor diagnostic answer', notes: 'Private source speaker note', images: [image('slide-23-rId3')] },
    { index: 25, text: 'Additional teaching context', notes: '', images: [image('slide-25-rId4', 'ppt/media/image30.png')] },
  ],
  warnings: ['PowerPoint overlays are omitted.'],
};

function row(level = 'Step 1', overrides: Partial<LessonObjectiveImportRow> = {}): LessonObjectiveImportRow {
  return { rowNumber: 2, level, objective: 'Explain the supplied teaching pattern.', evidence: 'Describes a visible feature and justifies an interpretation.', answerKey: 'Educator-confirmed answer for this source.', hint: '', slides: [23], sourceUrl: 'https://example.edu/teaching', ...overrides };
}

function input(overrides: Partial<TeachingDeckAssemblyInput> = {}): TeachingDeckAssemblyInput {
  return {
    deck, rows: [row()], selectedImageIds: ['slide-2-rId8'], title: 'Image reasoning lesson', neutralDescription: 'Observe the supplied teaching image and explain your reasoning.', reviewed: true,
    source: { name: 'Synthetic teaching source', url: 'https://example.edu/teaching', attribution: 'Synthetic image supplied for a software test.', license: { name: 'CC0 1.0', spdxId: 'CC0-1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' } },
    ...overrides,
  };
}

function pipeline() {
  const decode = vi.fn(async () => ({ source: {} as CanvasImageSource, width: 1, height: 1 }));
  const drawImage = vi.fn();
  const createCanvas = () => ({ width: 0, height: 0, getContext: () => ({ drawImage }), toBlob: (callback: BlobCallback, type?: string) => callback(new Blob([png().buffer], { type })) });
  return { decode, drawImage, createCanvas };
}

describe('teaching deck assembly', () => {
  it('keeps a reused raster identity stable when objectives reference a later placement', () => {
    const referenced = teachingDeckImageCandidates(deck, [row()]);
    const all = teachingDeckImageCandidates(deck, [row()], true);
    expect(referenced).toHaveLength(1);
    expect(referenced[0].id).toBe('slide-2-rId8');
    expect(referenced[0].sourceSlides).toEqual([2, 23]);
    expect(all.find((candidate) => candidate.path === referenced[0].path)?.id).toBe(referenced[0].id);
    expect(teachingDeckImageCandidates(deck, [row('Step 1', { slides: [] })])).toHaveLength(2);
  });

  it('builds a portable guided lesson through the image pipeline with six scoped levels and teacher answers', async () => {
    const dependencies = pipeline();
    const levels = ['High school', 'Undergrad', 'Step 1', 'Post-Step 1', 'Step 2', 'Resident'];
    const portable = await assembleTeachingDeckLesson(input({ rows: levels.map((level, index) => row(level, { rowNumber: index + 2, answerKey: `Educator answer ${index + 1}.` })) }), { caseId: 'teaching-assembly-test', imagePipelineOptions: dependencies });
    expect(dependencies.decode).toHaveBeenCalledOnce();
    expect(dependencies.drawImage).toHaveBeenCalledOnce();
    await expect(validatePortableCasePackageV1(portable)).resolves.toEqual({ valid: true, errors: [] });
    expect(portable.lessonPlan.learner.levels).toEqual(LEARNER_LEVELS.map((entry) => entry.id));
    expect(portable.lessonPlan.objectives.map((objective) => objective.learnerLevels)).toEqual(LEARNER_LEVELS.map((entry) => [entry.id]));
    expect(portable.lessonPlan.objectives.every((objective) => objective.sourceSlides?.[0] === 23)).toBe(true);
    expect(portable.lessonPlan.practiceMode).toBe('guided');
    expect(portable.lessonPlan.clinicalReview).toEqual({ reviewed: false });
    expect(portable.casePackage.provenance.clinicianReview).toEqual({ reviewed: false });
    expect(portable.casePackage.deidentification.status).toBe('not-reviewed');
    expect(portable.casePackage.lessonPlanRef).toEqual(getLessonPlanRef(portable.lessonPlan));
    expect(portable.lessonPlan.teachingNotes.join('\n')).toContain('viewer frame 1: original slide(s) 2, 23, source part ppt/media/image28.png');
    expect(portable.lessonPlan.teachingNotes.join('\n')).toContain('Educator answer 6.');
    expect(portable.lessonPlan.rubric.criteria[0].criterion).toContain('assistance is reported separately');
    expect(portable.lessonPlan.allowedHints[0].text.length).toBeGreaterThan(0);
    expect(portable.casePackage.provenance.attribution).toContain(portable.assets[0].sha256);
    const learnerFields = JSON.stringify([portable.casePackage.title, portable.casePackage.vignette, portable.casePackage.preview, portable.lessonPlan.socraticOpening]);
    expect(learnerFields).not.toContain('Educator answer');
    expect(learnerFields).not.toContain('diagnostic answer');
    expect(JSON.stringify(portable)).not.toContain('Private source speaker note');
  });

  it('maps multiple selected images to actual viewer frame order and preserves distinct source parts', async () => {
    const portable = await assembleTeachingDeckLesson(input({ selectedImageIds: ['slide-25-rId4', 'slide-2-rId8'], rows: [row(), row('Resident', { rowNumber: 3, slides: [25] })] }), { caseId: 'teaching-stack-test', imagePipelineOptions: pipeline() });
    expect(portable.casePackage.artifact.kind).toBe('image-stack');
    expect(portable.lessonPlan.teachingNotes[0]).toContain('viewer frame 1: original slide(s) 2, 23');
    expect(portable.lessonPlan.teachingNotes[0]).toContain('viewer frame 2: original slide(s) 25, source part ppt/media/image30.png');
    expect(portable.assets).toHaveLength(1); // Identical test pixels share one content-addressed asset.
    expect(portable.lessonPlan.teachingNotes[0]).toContain('No pixel coordinates or locations are inferred');
  });

  it('requires selected media to support the chosen objectives before any image decoding', async () => {
    const dependencies = pipeline();
    await expect(assembleTeachingDeckLesson(input({ selectedImageIds: ['slide-25-rId4'] }), { imagePipelineOptions: dependencies })).rejects.toThrow('Choose an image from slide 23');
    await expect(assembleTeachingDeckLesson(input({ rows: [row('Step 1', { slides: [22] })] }), { imagePipelineOptions: dependencies })).rejects.toThrow('missing or hidden slide');
    await expect(assembleTeachingDeckLesson(input({ selectedImageIds: ['unavailable-image'] }), { imagePipelineOptions: dependencies })).rejects.toThrow('available teaching image');
    expect(dependencies.decode).not.toHaveBeenCalled();
  });

  it('enforces 24 objectives per canonical level before processing media, including mixed aliases', async () => {
    const dependencies = pipeline();
    const rows = Array.from({ length: 25 }, (_, index) => row(index % 2 ? 'Step 2' : 'ms_step2', { rowNumber: index + 2 }));
    expect(() => validateTeachingObjectiveSelection(rows.slice(0, 24))).not.toThrow();
    expect(() => validateTeachingObjectiveSelection([...rows.slice(0, 24), row('Resident')])).not.toThrow();
    await expect(assembleTeachingDeckLesson(input({ rows }), { imagePipelineOptions: dependencies })).rejects.toThrow('no more than 24 objectives for Step 2');
    expect(dependencies.decode).not.toHaveBeenCalled();
    expect(() => teachingLevel('not a level')).toThrow('Unknown learner level');
  });

  it('requires educator confirmation and complete source credit without silently truncating hints', async () => {
    const dependencies = pipeline();
    await expect(assembleTeachingDeckLesson(input({ reviewed: false }), { imagePipelineOptions: dependencies })).rejects.toThrow('Review the selected images');
    await expect(assembleTeachingDeckLesson(input({ source: { ...input().source, attribution: '' } }), { imagePipelineOptions: dependencies })).rejects.toThrow('Author attribution is required');
    await expect(assembleTeachingDeckLesson(input({ rows: [row('Step 1', { hint: 'x'.repeat(4001) })] }), { imagePipelineOptions: dependencies })).rejects.toThrow('Hint in row 2 is too long');
    expect(dependencies.decode).not.toHaveBeenCalled();
  });

  it('does not assemble a lesson after cancellation before import or during image processing', async () => {
    const dependencies = pipeline();
    const before = new AbortController();
    before.abort();
    await expect(assembleTeachingDeckLesson(input(), { signal: before.signal, imagePipelineOptions: dependencies })).rejects.toMatchObject({ name: 'AbortError' });
    expect(dependencies.decode).not.toHaveBeenCalled();
    const during = new AbortController();
    dependencies.decode.mockImplementation(async () => { during.abort(); return { source: {} as CanvasImageSource, width: 1, height: 1 }; });
    await expect(assembleTeachingDeckLesson(input(), { caseId: 'cancelled-teaching-test', signal: during.signal, imagePipelineOptions: dependencies })).rejects.toMatchObject({ name: 'AbortError' });
  });
});
