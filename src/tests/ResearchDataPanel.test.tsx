// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ResearchDataPanel, {
  type ResearchDataStoreApi,
} from '../components/ResearchDataPanel';
import type {
  ResearchDeletionResult,
  ResearchRecordV1,
  ResearchRunV1,
  ResearchStudyDraftRecord,
  ResearchStudyExportSnapshotV1,
  ResearchStudySummary,
} from '../services/researchStore';

const STUDY_SHA = '1'.repeat(64);
const PARTICIPANT_ID = 'a'.repeat(64);
const RUN_ID = '10000000-0000-4000-8000-000000000001';
const RECORD_ID = '20000000-0000-4000-8000-000000000001';
const RAW_SENTINEL = 'SENTINEL_RAW_CHAT_IMAGE_KEY_CODE_DO_NOT_EXPORT';

const persistentStatus = {
  mode: 'indexeddb',
  persistent: true,
  launchAllowed: true,
  message: 'Research data is stored only in this browser.',
} as const;

const study: ResearchStudySummary = {
  id: 'study-1',
  version: '1.0.0',
  manifestSha256: STUDY_SHA,
  caseCount: 1,
  retentionExpiresAt: '2027-01-01T00:00:00.000Z',
  createdAt: '2026-08-09T11:00:00.000Z',
};

const run: ResearchRunV1 = {
  schema: 'caseattend.research-run',
  schemaVersion: '1.0',
  runId: RUN_ID,
  manifestRef: { id: study.id, version: study.version, sha256: STUDY_SHA },
  participantId: PARTICIPANT_ID,
  armId: 'arm-1',
  startedAt: '2026-08-09T12:00:00.000Z',
  status: 'active',
  nextSequence: 1,
};

const record: ResearchRecordV1 = {
  schema: 'caseattend.research-record',
  schemaVersion: '1.0',
  recordId: RECORD_ID,
  runId: RUN_ID,
  manifestRef: { id: study.id, version: study.version, sha256: STUDY_SHA },
  participantId: PARTICIPANT_ID,
  sequence: 0,
  occurredAt: '2026-08-09T12:00:00.000Z',
  event: { type: 'run_started', armId: 'arm-1' },
};

function exportSnapshot(): ResearchStudyExportSnapshotV1 {
  return {
    bundle: {
      portableCases: [{
        lessonPlan: { prompt: RAW_SENTINEL },
        assets: { image: `data:image/jpeg;base64,${RAW_SENTINEL}` },
      }],
      participantCode: RAW_SENTINEL,
      apiKey: RAW_SENTINEL,
    } as never,
    study,
    runs: [run],
    records: [record],
  };
}

interface MockResearchStore {
  store: ResearchDataStoreApi;
  setStudies(next: readonly ResearchStudySummary[]): void;
  setDrafts(next: readonly ResearchStudyDraftRecord[]): void;
  setRuns(next: readonly ResearchRunV1[]): void;
  setRecords(next: readonly ResearchRecordV1[]): void;
  emitDataChange(): void;
  deleteParticipant: ReturnType<typeof vi.fn>;
  deleteStudy: ReturnType<typeof vi.fn>;
  deleteAll: ReturnType<typeof vi.fn>;
  getExportSnapshot: ReturnType<typeof vi.fn>;
}

function mockStore(options: {
  mutateOnDelete?: boolean;
  participantDeleteError?: Error;
} = {}): MockResearchStore {
  let studies: readonly ResearchStudySummary[] = [study];
  const draftRecord = (id: string): ResearchStudyDraftRecord => ({
    id,
    draft: {} as never,
    createdAt: '2026-08-09T10:00:00.000Z',
    updatedAt: '2026-08-09T10:00:00.000Z',
  });
  let drafts: readonly ResearchStudyDraftRecord[] = [draftRecord('draft-a'), draftRecord('draft-b')];
  let runs: readonly ResearchRunV1[] = [run];
  let records: readonly ResearchRecordV1[] = [record];
  let dataListener: (() => void) | null = null;
  const mutateOnDelete = options.mutateOnDelete ?? true;
  const deletionResult: ResearchDeletionResult = {
    studies: 0,
    runs: 1,
    records: 1,
    drafts: 0,
    retainedAntiResurrection: {
      kind: 'participant-tombstone',
      manifestSha256: STUDY_SHA,
      participantId: PARTICIPANT_ID,
      retainedUntil: 'study-or-all-data-deletion',
      excludedFromListsAndExports: true,
    },
  };

  const deleteParticipant = vi.fn(async () => {
    if (options.participantDeleteError) throw options.participantDeleteError;
    if (mutateOnDelete) {
      runs = [];
      records = [];
    }
    return deletionResult;
  });
  const deleteStudy = vi.fn(async () => {
    if (mutateOnDelete) {
      studies = [];
      runs = [];
      records = [];
    }
    return {
      ...deletionResult,
      studies: 1,
      retainedAntiResurrection: {
        kind: 'study-tombstone' as const,
        manifestSha256: STUDY_SHA,
        retainedUntil: 'all-data-deletion' as const,
        excludedFromListsAndExports: true as const,
      },
    };
  });
  const deleteAll = vi.fn(async () => {
    const deletedDrafts = drafts.length;
    const deletedStudies = studies.length;
    const deletedRuns = runs.length;
    const deletedRecords = records.length;
    if (mutateOnDelete) {
      drafts = [];
      studies = [];
      runs = [];
      records = [];
    }
    return {
      ...deletionResult,
      studies: deletedStudies,
      runs: deletedRuns,
      records: deletedRecords,
      drafts: deletedDrafts,
      retainedAntiResurrection: {
        kind: 'global-deletion-epoch' as const,
        deletionEpoch: 1,
        containsStudyOrParticipantIdentifiers: false as const,
      },
    };
  });
  const getExportSnapshot = vi.fn(async () => exportSnapshot());
  const store = {
    getStatus: () => persistentStatus,
    subscribeStatus: () => () => undefined,
    subscribeData: (listener: () => void) => {
      dataListener = listener;
      return () => {
        if (dataListener === listener) dataListener = null;
      };
    },
    initialize: vi.fn(async () => persistentStatus),
    listDrafts: vi.fn(async () => drafts),
    listStudies: vi.fn(async () => studies),
    listRuns: vi.fn(async (manifestSha256?: string, participantId?: string) => runs.filter((candidate) => (
      (!manifestSha256 || candidate.manifestRef.sha256 === manifestSha256)
      && (!participantId || candidate.participantId === participantId)
    ))),
    listRecords: vi.fn(async (runId?: string) => records.filter((candidate) => (
      !runId || candidate.runId === runId
    ))),
    getExportSnapshot,
    deleteParticipant,
    deleteStudy,
    deleteAll,
  } as ResearchDataStoreApi;

  return {
    store,
    setStudies: (next) => { studies = next; },
    setDrafts: (next) => { drafts = next; },
    setRuns: (next) => { runs = next; },
    setRecords: (next) => { records = next; },
    emitDataChange: () => dataListener?.(),
    deleteParticipant,
    deleteStudy,
    deleteAll,
    getExportSnapshot,
  };
}

describe('ResearchDataPanel', () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    fetchSpy.mockReset();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('is an accessible browser-local management dialog with explicit export exclusions', async () => {
    const onClose = vi.fn();
    const mock = mockStore();
    render(<ResearchDataPanel onClose={onClose} store={mock.store} />);

    const dialog = screen.getByRole('dialog', { name: 'Research data' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByText('Stored only in this browser.')).toBeTruthy();
    expect(document.getElementById('research-data-privacy')?.textContent).toMatch(
      /no raw learner or model text, prompts, images or screenshots/i,
    );
    expect(document.getElementById('research-data-privacy')?.textContent).toMatch(
      /encrypt files at rest and in transit/i,
    );
    expect(await screen.findByRole('button', { name: `Delete pseudonymous participant ${PARTICIPANT_ID}` })).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Close research data' }),
    ));

    const deleteAll = screen.getByRole('button', { name: 'Delete all research data' });
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(deleteAll);
    fireEvent.mouseDown(dialog);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(dialog.parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('downloads a deterministic restricted export without any network request', async () => {
    const onDownload = vi.fn();
    const mock = mockStore();
    render(
      <ResearchDataPanel
        onClose={() => undefined}
        store={mock.store}
        onDownload={onDownload}
      />,
    );

    const button = await screen.findByRole('button', { name: 'Export restricted JSONL' });
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
    fireEvent.click(button);

    await waitFor(() => expect(onDownload).toHaveBeenCalledTimes(1));
    const [filename, contents, mimeType] = onDownload.mock.calls[0];
    expect(filename).toMatch(/^caseattend-research-[a-f0-9]{12}-[a-f0-9]{16}\.jsonl$/);
    expect(filename).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(contents).toContain('"containsRawLearnerText":false');
    expect(contents).not.toContain(RAW_SENTINEL);
    expect(contents).not.toMatch(/portableCases|lessonPlan|apiKey|participantCode/i);
    expect(mimeType).toBe('application/x-ndjson');
    expect(mock.getExportSnapshot).toHaveBeenCalledWith(STUDY_SHA);
    expect(await screen.findByText(/Exported 1 runs and 1 records as JSONL/i)).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('announces participant deletion only after read-back verifies committed removal', async () => {
    const confirmAction = vi.fn(() => true);
    const mock = mockStore();
    render(
      <ResearchDataPanel
        onClose={() => undefined}
        store={mock.store}
        confirmAction={confirmAction}
      />,
    );

    const button = await screen.findByRole('button', { name: `Delete pseudonymous participant ${PARTICIPANT_ID}` });
    fireEvent.click(button);

    await waitFor(() => expect(mock.deleteParticipant).toHaveBeenCalledWith(STUDY_SHA, PARTICIPANT_ID));
    expect(await screen.findByText(/Deleted pseudonymous participant .*: 1 runs and 1 records/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: `Delete pseudonymous participant ${PARTICIPANT_ID}` })).toBeNull();
    expect(confirmAction).toHaveBeenCalledWith(expect.stringMatching(/cannot be undone/i));
    expect(confirmAction).toHaveBeenCalledWith(expect.stringMatching(
      /deletion marker retaining this study digest and pseudonymous participant ID remains.*excluded from lists and exports/i,
    ));
    expect(screen.getByText(/A deletion marker retaining the study digest and pseudonymous participant ID remains/i)).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('never reports deletion success when the storage operation fails', async () => {
    const mock = mockStore({ participantDeleteError: new Error('Synthetic IndexedDB abort.') });
    render(
      <ResearchDataPanel
        onClose={() => undefined}
        store={mock.store}
        confirmAction={() => true}
      />,
    );

    fireEvent.click(await screen.findByRole('button', {
      name: `Delete pseudonymous participant ${PARTICIPANT_ID}`,
    }));

    expect((await screen.findByRole('alert')).textContent).toContain('Synthetic IndexedDB abort.');
    expect(screen.queryByText(/Deleted pseudonymous participant/i)).toBeNull();
    expect(await screen.findByRole('button', {
      name: `Delete pseudonymous participant ${PARTICIPANT_ID}`,
    })).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('treats an unverified successful return as a deletion failure', async () => {
    const mock = mockStore({ mutateOnDelete: false });
    render(
      <ResearchDataPanel
        onClose={() => undefined}
        store={mock.store}
        confirmAction={() => true}
      />,
    );

    fireEvent.click(await screen.findByRole('button', {
      name: `Delete pseudonymous participant ${PARTICIPANT_ID}`,
    }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/deletion could not be verified/i);
    expect(screen.queryByText(/Deleted pseudonymous participant/i)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('deletes a selected study and all data with read-back verification', async () => {
    const studyMock = mockStore();
    const firstRender = render(
      <ResearchDataPanel
        onClose={() => undefined}
        store={studyMock.store}
        confirmAction={() => true}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Delete study' }));
    await waitFor(() => expect(studyMock.deleteStudy).toHaveBeenCalledWith(STUDY_SHA));
    expect(await screen.findByText(/Deleted study study-1: 1 runs and 1 records/i)).toBeTruthy();
    firstRender.unmount();

    const allMock = mockStore();
    render(
      <ResearchDataPanel
        onClose={() => undefined}
        store={allMock.store}
        confirmAction={() => true}
      />,
    );
    const deleteAll = await screen.findByRole('button', { name: 'Delete all research data' });
    await waitFor(() => expect(deleteAll.hasAttribute('disabled')).toBe(false));
    fireEvent.click(deleteAll);
    await waitFor(() => expect(allMock.deleteAll).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Deleted all browser-local research data: 1 studies, 1 runs, 1 records, and 2 drafts/i)).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('enables and verifies Delete All when only research drafts exist', async () => {
    const confirmAction = vi.fn(() => true);
    const mock = mockStore();
    mock.setStudies([]);
    mock.setRuns([]);
    mock.setRecords([]);
    mock.setDrafts([{
      id: 'draft-only',
      draft: {} as never,
      createdAt: '2026-08-09T10:00:00.000Z',
      updatedAt: '2026-08-09T10:00:00.000Z',
    }]);
    render(
      <ResearchDataPanel
        onClose={() => undefined}
        store={mock.store}
        confirmAction={confirmAction}
      />,
    );

    expect(await screen.findByText(/1 research draft is still stored/i)).toBeTruthy();
    const deleteAll = screen.getByRole('button', { name: 'Delete all research data' });
    await waitFor(() => expect(deleteAll.hasAttribute('disabled')).toBe(false));
    fireEvent.click(deleteAll);

    await waitFor(() => expect(mock.deleteAll).toHaveBeenCalledTimes(1));
    expect(confirmAction).toHaveBeenCalledWith(expect.stringMatching(
      /0 studies, 0 runs, 0 research records, and 1 draft/i,
    ));
    expect(confirmAction).toHaveBeenCalledWith(expect.stringMatching(
      /non-identifying numeric deletion generation.*no study or participant identifier/i,
    ));
    expect(await screen.findByText(/Only a non-identifying numeric deletion generation remains/i)).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refreshes exact run and record counts before confirming study deletion', async () => {
    const confirmAction = vi.fn(() => false);
    const mock = mockStore();
    render(
      <ResearchDataPanel
        onClose={() => undefined}
        store={mock.store}
        confirmAction={confirmAction}
      />,
    );
    await screen.findByText('1 runs · 1 records');

    const secondRun: ResearchRunV1 = {
      ...run,
      runId: '10000000-0000-4000-8000-000000000002',
      participantId: 'b'.repeat(64),
    };
    const secondRecord: ResearchRecordV1 = {
      ...record,
      recordId: '20000000-0000-4000-8000-000000000002',
      runId: secondRun.runId,
      participantId: secondRun.participantId,
    };
    // Do not emit a live refresh: the visible counts remain stale on purpose.
    mock.setRuns([run, secondRun]);
    mock.setRecords([record, secondRecord]);
    fireEvent.click(screen.getByRole('button', { name: 'Delete study' }));

    await waitFor(() => expect(confirmAction).toHaveBeenCalledWith(
      expect.stringMatching(/2 runs, and 2 matching records/i),
    ));
    expect(mock.deleteStudy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refreshes the study list on a live browser-store notification', async () => {
    const mock = mockStore();
    render(<ResearchDataPanel onClose={() => undefined} store={mock.store} />);
    expect(await screen.findByText('study-1 · v1.0.0')).toBeTruthy();

    mock.setStudies([]);
    mock.setDrafts([]);
    mock.setRuns([]);
    mock.setRecords([]);
    await act(async () => {
      mock.emitDataChange();
    });

    expect(await screen.findByText('No frozen studies are stored in this browser.')).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
