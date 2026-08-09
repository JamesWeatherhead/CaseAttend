// @vitest-environment jsdom

import React, { createRef } from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ViewerCanvas from '../components/ViewerCanvas';
import {
  ToolMode,
  type AiPointer,
  type Measurement,
  type SegmentationLayer,
  type Series,
  type ViewerHandle,
} from '../types';

const dicomMocks = vi.hoisted(() => ({
  fetchDicomImageBlob: vi.fn(),
  prefetchImage: vi.fn(),
}));

vi.mock('../services/dicomService', () => dicomMocks);

type CanvasOperation = {
  name: string;
  args: unknown[];
};

type CanvasState = {
  operations: CanvasOperation[];
  copiedOperations: CanvasOperation[];
  filter: string;
};

type ExportRecord = {
  filter: string;
  sourceOperations: CanvasOperation[];
};

const canvasStates = new WeakMap<HTMLCanvasElement, CanvasState>();
const exportRecords: ExportRecord[] = [];

function stateFor(canvas: HTMLCanvasElement): CanvasState {
  let state = canvasStates.get(canvas);
  if (!state) {
    state = { operations: [], copiedOperations: [], filter: 'none' };
    canvasStates.set(canvas, state);
  }
  return state;
}

function fakeContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const state = stateFor(canvas);
  const record = (name: string, ...args: unknown[]) => {
    state.operations.push({ name, args });
  };
  const context = {
    canvas,
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    font: '10px sans-serif',
    shadowColor: 'transparent',
    shadowBlur: 0,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'low',
    get filter() {
      return state.filter;
    },
    set filter(value: string) {
      state.filter = value;
    },
    fillRect(x: number, y: number, width: number, height: number) {
      // renderScene starts each complete frame with a full-canvas black fill.
      // Resetting here lets each export assert against only the submitted frame.
      if (x === 0 && y === 0 && width === canvas.width && height === canvas.height) {
        state.operations = [];
      }
      record('fillRect', x, y, width, height);
    },
    drawImage(source: CanvasImageSource, ...args: number[]) {
      if (source instanceof HTMLCanvasElement) {
        state.copiedOperations = [...stateFor(source).operations];
      }
      record('drawImage', source, ...args);
    },
    save: () => record('save'),
    restore: () => record('restore'),
    translate: (x: number, y: number) => record('translate', x, y),
    scale: (x: number, y: number) => record('scale', x, y),
    beginPath: () => record('beginPath'),
    moveTo: (x: number, y: number) => record('moveTo', x, y),
    lineTo: (x: number, y: number) => record('lineTo', x, y),
    stroke: () => record('stroke'),
    fill: () => record('fill'),
    arc: (...args: number[]) => record('arc', ...args),
    fillText: (text: string, x: number, y: number) => record('fillText', text, x, y),
    measureText: (text: string) => ({ width: text.length * 8 }),
    createRadialGradient: () => ({ addColorStop: vi.fn() }),
    createImageData: (width: number, height: number) => ({
      width,
      height,
      colorSpace: 'srgb',
      data: new Uint8ClampedArray(width * height * 4),
    }),
    getImageData: (_x: number, _y: number, width: number, height: number) => ({
      width,
      height,
      colorSpace: 'srgb',
      data: new Uint8ClampedArray(width * height * 4),
    }),
    putImageData: (...args: unknown[]) => record('putImageData', ...args),
  };
  return context as unknown as CanvasRenderingContext2D;
}

class ControlledImage {
  static instances: ControlledImage[] = [];

  width = 200;
  height = 100;
  onload: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  private source = '';

  constructor() {
    ControlledImage.instances.push(this);
  }

  set src(value: string) {
    this.source = value;
  }

  get src() {
    return this.source;
  }

  resolve() {
    this.onload?.(new Event('load'));
  }
}

class NoopResizeObserver {
  observe() {}
  disconnect() {}
}

const series: Series = {
  id: 'case-a:axial',
  studyId: 'case-a',
  description: 'Axial stack',
  modality: 'CT',
  instanceCount: 2,
  instances: ['/frame-0.png', '/frame-1.png'],
};

const segmentationLayer: SegmentationLayer = {
  opacity: 0.5,
  isVisible: true,
  activeSegmentId: 1,
  segments: [{ id: 1, label: 'Learner mark', color: [239, 68, 68], isVisible: true }],
  brushSize: 12,
  segmentedSlices: [],
};

function viewerProps(overrides: Partial<React.ComponentProps<typeof ViewerCanvas>> = {}) {
  return {
    series,
    activeTool: ToolMode.POINTER,
    dicomConfig: { url: '', name: 'Built-in cases' },
    connectionType: 'DEMO',
    sliceIndex: 0,
    onSliceChange: vi.fn(),
    measurements: [] as Measurement[],
    onMeasurementAdd: vi.fn(),
    onMeasurementUpdate: vi.fn(),
    activeMeasurementId: null,
    segmentationLayer,
    ...overrides,
  } satisfies React.ComponentProps<typeof ViewerCanvas>;
}

async function waitForImage(index: number) {
  await waitFor(() => expect(ControlledImage.instances.length).toBeGreaterThan(index));
}

async function resolveImage(index: number) {
  await act(async () => {
    ControlledImage.instances[index].resolve();
    await Promise.resolve();
  });
}

describe('ViewerCanvas captureCurrentView', () => {
  it('exposes the neutral Case Package description to assistive technology', () => {
    const view = render(<ViewerCanvas {...viewerProps({
      accessibleDescription: 'Neutral description of the visible teaching image.',
    })} />);
    const canvas = view.getByRole('img');
    const descriptionId = canvas.getAttribute('aria-describedby');
    expect(descriptionId).toBeTruthy();
    expect(document.getElementById(String(descriptionId))?.textContent).toContain(
      'Neutral description of the visible teaching image.',
    );
  });

  beforeEach(() => {
    ControlledImage.instances = [];
    exportRecords.length = 0;
    dicomMocks.fetchDicomImageBlob.mockReset();
    dicomMocks.fetchDicomImageBlob.mockResolvedValue(new Blob(['frame'], { type: 'image/png' }));
    dicomMocks.prefetchImage.mockReset();

    vi.stubGlobal('Image', ControlledImage);
    vi.stubGlobal('ResizeObserver', NoopResizeObserver);
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn((blob: Blob) => `blob:${blob.size}:${ControlledImage.instances.length}`),
      revokeObjectURL: vi.fn(),
    });

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
      return fakeContext(this) as never;
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function (this: HTMLCanvasElement) {
      const state = stateFor(this);
      exportRecords.push({
        filter: state.filter,
        sourceOperations: [...state.copiedOperations],
      });
      return `data:image/jpeg;base64,export-${exportRecords.length}`;
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('fails closed while a requested frame is loading and ignores a stale frame completion', async () => {
    const ref = createRef<ViewerHandle>();
    const { rerender } = render(<ViewerCanvas ref={ref} {...viewerProps()} />);

    expect(ref.current?.captureCurrentView()).toBeNull();
    await waitForImage(0);

    rerender(<ViewerCanvas ref={ref} {...viewerProps({ sliceIndex: 1 })} />);
    expect(ref.current?.captureCurrentView()).toBeNull();
    await waitForImage(1);

    await resolveImage(0);
    expect(ref.current?.captureCurrentView()).toBeNull();

    await resolveImage(1);
    expect(ref.current?.captureCurrentView()).toMatchObject({
      seriesId: 'case-a:axial',
      frameIndex: 1,
      frameCount: 2,
    });
  });

  it('fails closed when the rendered canvas has no pixel area', async () => {
    const ref = createRef<ViewerHandle>();
    const { container } = render(<ViewerCanvas ref={ref} {...viewerProps()} />);
    await waitForImage(0);
    await resolveImage(0);

    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    canvas!.width = 0;
    canvas!.height = 0;

    expect(ref.current?.captureCurrentView()).toBeNull();
    expect(exportRecords).toHaveLength(0);
  });

  it('hides slice navigation chrome for any single-frame series but keeps center view', () => {
    const singleFrameSeries: Series = {
      ...series,
      id: 'case-a:clinical-photo',
      description: 'Clinical photograph',
      modality: 'PHOTO',
      instanceCount: 1,
      instances: ['/clinical-photo.png'],
    };
    const { getByRole, queryByTestId, rerender } = render(
      <ViewerCanvas {...viewerProps({ series: singleFrameSeries })} />,
    );

    expect(getByRole('button', { name: 'Center view' })).toBeTruthy();
    expect(queryByTestId('slice-scrollbar')).toBeNull();
    expect(queryByTestId('frame-counter')).toBeNull();

    rerender(<ViewerCanvas {...viewerProps({ series })} />);
    expect(queryByTestId('slice-scrollbar')).toBeTruthy();
    expect(queryByTestId('frame-counter')?.textContent).toContain('Image: 1 / 2');
    expect(getByRole('button', { name: 'Center view' })).toBeTruthy();
  });

  it('bakes the visible window and level filter into the exported pixels', async () => {
    const ref = createRef<ViewerHandle>();
    const { container } = render(
      <ViewerCanvas ref={ref} {...viewerProps({ activeTool: ToolMode.WINDOW_LEVEL })} />,
    );
    await waitForImage(0);
    await resolveImage(0);

    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    fireEvent.mouseDown(canvas!, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.mouseMove(canvas!, { clientX: 150, clientY: 110 });
    fireEvent.mouseUp(canvas!);

    await waitFor(() => {
      expect(canvas!.style.filter).toBe('contrast(80%) brightness(104%)');
    });
    expect(ref.current?.captureCurrentView()).not.toBeNull();
    expect(exportRecords.at(-1)?.filter).toBe(canvas!.style.filter);
    expect(exportRecords.at(-1)?.filter).not.toBe('none');
  });

  it('retains learner measurements, segmentation, and audit timing in the submitted frame', async () => {
    const ref = createRef<ViewerHandle>();
    const measurement: Measurement = {
      id: 'learner-measurement',
      start: { x: 20, y: 20 },
      end: { x: 60, y: 20 },
      value: 20,
      sliceIndex: 0,
      label: 'Learner lesion',
      createdAt: 1,
    };
    const lastChangedAt = '2026-08-09T12:00:00.000Z';
    const onAnnotationMutation = vi.fn();
    const { container } = render(
      <ViewerCanvas
        ref={ref}
        {...viewerProps({
          activeTool: ToolMode.BRUSH,
          measurements: [measurement],
          getAnnotationAudit: () => ({ revision: 4, lastChangedAt }),
          onAnnotationMutation,
        })}
      />,
    );
    await waitForImage(0);
    await resolveImage(0);

    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    fireEvent.mouseDown(canvas!, { button: 0, clientX: 400, clientY: 300 });
    fireEvent.mouseMove(canvas!, { clientX: 410, clientY: 305 });
    fireEvent.mouseUp(canvas!);
    expect(onAnnotationMutation).toHaveBeenCalledTimes(2);

    const capture = ref.current?.captureCurrentView();
    expect(capture?.annotation).toEqual({
      present: true,
      measurementCount: 1,
      segmentedFrameCount: 1,
      activeFrameLabelCount: 1,
      revision: 4,
      lastChangedAt,
    });
    const exportedText = exportRecords.at(-1)?.sourceOperations
      .filter((operation) => operation.name === 'fillText')
      .map((operation) => operation.args[0]);
    expect(exportedText).toContain('Learner lesion: 10.0 mm');
  });

  it('enforces frozen viewer permissions inside the canvas and omits overlays when configured', async () => {
    const ref = createRef<ViewerHandle>();
    const onSliceChange = vi.fn();
    const onAnnotationMutation = vi.fn();
    const measurement: Measurement = {
      id: 'hidden-measurement',
      start: { x: 20, y: 20 },
      end: { x: 60, y: 20 },
      value: 20,
      sliceIndex: 0,
      label: 'Must not be submitted',
      createdAt: 1,
    };
    const { container } = render(
      <ViewerCanvas ref={ref} {...viewerProps({
        activeTool: ToolMode.BRUSH,
        measurements: [measurement],
        onSliceChange,
        onAnnotationMutation,
        includeAnnotationsInCapture: false,
        interactionPolicy: {
          allowFrameNavigation: false,
          allowWindowLevel: false,
          allowPanZoom: false,
          allowAnnotations: false,
          allowSegmentation: false,
        },
      })} />,
    );
    await waitForImage(0);
    await resolveImage(0);

    const canvas = container.querySelector('canvas')!;
    expect(canvas.getAttribute('aria-label')).toContain('Viewer keyboard controls are frozen for this study.');
    expect(canvas.getAttribute('aria-label')).not.toContain('Use arrow keys');
    expect(canvas.getAttribute('aria-label')).not.toContain('plus or minus');
    expect(canvas.style.touchAction).toBe('pan-y pinch-zoom');
    expect(container.querySelector('[data-testid="slice-scrollbar"]')).toBeNull();
    fireEvent.mouseDown(canvas, { button: 0, clientX: 400, clientY: 300 });
    fireEvent.mouseUp(canvas);
    fireEvent.wheel(canvas, { deltaY: 100 });
    fireEvent.keyDown(canvas, { key: 'ArrowRight' });

    expect(onAnnotationMutation).not.toHaveBeenCalled();
    expect(onSliceChange).not.toHaveBeenCalled();
    expect(ref.current?.captureCurrentView()?.annotation.measurementCount).toBe(1);
    const exportedText = exportRecords.at(-1)?.sourceOperations
      .filter((operation) => operation.name === 'fillText')
      .map((operation) => operation.args[0]);
    expect(exportedText).not.toContain('Must not be submitted');
  });

  it('announces only the keyboard controls available for the current series and policy', () => {
    const { getByRole, rerender } = render(<ViewerCanvas {...viewerProps()} />);
    expect(getByRole('img').getAttribute('aria-label')).toContain('Use arrow keys, Home, or End to change views.');
    expect(getByRole('img').getAttribute('aria-label')).toContain('Use plus or minus to zoom.');

    rerender(<ViewerCanvas {...viewerProps({
      isScrollEnabled: false,
      interactionPolicy: {
        allowFrameNavigation: false,
        allowWindowLevel: true,
        allowPanZoom: true,
        allowAnnotations: true,
        allowSegmentation: true,
      },
    })} />);
    expect(getByRole('img').getAttribute('aria-label')).not.toContain('Use arrow keys');
    expect(getByRole('img').getAttribute('aria-label')).toContain('Use plus or minus to zoom.');
  });

  it('keeps series-level segmentation presence valid on a clean current frame', async () => {
    const ref = createRef<ViewerHandle>();
    const { container, rerender } = render(
      <ViewerCanvas ref={ref} {...viewerProps({ activeTool: ToolMode.BRUSH })} />,
    );
    await waitForImage(0);
    await resolveImage(0);

    const canvas = container.querySelector('canvas');
    fireEvent.mouseDown(canvas!, { button: 0, clientX: 400, clientY: 300 });
    fireEvent.mouseUp(canvas!);

    rerender(<ViewerCanvas ref={ref} {...viewerProps({ sliceIndex: 1 })} />);
    await waitForImage(1);
    await resolveImage(1);

    expect(ref.current?.captureCurrentView()?.annotation).toMatchObject({
      present: true,
      segmentedFrameCount: 1,
      activeFrameLabelCount: 0,
    });
  });

  it('treats a brush click wholly outside the image as an annotation no-op', async () => {
    const ref = createRef<ViewerHandle>();
    const onAnnotationMutation = vi.fn();
    const onSegmentedSliceUpdate = vi.fn();
    const { container } = render(
      <ViewerCanvas
        ref={ref}
        {...viewerProps({
          activeTool: ToolMode.BRUSH,
          onAnnotationMutation,
          onSegmentedSliceUpdate,
        })}
      />,
    );
    await waitForImage(0);
    await resolveImage(0);

    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    fireEvent.mouseDown(canvas!, { button: 0, clientX: -1_000, clientY: -1_000 });
    fireEvent.mouseUp(canvas!);

    expect(onAnnotationMutation).not.toHaveBeenCalled();
    expect(onSegmentedSliceUpdate).not.toHaveBeenCalled();
    expect(ref.current?.captureCurrentView()?.annotation).toMatchObject({
      present: false,
      segmentedFrameCount: 0,
      activeFrameLabelCount: 0,
    });
  });

  it('does not create segmentation metadata for a missing active segment', async () => {
    const ref = createRef<ViewerHandle>();
    const onAnnotationMutation = vi.fn();
    const onSegmentedSliceUpdate = vi.fn();
    const { container } = render(
      <ViewerCanvas
        ref={ref}
        {...viewerProps({
          activeTool: ToolMode.BRUSH,
          segmentationLayer: { ...segmentationLayer, activeSegmentId: 999 },
          onAnnotationMutation,
          onSegmentedSliceUpdate,
        })}
      />,
    );
    await waitForImage(0);
    await resolveImage(0);

    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    fireEvent.mouseDown(canvas!, { button: 0, clientX: 400, clientY: 300 });
    fireEvent.mouseUp(canvas!);

    expect(onAnnotationMutation).not.toHaveBeenCalled();
    expect(onSegmentedSliceUpdate).not.toHaveBeenCalled();
    expect(ref.current?.captureCurrentView()?.annotation).toMatchObject({
      present: false,
      segmentedFrameCount: 0,
      activeFrameLabelCount: 0,
    });
  });

  it('treats an eraser stroke over a blank mask as an annotation no-op', async () => {
    const ref = createRef<ViewerHandle>();
    const onAnnotationMutation = vi.fn();
    const onSegmentedSliceUpdate = vi.fn();
    const { container } = render(
      <ViewerCanvas
        ref={ref}
        {...viewerProps({
          activeTool: ToolMode.ERASER,
          onAnnotationMutation,
          onSegmentedSliceUpdate,
        })}
      />,
    );
    await waitForImage(0);
    await resolveImage(0);

    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    fireEvent.mouseDown(canvas!, { button: 0, clientX: 400, clientY: 300 });
    fireEvent.mouseMove(canvas!, { clientX: 410, clientY: 305 });
    fireEvent.mouseUp(canvas!);

    expect(onAnnotationMutation).not.toHaveBeenCalled();
    expect(onSegmentedSliceUpdate).not.toHaveBeenCalled();
    expect(ref.current?.captureCurrentView()?.annotation).toMatchObject({
      present: false,
      segmentedFrameCount: 0,
      activeFrameLabelCount: 0,
    });
  });

  it('supports keyboard frame navigation without exposing a slice rail for one frame', () => {
    const onSliceChange = vi.fn();
    const { container, rerender } = render(
      <ViewerCanvas {...viewerProps({ onSliceChange })} />,
    );
    const canvas = container.querySelector('canvas');
    expect(canvas?.getAttribute('role')).toBe('img');

    fireEvent.keyDown(canvas!, { key: 'ArrowRight' });
    expect(onSliceChange).toHaveBeenCalledWith(1);

    const singleFrameSeries = { ...series, instanceCount: 1, instances: ['/frame-0.png'] };
    onSliceChange.mockClear();
    rerender(<ViewerCanvas {...viewerProps({ series: singleFrameSeries, onSliceChange })} />);
    fireEvent.keyDown(container.querySelector('canvas')!, { key: 'ArrowRight' });
    expect(onSliceChange).not.toHaveBeenCalled();
  });

  it('excludes transient AI pointers from export while restoring them in the visible viewer', async () => {
    const ref = createRef<ViewerHandle>();
    const pointers: AiPointer[] = [{ x: 50, y: 50, label: 'TRANSIENT AI POINTER' }];
    const { container } = render(
      <ViewerCanvas ref={ref} {...viewerProps({ aiPointers: pointers })} />,
    );
    await waitForImage(0);
    await resolveImage(0);

    expect(ref.current?.captureCurrentView()).not.toBeNull();
    const exportedText = exportRecords.at(-1)?.sourceOperations
      .filter((operation) => operation.name === 'fillText')
      .map((operation) => operation.args[0]);
    expect(exportedText).not.toContain('TRANSIENT AI POINTER');

    const visibleCanvas = container.querySelector('canvas');
    const visibleText = visibleCanvas
      ? stateFor(visibleCanvas).operations
          .filter((operation) => operation.name === 'fillText')
          .map((operation) => operation.args[0])
      : [];
    expect(visibleText).toContain('TRANSIENT AI POINTER');
  });
});
