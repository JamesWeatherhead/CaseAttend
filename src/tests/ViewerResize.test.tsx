import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import React from 'react';
import ViewerCanvas from '../components/ViewerCanvas';
import { ToolMode, SegmentationLayer, Series } from '../types';

// Mock DOMRect for ResizeObserver
class MockDOMRect {
  x = 0; y = 0; width = 0; height = 0; top = 0; right = 0; bottom = 0; left = 0;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  toJSON() { return this; }
}

// Mock ResizeObserver
const ResizeObserverMock = vi.fn((callback) => ({
  observe: vi.fn((element) => {
    // Simulate immediate callback if needed, or save callback for manual trigger
    (element as any)._resizeCallback = callback;
  }),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

vi.stubGlobal('ResizeObserver', ResizeObserverMock);
vi.stubGlobal('requestAnimationFrame', (cb: any) => setTimeout(cb, 0));
vi.stubGlobal('cancelAnimationFrame', (id: any) => clearTimeout(id));

// Mock Canvas Context
const mockContext = {
  fillRect: vi.fn(),
  translate: vi.fn(),
  scale: vi.fn(),
  drawImage: vi.fn(),
  restore: vi.fn(),
  save: vi.fn(),
  beginPath: vi.fn(),
  strokeStyle: '',
  lineWidth: 0,
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
  fillText: vi.fn(),
  createImageData: vi.fn(() => ({ data: new Uint8ClampedArray(100) })),
  getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(100) })),
  putImageData: vi.fn(),
};

// Mock HTMLCanvasElement.getContext
HTMLCanvasElement.prototype.getContext = vi.fn(() => mockContext) as any;

describe('ViewerCanvas Resize Logic', () => {
  const mockSeries: Series = {
    id: '1.2.3',
    studyId: '1.2',
    description: 'Test Series',
    modality: 'CT',
    instanceCount: 1,
    instances: ['test-url']
  };

  const mockSegLayer: SegmentationLayer = {
    opacity: 0.5,
    isVisible: true,
    activeSegmentId: null,
    segments: [],
    brushSize: 10,
    segmentedSlices: []
  };

  const defaultProps = {
    series: mockSeries,
    activeTool: ToolMode.SCROLL,
    dicomConfig: { url: '', name: '' },
    connectionType: 'DEMO',
    sliceIndex: 0,
    onSliceChange: vi.fn(),
    measurements: [],
    onMeasurementAdd: vi.fn(),
    onMeasurementUpdate: vi.fn(),
    activeMeasurementId: null,
    segmentationLayer: mockSegLayer
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redraws the scene when container resizes', async () => {
    const { container } = render(<ViewerCanvas {...defaultProps} />);
    
    // Get the element and the registered observer callback
    const wrapperDiv = container.firstChild as HTMLDivElement;
    const observerCallback = (wrapperDiv as any)._resizeCallback;

    expect(observerCallback).toBeDefined();

    // Trigger Resize (e.g., resizing sidebar)
    const newWidth = 1024;
    const newHeight = 768;
    const entries = [{
      contentRect: new MockDOMRect(newWidth, newHeight)
    }];
    
    // Act: Fire the observer callback
    observerCallback(entries);

    // Assert: Verify that canvas attributes are updated via state change
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeTruthy();

    await waitFor(() => {
       expect(canvas?.getAttribute('width')).toBe(String(newWidth));
       expect(canvas?.getAttribute('height')).toBe(String(newHeight));
    });

    // Verify ResizeObserver was actually attached
    const observerInstance = ResizeObserverMock.mock.results[0].value;
    expect(observerInstance.observe).toHaveBeenCalledWith(wrapperDiv);
  });
});