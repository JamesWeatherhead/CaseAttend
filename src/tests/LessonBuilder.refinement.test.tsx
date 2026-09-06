// @vitest-environment jsdom
import React from 'react';
import { webcrypto } from 'node:crypto';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import LessonBuilder from '../components/LessonBuilder';
import { CasePackageStore } from '../services/casePackageStore';
import { createCaseStudioController } from '../services/caseStudioController';
import { makeEditableLessonCase } from './lessonBuilderTestFixture';
import { finalizeLessonPlanV1, getLessonPlanRef } from '../core/lessonPlan';
import { finalizeCasePackageV1 } from '../core/casePackage';
import { createPortableCasePackageV1 } from '../core/portableCasePackage';

beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('fetch', vi.fn());
  vi.stubGlobal('confirm', vi.fn(() => true));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function openSavedLesson(options: { memory?: boolean; indexedDB?: IDBFactory; exportPortableCase?: () => Promise<void> } = {}) {
  const portable = await makeEditableLessonCase();
  const store = new CasePackageStore({ indexedDB: options.memory ? null : options.indexedDB ?? new IDBFactory() });
  await store.save(portable);
  const controller = createCaseStudioController({ store });
  const save = vi.fn(controller.saveUpdatedBundle);
  const onExit = vi.fn();
  const mounted = render(<LessonBuilder onExit={onExit} loadCasePackages={async () => [portable.casePackage]}
    loadStoredLesson={controller.loadStoredLesson} saveUpdatedBundle={save} getStorageStatus={controller.getStorageStatus}
    exportPortableCase={options.exportPortableCase} />);
  await screen.findByRole('heading', { name: 'Set up the lesson' });
  return { portable, store, save, onExit, mounted };
}

function unloadIsProtected() {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

it('retains level-specific curriculum, openings, guided mode and turn budget across a title revision', async () => {
  const original = await makeEditableLessonCase();
  const { manifest: _lessonManifest, ...draft } = original.lessonPlan;
  const level = draft.learner.levels[0];
  const lessonPlan = await finalizeLessonPlanV1({
    ...draft, practiceMode: 'guided', turnBudget: 18,
    objectives: draft.objectives.map(objective => ({ ...objective, learnerLevels: draft.learner.levels, sourceSlides: [23] })),
    learnerOpenings: [{ learnerLevel: level, content: 'Describe the image in your own words.' }],
  });
  const { manifest: _caseManifest, ...caseDraft } = original.casePackage;
  const casePackage = await finalizeCasePackageV1({ ...caseDraft, lessonPlanRef: getLessonPlanRef(lessonPlan) });
  const portable = await createPortableCasePackageV1(casePackage, lessonPlan, original.assets);
  const store = new CasePackageStore({ indexedDB: new IDBFactory() });
  await store.save(portable);
  const controller = createCaseStudioController({ store });
  render(<LessonBuilder onExit={() => undefined} loadCasePackages={async () => [casePackage]}
    loadStoredLesson={controller.loadStoredLesson} saveUpdatedBundle={controller.saveUpdatedBundle}
    getStorageStatus={controller.getStorageStatus} />);
  await screen.findByRole('heading', { name: 'Set up the lesson' });
  expect(screen.getByLabelText(/Educator answer key/)).toHaveProperty('value', lessonPlan.teachingNotes.join('\n'));
  fireEvent.change(screen.getByLabelText(/Lesson title/), { target: { value: 'Revised curriculum title' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review/export' }));
  await screen.findByText(/Browser-local case and exact lesson revision saved/);
  const saved = (await store.get(casePackage.id))!.lessonPlan;
  expect(saved.objectives).toEqual(lessonPlan.objectives);
  expect(saved.learnerOpenings).toEqual(lessonPlan.learnerOpenings);
  expect(saved.practiceMode).toBe('guided');
  expect(saved.turnBudget).toBe(18);
  store.close();
});

it('protects the new in-memory revision when persistent storage fails during saving', async () => {
  const indexedDB = new IDBFactory();
  const { portable, store } = await openSavedLesson({ indexedDB });
  const originalPut = IDBObjectStore.prototype.put;
  const putSpy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore, value: unknown, key?: IDBValidKey,
  ) {
    if (this.name === 'assets') throw new DOMException('Synthetic write failure', 'DataCloneError');
    return key === undefined ? originalPut.call(this, value) : originalPut.call(this, value, key);
  });
  fireEvent.change(screen.getByLabelText(/Lesson title/), { target: { value: 'Newest revision in memory' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review/export' }));
  await screen.findByText(/Case and exact lesson revision saved for this visit only/);
  expect(screen.getByRole('status', { name: 'Lesson save status' }).textContent).toBe('Saved for this visit');
  expect(unloadIsProtected()).toBe(true);
  expect((await store.get(portable.casePackage.id))?.lessonPlan.title).toBe('Newest revision in memory');
  putSpy.mockRestore();
  store.close();
  const reopened = new CasePackageStore({ indexedDB });
  expect((await reopened.get(portable.casePackage.id))?.lessonPlan.title).toBe(portable.lessonPlan.title);
  reopened.close();
});

it('saves two successive revisions through the real store and reloads the newest lesson after changing cases', async () => {
  const portable = await makeEditableLessonCase();
  const second = await makeEditableLessonCase('second-refinement-case');
  const store = new CasePackageStore({ indexedDB: new IDBFactory() });
  await store.save(portable);
  await store.save(second);
  const controller = createCaseStudioController({ store });
  const save = vi.fn(controller.saveUpdatedBundle);
  render(<LessonBuilder onExit={() => undefined} loadCasePackages={async () => [portable.casePackage, second.casePackage]}
    loadStoredLesson={controller.loadStoredLesson} saveUpdatedBundle={save} getStorageStatus={controller.getStorageStatus} />);
  await screen.findByRole('heading', { name: 'Set up the lesson' });
  fireEvent.change(screen.getByLabelText(/Lesson title/), { target: { value: 'First saved revision' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review/export' }));
  await screen.findByText(/Browser-local case and exact lesson revision saved/);
  const firstSaved = (await store.get(portable.casePackage.id))!;
  fireEvent.click(screen.getByRole('button', { name: 'Setup' }));
  fireEvent.change(screen.getByLabelText(/Lesson title/), { target: { value: 'Second saved revision' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review/export' }));
  await waitFor(async () => expect((await store.get(portable.casePackage.id))?.lessonPlan.title).toBe('Second saved revision'));
  expect(save.mock.calls[1][2]).toBe(firstSaved.casePackage.manifest.sha256);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Setup' })).toHaveProperty('disabled', false));
  fireEvent.click(screen.getByRole('button', { name: 'Setup' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Teaching case' }), { target: { value: second.casePackage.id } });
  await waitFor(() => expect(screen.getByLabelText(/Lesson title/)).toHaveProperty('value', second.lessonPlan.title));
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Teaching case' })).toHaveProperty('disabled', false));
  fireEvent.change(screen.getByRole('combobox', { name: 'Teaching case' }), { target: { value: portable.casePackage.id } });
  await waitFor(() => expect(screen.getByLabelText(/Lesson title/)).toHaveProperty('value', 'Second saved revision'));
  expect(fetch).not.toHaveBeenCalled();
  store.close();
});

it('allows an unchanged saved lesson to exit and protects edits until they are reverted or saved', async () => {
  const { portable, store, onExit } = await openSavedLesson();
  expect(unloadIsProtected()).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Back to cases' }));
  expect(onExit).toHaveBeenCalledTimes(1);
  expect(confirm).not.toHaveBeenCalled();
  const title = screen.getByLabelText(/Lesson title/);
  fireEvent.change(title, { target: { value: 'Unfinished revision' } });
  expect(screen.getByRole('status', { name: 'Lesson save status' }).textContent).toBe('Unsaved changes');
  expect(unloadIsProtected()).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Back to cases' }));
  expect(screen.getByRole('dialog', { name: 'Keep working on your lesson?' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Stay in Lesson Builder' }));
  expect(onExit).toHaveBeenCalledTimes(1);
  expect(title).toHaveProperty('value', 'Unfinished revision');
  fireEvent.change(title, { target: { value: portable.lessonPlan.title } });
  expect(unloadIsProtected()).toBe(false);
  fireEvent.change(title, { target: { value: 'Retained revision' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review/export' }));
  await screen.findByText(/Browser-local case and exact lesson revision saved/);
  await waitFor(() => expect(unloadIsProtected()).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  expect(onExit).toHaveBeenCalledTimes(2);
  expect(confirm).not.toHaveBeenCalled();
  store.close();
});

it('keeps real conflicting changes intact and does not silently adopt another view’s revision', async () => {
  const { portable, store, save, onExit } = await openSavedLesson();
  const { manifest: _lesson, ...lessonDraft } = portable.lessonPlan;
  const lessonPlan = await finalizeLessonPlanV1({ ...lessonDraft, title: 'Changed in another view' });
  const { manifest: _case, ...caseDraft } = portable.casePackage;
  const casePackage = await finalizeCasePackageV1({ ...caseDraft, lessonPlanRef: getLessonPlanRef(lessonPlan) });
  await store.save(await createPortableCasePackageV1(casePackage, lessonPlan, portable.assets), {
    expectedCaseManifestSha256: portable.casePackage.manifest.sha256,
  });
  fireEvent.change(screen.getByLabelText(/Lesson title/), { target: { value: 'Unsaved local edit' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review/export' }));
  expect((await screen.findByRole('alert')).textContent).toContain('changed in another view');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Validate lesson' }).matches(':disabled')).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Validate lesson' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  expect(save.mock.calls.every(call => call[2] === portable.casePackage.manifest.sha256)).toBe(true);
  expect((await store.get(casePackage.id))?.lessonPlan.title).toBe('Changed in another view');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Back to cases' })).toHaveProperty('disabled', false));
  fireEvent.click(screen.getByRole('button', { name: 'Back to cases' }));
  expect(screen.getByRole('dialog', { name: 'Keep working on your lesson?' })).toBeTruthy();
  expect(onExit).not.toHaveBeenCalled();
  expect(unloadIsProtected()).toBe(true);
  store.close();
});

it('holds the operation guard through a delayed portable export and retains a saved lesson if its backup fails', async () => {
  let rejectExport!: (error: Error) => void;
  const exportPortableCase = vi.fn(() => new Promise<void>((_resolve, reject) => { rejectExport = reject; }));
  const { store, onExit, save } = await openSavedLesson({ exportPortableCase });
  fireEvent.change(screen.getByLabelText(/Lesson title/), { target: { value: 'Saved before backup' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review/export' }));
  await screen.findByText(/Browser-local case and exact lesson revision saved/);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Export portable case' }).matches(':disabled')).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Export portable case' }));
  expect(screen.getByRole('button', { name: 'Done' }).matches(':disabled')).toBe(true);
  expect(screen.getByRole('button', { name: 'Setup' })).toHaveProperty('disabled', true);
  expect(screen.getByRole('button', { name: 'Back to cases' })).toHaveProperty('disabled', true);
  expect(unloadIsProtected()).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Export portable case' }));
  expect(exportPortableCase).toHaveBeenCalledTimes(1);
  await act(async () => rejectExport(new Error('Download blocked')));
  expect((await screen.findByRole('alert')).textContent).toContain('Download blocked');
  expect(save).toHaveBeenCalledTimes(1);
  expect(unloadIsProtected()).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  expect(onExit).toHaveBeenCalledTimes(1);
  expect(confirm).not.toHaveBeenCalled();
  store.close();
});

it('warns for memory-only lessons until an exact portable copy has been exported', async () => {
  const { store, onExit } = await openSavedLesson({ memory: true, exportPortableCase: async () => undefined });
  expect(screen.getByRole('status', { name: 'Lesson save status' }).textContent).toBe('Saved for this visit');
  expect(unloadIsProtected()).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Back to cases' }));
  expect(onExit).not.toHaveBeenCalled();
  const dialog = screen.getByRole('dialog', { name: 'Export a copy before leaving?' });
  expect(dialog.textContent).toContain('saved only for this visit');
  fireEvent.keyDown(dialog, { key: 'Escape' });
  fireEvent.click(screen.getByRole('button', { name: 'Review/export' }));
  await screen.findByText(/Case and exact lesson revision saved for this visit only/);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Export portable case' }).matches(':disabled')).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Export portable case' }));
  await screen.findByText(/portable case, exact lesson, and referenced images were downloaded/);
  await waitFor(() => expect(unloadIsProtected()).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  expect(onExit).toHaveBeenCalledTimes(1);
  store.close();
});

it('traps exit-dialog focus, restores the exit trigger on Escape, and leaves only after its explicit action', async () => {
  const { store, onExit } = await openSavedLesson();
  fireEvent.change(screen.getByLabelText(/Lesson title/), { target: { value: 'Unfinished' } });
  const back = screen.getByRole('button', { name: 'Back to cases' });
  back.focus();
  fireEvent.click(back);
  const dialog = screen.getByRole('dialog', { name: 'Keep working on your lesson?' });
  expect(document.activeElement).toBe(dialog);
  expect(document.querySelector('main')?.hasAttribute('inert')).toBe(true);
  fireEvent.keyDown(dialog, { key: 'Tab' });
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Stay in Lesson Builder' }));
  fireEvent.keyDown(dialog, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(back);
  expect(onExit).not.toHaveBeenCalled();
  fireEvent.click(back);
  fireEvent.click(screen.getByRole('button', { name: 'Leave Lesson Builder' }));
  expect(onExit).toHaveBeenCalledTimes(1);
  store.close();
});

it('keeps the memory-only warning when a case switch is declined and switches only after acknowledgement', async () => {
  const portable = await makeEditableLessonCase();
  const second = await makeEditableLessonCase('second-refinement-case');
  const store = new CasePackageStore({ indexedDB: null });
  await store.save(portable);
  const controller = createCaseStudioController({ store });
  render(<LessonBuilder onExit={() => undefined} loadCasePackages={async () => [portable.casePackage, second.casePackage]}
    loadStoredLesson={controller.loadStoredLesson} getStorageStatus={controller.getStorageStatus} />);
  await screen.findByRole('heading', { name: 'Set up the lesson' });
  const choice = screen.getByRole('combobox', { name: 'Teaching case' });
  vi.mocked(confirm).mockReturnValue(false);
  fireEvent.change(choice, { target: { value: second.casePackage.id } });
  expect(confirm).toHaveBeenCalledWith(expect.stringContaining('saved only for this visit'));
  expect(choice).toHaveProperty('value', portable.casePackage.id);
  expect(unloadIsProtected()).toBe(true);
  vi.mocked(confirm).mockReturnValue(true);
  fireEvent.change(choice, { target: { value: second.casePackage.id } });
  await waitFor(() => expect(choice).toHaveProperty('value', second.casePackage.id));
  await waitFor(() => expect(unloadIsProtected()).toBe(false));
  store.close();
});
