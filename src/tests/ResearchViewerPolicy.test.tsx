// @vitest-environment jsdom

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeToolForArtifact } from '../App';
import FloatingToolbar from '../components/FloatingToolbar';
import type { ResearchViewerPolicyV1 } from '../core/researchManifest';
import { ToolMode } from '../types';

const LOCKED_POLICY: ResearchViewerPolicyV1 = {
  version: '1.0',
  allowSeriesSwitch: false,
  allowFrameNavigation: false,
  allowWindowLevel: false,
  allowPanZoom: false,
  allowAnnotations: false,
  allowSegmentation: false,
};

describe('frozen research viewer policy', () => {
  afterEach(() => cleanup());

  it('normalizes every prohibited carried tool to pointer', () => {
    const hints = {
      showWindowLevel: true,
      showSeriesSelector: true,
      showSegmentation: true,
    };
    [
      ToolMode.SCROLL,
      ToolMode.WINDOW_LEVEL,
      ToolMode.PAN,
      ToolMode.ZOOM,
      ToolMode.MEASURE,
      ToolMode.BRUSH,
      ToolMode.ERASER,
    ].forEach((tool) => {
      expect(normalizeToolForArtifact(tool, hints, 8, LOCKED_POLICY)).toBe(ToolMode.POINTER);
    });
    expect(normalizeToolForArtifact(ToolMode.POINTER, hints, 8, LOCKED_POLICY)).toBe(ToolMode.POINTER);
  });

  it('does not expose controls forbidden by the frozen condition', () => {
    render(
      <FloatingToolbar
        activeTool={ToolMode.POINTER}
        onSelectTool={vi.fn()}
        position={{ x: 0, y: 0 }}
        onDragStart={vi.fn()}
        orientation="horizontal"
        instanceCount={8}
        artifactHints={{
          showWindowLevel: true,
          showSeriesSelector: true,
          showSegmentation: true,
        }}
        interactionPolicy={LOCKED_POLICY}
      />,
    );

    expect(screen.getByRole('button', { name: 'Select' })).toBeTruthy();
    ['Scroll', 'Contrast', 'Pan', 'Zoom', 'Paint'].forEach((name) => {
      expect(screen.queryByRole('button', { name })).toBeNull();
    });
  });
});
