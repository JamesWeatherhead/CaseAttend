import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Database,
  Download,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import type { SessionEventV1 } from '../core/sessionEvents';
import {
  exportSessionEventsCsv,
  exportSessionEventsJsonl,
} from '../core/sessionExports';
import {
  sessionStore,
  type SessionStorageStatus,
  type SessionStoreApi,
  type SessionSummary,
} from '../services/sessionStore';
import './SessionDataPanel.css';

interface SessionDataPanelProps {
  onClose: () => void;
  store?: SessionStoreApi;
  /** Test seam for the browser download action. */
  onDownload?: (filename: string, contents: string, mimeType: string) => void;
  /** Test seam for destructive confirmations. */
  confirmAction?: (message: string) => boolean;
}

function defaultDownload(filename: string, contents: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: mimeType }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function safeFilenamePart(value: string): string {
  const safe = value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  return safe || 'session';
}

function readableTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

const SessionDataPanel: React.FC<SessionDataPanelProps> = ({
  onClose,
  store = sessionStore,
  onDownload = defaultDownload,
  confirmAction = (message) => window.confirm(message),
}) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const [status, setStatus] = useState<SessionStorageStatus>(store.getStatus());
  const [summaries, setSummaries] = useState<readonly SessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [events, setEvents] = useState<readonly SessionEventV1[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [dataRevision, setDataRevision] = useState(0);

  const refreshSummaries = useCallback(async (preferredSessionId?: string | null) => {
    const nextSummaries = await store.listSessionSummaries();
    setSummaries(nextSummaries);
    setSelectedSessionId((current) => {
      const preferred = preferredSessionId === undefined ? current : preferredSessionId;
      if (preferred && nextSummaries.some((summary) => summary.sessionId === preferred)) {
        return preferred;
      }
      return nextSummaries[0]?.sessionId ?? null;
    });
  }, [store]);

  useEffect(() => {
    let active = true;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const unsubscribe = store.subscribeStatus((nextStatus) => {
      if (active) setStatus(nextStatus);
    });
    const unsubscribeData = store.subscribeData(() => {
      if (!active) return;
      setDataRevision((revision) => revision + 1);
      void refreshSummaries().catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Session data could not be refreshed.');
      });
    });

    void (async () => {
      try {
        const nextStatus = await store.initialize();
        if (!active) return;
        setStatus(nextStatus);
        await refreshSummaries();
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Session data could not be loaded.');
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
      unsubscribe();
      unsubscribeData();
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose, refreshSummaries, store]);

  useEffect(() => {
    let active = true;
    if (!selectedSessionId) {
      setEvents([]);
      return () => {
        active = false;
      };
    }

    setError(null);
    setEvents([]);
    void store.listEvents(selectedSessionId)
      .then((nextEvents) => {
        if (active) setEvents(nextEvents);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Session events could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, [dataRevision, selectedSessionId, store]);

  const selectedSummary = useMemo(
    () => summaries.find((summary) => summary.sessionId === selectedSessionId) ?? null,
    [selectedSessionId, summaries],
  );

  const preview = useMemo(() => {
    const visibleEvents = events.slice(0, 50);
    const json = visibleEvents.map((event) => JSON.stringify(event, null, 2)).join('\n\n');
    if (events.length <= 50) return json;
    return `${json}\n\nPreview limited to the first 50 of ${events.length} events.`;
  }, [events]);

  const exportAll = async (format: 'jsonl' | 'csv') => {
    if (summaries.length === 0) return;
    try {
      const allEvents = await store.listEvents();
      const date = new Date().toISOString().slice(0, 10);
      const stem = `caseattend-session-events-${safeFilenamePart(date)}`;
      if (format === 'jsonl') {
        onDownload(`${stem}.jsonl`, exportSessionEventsJsonl(allEvents), 'application/x-ndjson');
      } else {
        onDownload(`${stem}.csv`, exportSessionEventsCsv(allEvents), 'text/csv;charset=utf-8');
      }
      setAnnouncement(`Exported all ${allEvents.length} events as ${format.toUpperCase()}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The export could not be created.');
    }
  };

  const deleteSelected = async () => {
    if (!selectedSessionId || !selectedSummary) return;
    let latestSummary: SessionSummary | undefined;
    try {
      latestSummary = (await store.listSessionSummaries()).find(
        (summary) => summary.sessionId === selectedSessionId,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Session data could not be refreshed.');
      return;
    }
    if (!latestSummary) return;
    const accepted = confirmAction(
      `Delete session ${selectedSessionId} and its ${latestSummary.eventCount} browser-local events? This cannot be undone.`,
    );
    if (!accepted) return;

    try {
      const deleted = await store.deleteSession(selectedSessionId);
      await refreshSummaries(null);
      setAnnouncement(`Deleted ${deleted} events from this browser.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The session could not be deleted.');
    }
  };

  const deleteAll = async () => {
    if (summaries.length === 0) return;
    let latestSummaries: readonly SessionSummary[];
    try {
      latestSummaries = await store.listSessionSummaries();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Session data could not be refreshed.');
      return;
    }
    const eventCount = latestSummaries.reduce((total, summary) => total + summary.eventCount, 0);
    const accepted = confirmAction(
      `Delete all ${eventCount} events across ${latestSummaries.length} sessions from this browser? This cannot be undone.`,
    );
    if (!accepted) return;

    try {
      const deleted = await store.deleteAll();
      await refreshSummaries(null);
      setEvents([]);
      setAnnouncement(`Deleted all ${deleted} events from this browser.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Session data could not be deleted.');
    }
  };

  return (
    <div className="session-data-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        ref={dialogRef}
        className="session-data-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-data-title"
        aria-describedby="session-data-privacy"
      >
        <header className="session-data-header">
          <div className="session-data-title-group">
            <span className="session-data-title-icon" aria-hidden="true"><Database /></span>
            <div>
              <h2 id="session-data-title">Learning session data</h2>
              <p>Review, export, or delete structured learning events.</p>
            </div>
          </div>
          <button ref={closeButtonRef} type="button" className="session-data-close" onClick={onClose} aria-label="Close session data">
            <X aria-hidden="true" />
          </button>
        </header>

        <div
          className={`session-data-status ${status.mode === 'memory' ? 'warning' : ''}`}
          role={status.mode === 'memory' ? 'alert' : 'status'}
        >
          {status.mode === 'memory'
            ? <AlertTriangle aria-hidden="true" />
            : <ShieldCheck aria-hidden="true" />}
          <div>
            <strong>Stored only in this browser.</strong>
            {status.mode === 'memory'
              ? <>{status.message} IndexedDB is unavailable: {status.reason} No session event is sent to a CaseAttend server.</>
              : <>No session event is sent to a CaseAttend server.</>}
          </div>
        </div>

        <div className="session-data-content">
          <div className="session-data-session-list">
            <h3 className="session-data-section-heading">Sessions</h3>
            {loading ? <p className="session-data-loading">Loading browser-local data...</p> : null}
            {!loading && summaries.length === 0 ? (
              <p className="session-data-empty">No learning sessions are stored in this browser.</p>
            ) : null}
            <ul className="session-data-sessions">
              {summaries.map((summary) => (
                <li key={summary.sessionId}>
                  <button
                    type="button"
                    className="session-data-session"
                    aria-current={summary.sessionId === selectedSessionId ? 'true' : undefined}
                    onClick={() => setSelectedSessionId(summary.sessionId)}
                  >
                    <span className="session-data-session-id">{summary.sessionId}</span>
                    <span className="session-data-session-meta">
                      {summary.eventCount} {summary.eventCount === 1 ? 'event' : 'events'} · {readableTime(summary.lastEventAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="session-data-preview">
            <div className="session-data-preview-header">
              <div>
                <h3 className="session-data-section-heading">Event preview</h3>
                {selectedSummary ? <p>{selectedSummary.eventCount} validated schema events</p> : null}
              </div>
            </div>
            {error ? <p className="session-data-error" role="alert">{error}</p> : null}
            {!error && selectedSummary ? (
              <pre aria-label={`Event preview for session ${selectedSummary.sessionId}`}>{preview}</pre>
            ) : null}
            {!error && !selectedSummary ? (
              <p className="session-data-empty">Select a session to preview its events.</p>
            ) : null}
          </div>
        </div>

        <div className="session-data-actions">
          <button type="button" className="session-data-button" disabled={summaries.length === 0} onClick={() => void exportAll('jsonl')}>
            <Download aria-hidden="true" /> Export all JSONL
          </button>
          <button type="button" className="session-data-button" disabled={summaries.length === 0} onClick={() => void exportAll('csv')}>
            <Download aria-hidden="true" /> Export all CSV
          </button>
          <button type="button" className="session-data-button" disabled={!selectedSummary} onClick={() => void deleteSelected()}>
            <Trash2 aria-hidden="true" /> Delete selected
          </button>
          <button type="button" className="session-data-button danger" disabled={summaries.length === 0} onClick={() => void deleteAll()}>
            <Trash2 aria-hidden="true" /> Delete all data
          </button>
        </div>

        <footer className="session-data-footer" id="session-data-privacy">
          <p>
            Exports contain only recorded schema fields. Screenshots, base64 images, credentials,
            direct identifiers, and raw chat text are not part of Session Event v1.
          </p>
          <span className="sr-only" aria-live="polite">{announcement}</span>
        </footer>
      </section>
    </div>
  );
};

export default SessionDataPanel;
