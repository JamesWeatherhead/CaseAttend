// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SessionDataPanel from '../components/SessionDataPanel';
import type { SessionEventV1 } from '../core/sessionEvents';
import type {
  SessionStorageStatus,
  SessionStoreApi,
  SessionSummary,
} from '../services/sessionStore';
import { SessionStore } from '../services/sessionStore';

const memoryStatus: SessionStorageStatus = {
  mode: 'memory',
  persistent: false,
  message: 'Memory-only mode. Data will be lost when this page closes.',
  reason: 'IndexedDB is unavailable for this test.',
};

const persistentStatus: SessionStorageStatus = {
  mode: 'indexeddb',
  persistent: true,
  message: 'Stored only in this browser.',
};

const sessionId = '10000000-0000-4000-8000-000000000001';
const summary: SessionSummary = {
  sessionId,
  eventCount: 1,
  firstEventAt: '2026-08-09T12:00:00.000Z',
  lastEventAt: '2026-08-09T12:00:00.000Z',
  startedAt: '2026-08-09T12:00:00.000Z',
};

const event: SessionEventV1 = {
  schema: 'caseattend.session-event',
  schemaVersion: '1.0',
  appVersion: '0.2.0',
  eventId: '30000000-0000-4000-8000-000000000003',
  sessionId,
  sequence: 0,
  occurredAt: '2026-08-09T12:00:00.000Z',
  casePackageRef: {
    id: 'derm-example',
    schemaVersion: '1.0',
    sha256: '1'.repeat(64),
  },
  lessonPlanRef: {
    id: 'derm-example-lesson',
    version: '1.0.0',
    sha256: '2'.repeat(64),
  },
  event: { type: 'session_started', startReason: 'case_opened' },
};

function mockStore(options: {
  status?: SessionStorageStatus;
  summaries?: readonly SessionSummary[];
  events?: readonly SessionEventV1[];
} = {}): SessionStoreApi {
  const status = options.status ?? persistentStatus;
  return {
    getStatus: () => status,
    subscribeStatus: () => () => undefined,
    subscribeData: () => () => undefined,
    initialize: vi.fn(async () => status),
    append: vi.fn(async () => undefined),
    listEvents: vi.fn(async () => options.events ?? []),
    listSessionSummaries: vi.fn(async () => options.summaries ?? []),
    deleteSession: vi.fn(async () => 0),
    deleteAll: vi.fn(async () => 0),
  };
}

describe('SessionDataPanel', () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    fetchSpy.mockReset();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('labels the modal, focuses its close control, and makes fallback loss visible', async () => {
    const onClose = vi.fn();
    render(<SessionDataPanel onClose={onClose} store={mockStore({ status: memoryStatus })} />);

    const dialog = screen.getByRole('dialog', { name: 'Learning session data' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByText('Stored only in this browser.')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/data will be lost when this page closes/i);
    expect(screen.getByText(/screenshots, base64 images, credentials/i)).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close session data' })));

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('exports every validated browser-local event without a network request', async () => {
    const onDownload = vi.fn();
    const store = mockStore({ summaries: [summary], events: [event] });
    render(<SessionDataPanel onClose={() => undefined} store={store} onDownload={onDownload} />);

    const exportJsonl = await screen.findByRole('button', { name: 'Export all JSONL' });
    await waitFor(() => expect(exportJsonl.hasAttribute('disabled')).toBe(false));
    fireEvent.click(exportJsonl);

    await waitFor(() => expect(onDownload).toHaveBeenCalledTimes(1));
    const [filename, contents, mimeType] = onDownload.mock.calls[0];
    expect(filename).toMatch(/^caseattend-session-events-\d{4}-\d{2}-\d{2}\.jsonl$/);
    expect(contents).toContain(`"sessionId":"${sessionId}"`);
    expect(contents.endsWith('\n')).toBe(true);
    expect(mimeType).toBe('application/x-ndjson');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refreshes the count and preview when a live session appends an event', async () => {
    const store = new SessionStore({ indexedDB: null });
    render(<SessionDataPanel onClose={() => undefined} store={store} />);
    await screen.findByText('No learning sessions are stored in this browser.');

    await act(async () => {
      await store.append(event);
    });

    await waitFor(() => {
      expect(screen.getByText((_, element) =>
        element?.classList.contains('session-data-session-meta') === true
        && element.textContent?.includes('1 event') === true)).toBeTruthy();
    });
    expect((await screen.findByLabelText(
      `Event preview for session ${sessionId}`,
    )).textContent).toContain('session_started');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('requires confirmation before deleting the selected session', async () => {
    const confirmAction = vi.fn(() => false);
    const store = mockStore({ summaries: [summary], events: [event] });
    render(
      <SessionDataPanel
        onClose={() => undefined}
        store={store}
        confirmAction={confirmAction}
      />,
    );

    const deleteSelected = await screen.findByRole('button', { name: 'Delete selected' });
    await waitFor(() => expect(deleteSelected.hasAttribute('disabled')).toBe(false));
    fireEvent.click(deleteSelected);

    await waitFor(() => {
      expect(confirmAction).toHaveBeenCalledWith(expect.stringMatching(/cannot be undone/i));
    });
    expect(store.deleteSession).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
