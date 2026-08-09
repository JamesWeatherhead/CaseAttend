import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Database,
  Download,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { createResearchDataExport } from '../core/researchDataExports';
import {
  researchStore,
  type ResearchRecordV1,
  type ResearchRunV1,
  type ResearchStorageStatus,
  type ResearchStore,
  type ResearchStudySummary,
} from '../services/researchStore';
import './ResearchDataPanel.css';

export type ResearchDataStoreApi = Pick<
  ResearchStore,
  | 'getStatus'
  | 'subscribeStatus'
  | 'subscribeData'
  | 'initialize'
  | 'listDrafts'
  | 'listStudies'
  | 'listRuns'
  | 'listRecords'
  | 'getExportSnapshot'
  | 'deleteParticipant'
  | 'deleteStudy'
  | 'deleteAll'
>;

export interface ResearchDataPanelProps {
  onClose: () => void;
  store?: ResearchDataStoreApi;
  /** Test seam for browser-local file downloads. */
  onDownload?: (filename: string, contents: string, mimeType: string) => void;
  /** Test seam for destructive confirmations. */
  confirmAction?: (message: string) => boolean;
}

interface ParticipantSummary {
  participantId: string;
  runCount: number;
  recordCount: number;
  activeRunCount: number;
}

interface StudyDetails {
  runs: readonly ResearchRunV1[];
  records: readonly ResearchRecordV1[];
  participants: readonly ParticipantSummary[];
}

function defaultDownload(filename: string, contents: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: mimeType }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function shortDigest(value: string): string {
  return `${value.slice(0, 10)}…${value.slice(-6)}`;
}

function readableTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message.trim() ? cause.message : fallback;
}

async function loadStudyDetails(
  store: ResearchDataStoreApi,
  manifestSha256: string,
): Promise<StudyDetails> {
  const runs = await store.listRuns(manifestSha256);
  const recordGroups = await Promise.all(runs.map((run) => store.listRecords(run.runId)));
  const records = recordGroups
    .flat()
    .sort((left, right) => left.runId.localeCompare(right.runId)
      || left.sequence - right.sequence
      || left.recordId.localeCompare(right.recordId));
  const participantMap = new Map<string, ParticipantSummary>();
  for (const run of runs) {
    const existing = participantMap.get(run.participantId) ?? {
      participantId: run.participantId,
      runCount: 0,
      recordCount: 0,
      activeRunCount: 0,
    };
    existing.runCount += 1;
    if (run.status === 'active') existing.activeRunCount += 1;
    participantMap.set(run.participantId, existing);
  }
  for (const record of records) {
    const existing = participantMap.get(record.participantId);
    if (existing) existing.recordCount += 1;
  }
  return {
    runs,
    records,
    participants: [...participantMap.values()]
      .sort((left, right) => left.participantId.localeCompare(right.participantId)),
  };
}

const EMPTY_DETAILS: StudyDetails = Object.freeze({
  runs: Object.freeze([]),
  records: Object.freeze([]),
  participants: Object.freeze([]),
});

const ResearchDataPanel: React.FC<ResearchDataPanelProps> = ({
  onClose,
  store = researchStore,
  onDownload = defaultDownload,
  confirmAction = (message) => window.confirm(message),
}) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const [status, setStatus] = useState<ResearchStorageStatus>(store.getStatus());
  const [studies, setStudies] = useState<readonly ResearchStudySummary[]>([]);
  const [draftCount, setDraftCount] = useState(0);
  const [selectedManifestSha256, setSelectedManifestSha256] = useState<string | null>(null);
  const [details, setDetails] = useState<StudyDetails>(EMPTY_DETAILS);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [dataRevision, setDataRevision] = useState(0);

  const refreshStudies = useCallback(async (preferred?: string | null) => {
    const [nextStudies, nextDrafts] = await Promise.all([
      store.listStudies(),
      store.listDrafts(),
    ]);
    setStudies(nextStudies);
    setDraftCount(nextDrafts.length);
    setSelectedManifestSha256((current) => {
      const requested = preferred === undefined ? current : preferred;
      if (requested && nextStudies.some((study) => study.manifestSha256 === requested)) {
        return requested;
      }
      return nextStudies[0]?.manifestSha256 ?? null;
    });
    return nextStudies;
  }, [store]);

  useEffect(() => {
    let active = true;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const unsubscribeStatus = store.subscribeStatus((nextStatus) => {
      if (active) setStatus(nextStatus);
    });
    const unsubscribeData = store.subscribeData(() => {
      if (!active) return;
      setDataRevision((revision) => revision + 1);
      void refreshStudies().catch((cause) => {
        if (active) setError(errorMessage(cause, 'Research data could not be refreshed.'));
      });
    });

    void (async () => {
      try {
        const nextStatus = await store.initialize();
        if (!active) return;
        setStatus(nextStatus);
        if (!nextStatus.persistent) {
          throw new Error(nextStatus.mode === 'unavailable'
            ? nextStatus.reason
            : 'Persistent browser research storage has not been verified.');
        }
        await refreshStudies();
      } catch (cause) {
        if (active) setError(errorMessage(cause, 'Research data could not be loaded.'));
      } finally {
        if (active) setLoading(false);
      }
    })();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      )].filter((element) => !element.hasAttribute('hidden'));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    closeButtonRef.current?.focus();

    return () => {
      active = false;
      unsubscribeStatus();
      unsubscribeData();
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose, refreshStudies, store]);

  useEffect(() => {
    let active = true;
    if (!selectedManifestSha256) {
      setDetails(EMPTY_DETAILS);
      setDetailsLoading(false);
      return () => {
        active = false;
      };
    }
    setDetailsLoading(true);
    setError(null);
    void loadStudyDetails(store, selectedManifestSha256)
      .then((nextDetails) => {
        if (active) setDetails(nextDetails);
      })
      .catch((cause) => {
        if (active) {
          setDetails(EMPTY_DETAILS);
          setError(errorMessage(cause, 'Study records could not be loaded.'));
        }
      })
      .finally(() => {
        if (active) setDetailsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [dataRevision, selectedManifestSha256, store]);

  const selectedStudy = useMemo(
    () => studies.find((study) => study.manifestSha256 === selectedManifestSha256) ?? null,
    [selectedManifestSha256, studies],
  );

  const exportSelected = async (format: 'jsonl' | 'csv') => {
    if (!selectedStudy || busyAction) return;
    setBusyAction(`export-${format}`);
    setError(null);
    setAnnouncement('');
    try {
      const snapshot = await store.getExportSnapshot(selectedStudy.manifestSha256);
      const artifact = await createResearchDataExport(snapshot, format);
      onDownload(artifact.filename, artifact.contents, artifact.mimeType);
      setAnnouncement(
        `Exported ${artifact.runCount} runs and ${artifact.recordCount} records as ${format.toUpperCase()}.`,
      );
    } catch (cause) {
      setError(errorMessage(cause, 'The research export could not be created.'));
    } finally {
      setBusyAction(null);
    }
  };

  const deleteParticipant = async (participant: ParticipantSummary) => {
    if (!selectedStudy || busyAction) return;
    const manifestSha256 = selectedStudy.manifestSha256;
    setError(null);
    setAnnouncement('');
    let freshRuns: readonly ResearchRunV1[];
    let freshRecordCount: number;
    try {
      freshRuns = await store.listRuns(manifestSha256, participant.participantId);
      const recordGroups = await Promise.all(
        freshRuns.map((run) => store.listRecords(run.runId)),
      );
      freshRecordCount = recordGroups.reduce((total, records) => total + records.length, 0);
    } catch (cause) {
      setError(errorMessage(cause, 'Participant data could not be refreshed.'));
      return;
    }
    const accepted = confirmAction(
      `Delete pseudonymous participant ${participant.participantId}, ${freshRuns.length} runs, and ${freshRecordCount} matching records from this browser? To stop stale tabs from recreating deleted data, a browser-local deletion marker retaining this study digest and pseudonymous participant ID remains until the study or all research data is deleted. The marker is excluded from lists and exports. This cannot be undone.`,
    );
    if (!accepted) return;

    setBusyAction(`participant-${participant.participantId}`);
    try {
      const result = await store.deleteParticipant(manifestSha256, participant.participantId);
      const [remainingRuns, remainingRecords] = await Promise.all([
        store.listRuns(manifestSha256, participant.participantId),
        store.listRecords(),
      ]);
      const matchingRecords = remainingRecords.filter((record) => (
        record.manifestRef.sha256 === manifestSha256
        && record.participantId === participant.participantId
      ));
      if (remainingRuns.length !== 0 || matchingRecords.length !== 0) {
        throw new Error('Deletion could not be verified; participant data is still present in this browser.');
      }
      if (result.retainedAntiResurrection.kind !== 'participant-tombstone') {
        throw new Error('Deletion could not be verified; its anti-resurrection state was not reported.');
      }
      await refreshStudies(manifestSha256);
      setDataRevision((revision) => revision + 1);
      setAnnouncement(
        `Deleted pseudonymous participant ${shortDigest(participant.participantId)}: ${result.runs} runs and ${result.records} records. A deletion marker retaining the study digest and pseudonymous participant ID remains only until study or all-data deletion and is excluded from lists and exports.`,
      );
    } catch (cause) {
      setError(errorMessage(cause, 'Participant data could not be deleted.'));
      setDataRevision((revision) => revision + 1);
    } finally {
      setBusyAction(null);
    }
  };

  const deleteSelectedStudy = async () => {
    if (!selectedStudy || busyAction) return;
    const manifestSha256 = selectedStudy.manifestSha256;
    setError(null);
    setAnnouncement('');
    let latest: ResearchStudySummary | undefined;
    let latestDetails: StudyDetails;
    try {
      latest = (await store.listStudies()).find((study) => study.manifestSha256 === manifestSha256);
      latestDetails = latest
        ? await loadStudyDetails(store, manifestSha256)
        : EMPTY_DETAILS;
    } catch (cause) {
      setError(errorMessage(cause, 'Study data could not be refreshed.'));
      return;
    }
    if (!latest) {
      await refreshStudies(null);
      return;
    }
    const accepted = confirmAction(
      `Delete study ${latest.id} (${manifestSha256}), ${latestDetails.runs.length} runs, and ${latestDetails.records.length} matching records from this browser? A browser-local marker retaining only this study digest remains until all research data is deleted, to stop stale tabs from recreating it; the marker is excluded from lists and exports. This cannot be undone.`,
    );
    if (!accepted) return;

    setBusyAction('delete-study');
    try {
      const result = await store.deleteStudy(manifestSha256);
      const [remainingStudies, remainingRuns, remainingRecords] = await Promise.all([
        store.listStudies(),
        store.listRuns(manifestSha256),
        store.listRecords(),
      ]);
      if (
        remainingStudies.some((study) => study.manifestSha256 === manifestSha256)
        || remainingRuns.length !== 0
        || remainingRecords.some((record) => record.manifestRef.sha256 === manifestSha256)
      ) {
        throw new Error('Deletion could not be verified; study data is still present in this browser.');
      }
      if (result.retainedAntiResurrection.kind !== 'study-tombstone') {
        throw new Error('Deletion could not be verified; its anti-resurrection state was not reported.');
      }
      await refreshStudies(null);
      setDataRevision((revision) => revision + 1);
      setAnnouncement(`Deleted study ${latest.id}: ${result.runs} runs and ${result.records} records. A non-exported study-digest deletion marker remains until all-data deletion.`);
    } catch (cause) {
      setError(errorMessage(cause, 'Study data could not be deleted.'));
      setDataRevision((revision) => revision + 1);
    } finally {
      setBusyAction(null);
    }
  };

  const deleteAllData = async () => {
    if ((studies.length === 0 && draftCount === 0) || busyAction) return;
    setError(null);
    setAnnouncement('');
    let latestStudies: readonly ResearchStudySummary[];
    let latestRuns: readonly ResearchRunV1[];
    let latestRecords: readonly ResearchRecordV1[];
    let latestDraftCount: number;
    try {
      const [latestDrafts, nextStudies, nextRuns, nextRecords] = await Promise.all([
        store.listDrafts(),
        store.listStudies(),
        store.listRuns(),
        store.listRecords(),
      ]);
      latestDraftCount = latestDrafts.length;
      latestStudies = nextStudies;
      latestRuns = nextRuns;
      latestRecords = nextRecords;
    } catch (cause) {
      setError(errorMessage(cause, 'Research data could not be refreshed.'));
      return;
    }
    const accepted = confirmAction(
      `Delete all ${latestStudies.length} studies, ${latestRuns.length} runs, ${latestRecords.length} research records, and ${latestDraftCount} ${latestDraftCount === 1 ? 'draft' : 'drafts'} from this browser? This also clears identifier-bearing study and participant deletion markers. A non-identifying numeric deletion generation remains only to reject writes queued by stale tabs; it contains no study or participant identifier. This cannot be undone.`,
    );
    if (!accepted) return;

    setBusyAction('delete-all');
    try {
      const result = await store.deleteAll();
      const [remainingDrafts, remainingStudies, remainingRuns, remainingRecords] = await Promise.all([
        store.listDrafts(),
        store.listStudies(),
        store.listRuns(),
        store.listRecords(),
      ]);
      if (
        remainingDrafts.length !== 0
        || remainingStudies.length !== 0
        || remainingRuns.length !== 0
        || remainingRecords.length !== 0
      ) {
        throw new Error('Deletion could not be verified; research data is still present in this browser.');
      }
      if (
        result.retainedAntiResurrection.kind !== 'global-deletion-epoch'
        || result.retainedAntiResurrection.containsStudyOrParticipantIdentifiers
      ) {
        throw new Error('Deletion could not be verified; its anti-resurrection state was not reported.');
      }
      await refreshStudies(null);
      setDetails(EMPTY_DETAILS);
      setAnnouncement(
        `Deleted all browser-local research data: ${result.studies} studies, ${result.runs} runs, ${result.records} records, and ${result.drafts} drafts. Only a non-identifying numeric deletion generation remains to reject stale-tab writes.`,
      );
    } catch (cause) {
      setError(errorMessage(cause, 'Research data could not be deleted.'));
      setDataRevision((revision) => revision + 1);
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="research-data-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        ref={dialogRef}
        className="research-data-panel"
        role="dialog"
        aria-modal="true"
        aria-busy={loading || detailsLoading || busyAction !== null}
        aria-labelledby="research-data-title"
        aria-describedby="research-data-privacy"
      >
        <header className="research-data-header">
          <div className="research-data-title-group">
            <span className="research-data-title-icon" aria-hidden="true"><Database /></span>
            <div>
              <h2 id="research-data-title">Research data</h2>
              <p>Review, export, or delete structured browser-local study records.</p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="research-data-close"
            onClick={onClose}
            aria-label="Close research data"
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <div
          className={`research-data-status ${status.mode !== 'indexeddb' ? 'warning' : ''}`}
          role={status.mode === 'unavailable' ? 'alert' : 'status'}
        >
          {status.mode === 'indexeddb'
            ? <ShieldCheck aria-hidden="true" />
            : <AlertTriangle aria-hidden="true" />}
          <div>
            <strong>{status.mode === 'indexeddb' ? 'Stored only in this browser.' : 'Persistent storage is unavailable.'}</strong>
            {status.mode === 'unavailable'
              ? status.reason
              : 'CaseAttend does not automatically upload research records.'}
          </div>
        </div>

        <div className="research-data-content">
          <div className="research-data-study-list">
            <h3 className="research-data-section-heading">Frozen studies</h3>
            {loading ? <p className="research-data-loading">Loading browser-local research data…</p> : null}
            {!loading && studies.length === 0 ? (
              <p className="research-data-empty">
                No frozen studies are stored in this browser.
                {draftCount > 0 ? ` ${draftCount} research ${draftCount === 1 ? 'draft is' : 'drafts are'} still stored.` : ''}
              </p>
            ) : null}
            <ul className="research-data-studies">
              {studies.map((study) => (
                <li key={study.manifestSha256}>
                  <button
                    type="button"
                    className="research-data-study"
                    aria-current={study.manifestSha256 === selectedManifestSha256 ? 'true' : undefined}
                    onClick={() => setSelectedManifestSha256(study.manifestSha256)}
                  >
                    <span className="research-data-study-name">{study.id} · v{study.version}</span>
                    <span className="research-data-study-digest">{shortDigest(study.manifestSha256)}</span>
                    <span className="research-data-study-meta">
                      {study.caseCount} {study.caseCount === 1 ? 'case' : 'cases'} · delete by {readableTime(study.retentionExpiresAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="research-data-participants">
            <div className="research-data-participant-header">
              <div>
                <h3 className="research-data-section-heading">Pseudonymous participants</h3>
                {selectedStudy ? (
                  <p>{details.runs.length} runs · {details.records.length} records</p>
                ) : null}
              </div>
              {selectedStudy ? (
                <button
                  type="button"
                  className="research-data-button danger compact"
                  disabled={busyAction !== null}
                  onClick={() => void deleteSelectedStudy()}
                >
                  <Trash2 aria-hidden="true" /> Delete study
                </button>
              ) : null}
            </div>
            {error ? <p className="research-data-error" role="alert">{error}</p> : null}
            {!error && detailsLoading ? (
              <p className="research-data-loading">Loading pseudonymous records…</p>
            ) : null}
            {!error && !detailsLoading && selectedStudy && details.participants.length === 0 ? (
              <p className="research-data-empty">This study has no participant runs.</p>
            ) : null}
            {!error && !detailsLoading && !selectedStudy ? (
              <p className="research-data-empty">Select a study to manage its data.</p>
            ) : null}
            <ul className="research-data-participant-list">
              {details.participants.map((participant) => (
                <li key={participant.participantId} className="research-data-participant">
                  <div>
                    <code title={participant.participantId}>{shortDigest(participant.participantId)}</code>
                    <span>
                      {participant.runCount} {participant.runCount === 1 ? 'run' : 'runs'} · {participant.recordCount} records
                      {participant.activeRunCount > 0 ? ` · ${participant.activeRunCount} active` : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="research-data-delete-participant"
                    disabled={busyAction !== null}
                    aria-label={`Delete pseudonymous participant ${participant.participantId}`}
                    onClick={() => void deleteParticipant(participant)}
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="research-data-actions">
          <button
            type="button"
            className="research-data-button"
            disabled={!selectedStudy || busyAction !== null}
            onClick={() => void exportSelected('jsonl')}
          >
            <Download aria-hidden="true" /> Export restricted JSONL
          </button>
          <button
            type="button"
            className="research-data-button"
            disabled={!selectedStudy || busyAction !== null}
            onClick={() => void exportSelected('csv')}
          >
            <Download aria-hidden="true" /> Export restricted CSV
          </button>
          <button
            type="button"
            className="research-data-button danger delete-all"
            disabled={(studies.length === 0 && draftCount === 0) || busyAction !== null}
            onClick={() => void deleteAllData()}
          >
            <Trash2 aria-hidden="true" /> Delete all research data
          </button>
        </div>

        <footer className="research-data-footer" id="research-data-privacy">
          <p id="research-data-export-guidance">
            <strong>Restricted pseudonymous research data.</strong> Each JSONL line or CSV row is one
            study reference, run, or closed-vocabulary record. Exports contain no raw learner or model
            text, prompts, images or screenshots, participant-entered direct-identifier fields, Case Package
            or Lesson Plan bodies, provenance text, or authentication keys. Researcher-authored IDs can still
            be identifying and must be reviewed before sharing. Protect access, encrypt files at rest and in transit
            under the approved study plan, and delete every copy by its required date.
          </p>
          <span className="sr-only" role="status" aria-live="polite">{announcement}</span>
        </footer>
      </section>
    </div>
  );
};

export default ResearchDataPanel;
