// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import type { CasePackageV1 } from '../core/casePackage';
import { ToolMode, type Measurement, type SegmentationLayer, type Series } from '../types';

const mocks = vi.hoisted(() => {
  const makeCase = (id: string, title: string) => ({
    schemaVersion: '1.0',
    id,
    title,
    domain: 'radiology',
    artifactHints: {
      showWindowLevel: true,
      showSeriesSelector: true,
      showSegmentation: true,
    },
    neutralDescription: `${title} neutral description`,
    contentWarnings: [`${title} content warning`],
    teachingNotes: [`${title} teaching note`],
    lessonPlanRef: {
      id: `${id}-lesson`,
      version: '1.0.0',
      sha256: '2'.repeat(64),
    },
    manifest: {
      algorithm: 'SHA-256',
      sha256: '1'.repeat(64),
    },
  }) as unknown as CasePackageV1;

  return {
    caseA: makeCase('case-a', 'Case A'),
    caseB: {
      ...makeCase('case-b', 'Case B'),
      artifactHints: {
        showWindowLevel: false,
        showSeriesSelector: true,
        showSegmentation: false,
      },
    },
    fetchDicomWebSeries: vi.fn(),
    getCasePackage: vi.fn(),
    aiProps: vi.fn(),
    browserTeachingEngine: { runTurn: vi.fn() },
  };
});

vi.mock('../services/dicomService', () => ({
  fetchDicomWebSeries: mocks.fetchDicomWebSeries,
}));

vi.mock('../services/browserTeachingEngine', () => ({
  browserTeachingEngine: mocks.browserTeachingEngine,
}));

vi.mock('../data/caseRegistry', () => ({
  primaryCaseModality: () => 'CT',
  getCasePackage: mocks.getCasePackage,
}));

vi.mock('../services/openrouterAuth', () => ({
  completeOpenRouterOAuth: vi.fn(),
  pendingOAuthCode: () => null,
}));

vi.mock('../components/StudyList', () => ({
  default: ({ onSelectStudy, onOpenSessionData }: { onSelectStudy: (casePackage: CasePackageV1) => void; onOpenSessionData: () => void }) => (
    <main>
      <button type="button" onClick={onOpenSessionData}>Open browser-local session data</button>
      <button type="button" onClick={() => onSelectStudy(mocks.caseA)}>Open Case A</button>
      <button type="button" onClick={() => onSelectStudy(mocks.caseB)}>Open Case B</button>
    </main>
  ),
}));

vi.mock('../components/ViewerCanvas', () => ({
  default: ({
    series,
    measurements,
    onMeasurementAdd,
    getAnnotationAudit,
    segmentationLayer,
  }: {
    series: Series | null;
    measurements: Measurement[];
    onMeasurementAdd: (measurement: Measurement) => void;
    getAnnotationAudit?: () => { revision: number };
    segmentationLayer: SegmentationLayer;
  }) => (
    <div>
      <div data-testid="active-series">{series?.id ?? 'none'}</div>
      <div data-testid="measurement-count">{measurements.length}</div>
      <div data-testid="annotation-revision">{getAnnotationAudit?.().revision ?? 0}</div>
      <div data-testid="annotation-overlay-visible">{String(segmentationLayer.isVisible)}</div>
      <button
        type="button"
        disabled={!series}
        onClick={() => onMeasurementAdd({
          id: 'test-measurement',
          start: { x: 0, y: 0 },
          end: { x: 10, y: 0 },
          value: 10,
          sliceIndex: 0,
          createdAt: 1,
        })}
      >
        Add test measurement
      </button>
    </div>
  ),
}));

vi.mock('../components/SeriesSelector', () => ({
  default: ({ seriesList }: { seriesList: Series[] }) => (
    <div data-testid="series-list">{seriesList.map((series) => series.id).join(',')}</div>
  ),
}));

vi.mock('../components/AiAssistantPanel', () => ({
  default: (props: unknown) => {
    mocks.aiProps(props);
    return <div>AI panel</div>;
  },
}));
vi.mock('../components/FloatingToolbar', () => ({
  default: ({
    activeTool,
    onSelectTool,
  }: {
    activeTool: ToolMode;
    onSelectTool: (tool: ToolMode) => void;
  }) => (
    <div>
      <output data-testid="active-tool">{activeTool}</output>
      {[
        ToolMode.WINDOW_LEVEL,
        ToolMode.BRUSH,
        ToolMode.ERASER,
        ToolMode.SCROLL,
      ].map((tool) => (
        <button key={tool} type="button" onClick={() => onSelectTool(tool)}>
          Select {tool}
        </button>
      ))}
    </div>
  ),
}));
vi.mock('../components/GuidedTour', () => ({ default: () => null }));
vi.mock('../components/LessonBuilder', () => ({ default: () => null }));
vi.mock('../components/MeasurementPanel', () => ({ default: () => null }));
vi.mock('../components/SegmentationPanel', () => ({ default: () => null }));
vi.mock('../components/SessionDataPanel', () => ({ default: () => null }));
vi.mock('../components/SafetyModal', () => ({ default: () => null }));

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function series(id: string, studyId: string): Series {
  return {
    id,
    studyId,
    description: id,
    modality: 'CT',
    instanceCount: 1,
    instances: [`/${id}.png`],
  };
}

async function openCase(label: 'Open Case A' | 'Open Case B'): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: label }));
  await waitFor(() => expect(mocks.fetchDicomWebSeries).toHaveBeenCalled());
}

async function returnToCatalog(): Promise<void> {
  fireEvent.click(screen.getByTitle('Back to study list'));
  await screen.findByRole('button', { name: 'Open Case A' });
}

describe('App study-series loading', () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    localStorage.clear();
    localStorage.setItem('caseattend.guidedTour.completed', 'true');
    mocks.fetchDicomWebSeries.mockReset();
    mocks.getCasePackage.mockReset().mockImplementation(async id => id === mocks.caseA.id ? mocks.caseA : id === mocks.caseB.id ? mocks.caseB : null);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps browser-local session data available from the catalog shell', () => {
    render(<App />);
    expect(screen.getByRole('button', {
      name: 'Open browser-local session data',
    })).toBeTruthy();
  });

  it('opens a bookmarked case on mount and focuses its heading', async () => {
    window.history.replaceState({}, '', '/#case/case-b');
    mocks.fetchDicomWebSeries.mockResolvedValue([series('series-b', mocks.caseB.id)]);
    render(<App />);
    const heading = await screen.findByRole('heading', { name: 'Case B' });
    expect(document.activeElement).toBe(heading);
    await waitFor(() => expect(screen.getByTestId('active-series').textContent).toBe('series-b'));
    expect(mocks.fetchDicomWebSeries).toHaveBeenCalledWith(expect.anything(), mocks.caseB.id, mocks.caseB);
    await returnToCatalog();
    expect(window.location.hash).toBe('');
  });

  it('shows a missing case without falling through to a different lesson', async () => {
    window.history.replaceState({}, '', '/#case/missing-case');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'This case isn’t available here' })).toBeTruthy();
    expect(mocks.fetchDicomWebSeries).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Back to cases' }));
    expect(await screen.findByRole('button', { name: 'Open Case A' })).toBeTruthy();
  });

  it('lets the learner retry a failed image-series load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.fetchDicomWebSeries.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce([series('series-a', mocks.caseA.id)]);
    render(<App />);
    await openCase('Open Case A');
    fireEvent.click(await screen.findByRole('button', { name: 'Try loading the image again' }));
    await waitFor(() => expect(screen.getByTestId('active-series').textContent).toBe('series-a'));
    expect(screen.queryByRole('button', { name: 'Try loading the image again' })).toBeNull();
  });

  it('supplies the public-core browser engine to the ordinary tutor panel', async () => {
    mocks.fetchDicomWebSeries.mockResolvedValueOnce([series('series-a', mocks.caseA.id)]);
    render(<App />);
    await openCase('Open Case A');
    await waitFor(() => expect(mocks.aiProps).toHaveBeenCalled());
    expect(mocks.aiProps.mock.lastCall?.[0]).toMatchObject({
      teachingEngine: mocks.browserTeachingEngine,
    });
    expect(screen.getByRole('note', { name: 'Case content warning' }).textContent)
      .toContain('Case A content warning');
  });

  it('renders in hardened browser contexts where preference storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage is blocked.', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage is blocked.', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('Storage is blocked.', 'SecurityError');
    });

    expect(() => render(<App />)).not.toThrow();
    expect(screen.getByRole('button', {
      name: 'Open browser-local session data',
    })).toBeTruthy();
  });

  it('does not let a stale Case A success overwrite Case B after returning to the catalog', async () => {
    const caseA = deferred<Series[]>();
    const caseB = deferred<Series[]>();
    mocks.fetchDicomWebSeries.mockImplementation((_config, studyId: string) => {
      return studyId === mocks.caseA.id ? caseA.promise : caseB.promise;
    });

    render(<App />);
    await openCase('Open Case A');
    await returnToCatalog();
    await openCase('Open Case B');

    await act(async () => {
      caseB.resolve([series('series-b', mocks.caseB.id)]);
      await caseB.promise;
    });
    await waitFor(() => expect(screen.getByTestId('active-series').textContent).toBe('series-b'));

    await act(async () => {
      caseA.resolve([series('series-a', mocks.caseA.id)]);
      await caseA.promise;
    });

    expect(screen.getByTestId('active-series').textContent).toBe('series-b');
    expect(screen.getByTestId('series-list').textContent).toBe('series-b');
  });

  it('ignores a stale Case A failure after Case B has loaded', async () => {
    const caseA = deferred<Series[]>();
    const caseB = deferred<Series[]>();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.fetchDicomWebSeries.mockImplementation((_config, studyId: string) => {
      return studyId === mocks.caseA.id ? caseA.promise : caseB.promise;
    });

    render(<App />);
    await openCase('Open Case A');
    await returnToCatalog();
    await openCase('Open Case B');

    await act(async () => {
      caseB.resolve([series('series-b', mocks.caseB.id)]);
      await caseB.promise;
    });
    await waitFor(() => expect(screen.getByTestId('active-series').textContent).toBe('series-b'));

    await act(async () => {
      caseA.reject(new Error('stale Case A failure'));
      await caseA.promise.catch(() => undefined);
    });

    expect(screen.getByTestId('active-series').textContent).toBe('series-b');
    expect(screen.getByTestId('series-list').textContent).toBe('series-b');
    expect(consoleError).not.toHaveBeenCalledWith(
      'Error loading series',
      expect.objectContaining({ message: 'stale Case A failure' }),
    );
  });

  it('does not retain measurements after leaving and reopening the same case with a reset audit clock', async () => {
    mocks.fetchDicomWebSeries.mockImplementation((_config, studyId: string) => (
      Promise.resolve([series(`series-${studyId}`, studyId)])
    ));

    render(<App />);
    await openCase('Open Case A');
    await waitFor(() => expect(screen.getByTestId('active-series').textContent).toBe('series-case-a'));

    fireEvent.click(screen.getByRole('button', { name: 'Add test measurement' }));
    await waitFor(() => {
      expect(screen.getByTestId('measurement-count').textContent).toBe('1');
      expect(screen.getByTestId('annotation-revision').textContent).toBe('1');
    });

    await returnToCatalog();
    fireEvent.click(screen.getByRole('button', { name: 'Open Case A' }));
    await waitFor(() => expect(screen.getByTestId('active-series').textContent).toBe('series-case-a'));

    expect(screen.getByTestId('measurement-count').textContent).toBe('0');
    expect(screen.getByTestId('annotation-revision').textContent).toBe('0');
  });

  it.each([
    ToolMode.WINDOW_LEVEL,
    ToolMode.BRUSH,
    ToolMode.ERASER,
    ToolMode.SCROLL,
  ])('does not carry disallowed %s state into a restricted single-frame case', async (tool) => {
    mocks.fetchDicomWebSeries.mockImplementation((_config, studyId: string) => {
      const loadedSeries = series(`series-${studyId}`, studyId);
      if (studyId === mocks.caseA.id) {
        loadedSeries.instanceCount = 3;
        loadedSeries.instances = ['/frame-0.png', '/frame-1.png', '/frame-2.png'];
      }
      return Promise.resolve([loadedSeries]);
    });

    render(<App />);
    await openCase('Open Case A');
    await waitFor(() => expect(screen.getByTestId('active-series').textContent).toBe('series-case-a'));

    fireEvent.click(screen.getByRole('button', { name: `Select ${tool}` }));
    await waitFor(() => expect(screen.getByTestId('active-tool').textContent).toBe(tool));

    await returnToCatalog();
    await openCase('Open Case B');
    await waitFor(() => expect(screen.getByTestId('active-series').textContent).toBe('series-case-b'));
    await waitFor(() => expect(screen.getByTestId('active-tool').textContent).toBe(ToolMode.POINTER));

    // Even an indirect stale control cannot reactivate a capability that the
    // destination case package does not expose.
    fireEvent.click(screen.getByRole('button', { name: `Select ${tool}` }));
    expect(screen.getByTestId('active-tool').textContent).toBe(ToolMode.POINTER);
  });

  it('forces the viewer annotation overlay off when artifact hints disallow it', async () => {
    mocks.fetchDicomWebSeries.mockImplementation((_config, studyId: string) => (
      Promise.resolve([series(`series-${studyId}`, studyId)])
    ));

    render(<App />);
    await openCase('Open Case B');
    await waitFor(() => expect(screen.getByTestId('active-series').textContent).toBe('series-case-b'));

    expect(screen.getByTestId('annotation-overlay-visible').textContent).toBe('false');
    expect(screen.queryByRole('button', { name: /Annotate/i })).toBeNull();
  });

  it('stacks scrollable nonzero viewer and tutor panes on narrow screens', async () => {
    mocks.fetchDicomWebSeries.mockImplementation((_config, studyId: string) => (
      Promise.resolve([series(`series-${studyId}`, studyId)])
    ));

    render(<App />);
    await openCase('Open Case A');

    expect(screen.getByTestId('case-workspace').className).toContain('flex-col');
    expect(screen.getByTestId('case-workspace').className).toContain('md:flex-row');
    expect(screen.getByTestId('case-workspace').className).toContain('overflow-y-auto');
    expect(screen.getByTestId('case-viewer-pane').className).toContain('min-h-[20rem]');
    expect(screen.getByTestId('case-tutor-pane').className).toContain('min-h-[36rem]');
    expect(screen.getByTestId('case-tutor-pane').className).toContain('w-full');
    expect(screen.getByTestId('case-resize-divider').className).toContain('hidden md:flex');
  });
});
