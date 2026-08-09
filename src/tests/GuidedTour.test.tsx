// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GuidedTour from '../components/GuidedTour';

function renderSingleFrameOnboarding(
  onClose = vi.fn(),
  segmentation = true,
) {
  const onSwitchTab = vi.fn();
  const result = render(
    <>
      <div data-tour-id="ai-panel" />
      <div data-tour-id="ai-provider" />
      <div data-tour-id="teaching-levels" />
      <div data-tour-id="seg-header" />
      <div data-tour-id="seg-controls" />
      <div data-tour-id="viewer-toolbar" />
      <div data-tour-id="ai-suggestions" />
      <GuidedTour
        tourId="onboarding"
        onClose={onClose}
        onSwitchTab={onSwitchTab}
        capabilities={{ segmentation }}
      />
    </>,
  );

  return { ...result, onClose, onSwitchTab };
}

describe('GuidedTour', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses domain-neutral onboarding that works without a series rail', () => {
    renderSingleFrameOnboarding();

    const copy: string[] = [];
    for (let step = 1; step <= 7; step += 1) {
      copy.push(screen.getByRole('dialog').textContent ?? '');
      if (step < 7) fireEvent.keyDown(window, { key: 'ArrowRight' });
    }

    expect(copy.join(' ')).toMatch(/Explore the Current View/);
    expect(document.querySelector('[data-tour-id="viewer-toolbar"]')).toBeTruthy();
    expect(document.querySelector('[data-tour-id="series-rail"]')).toBeNull();
    expect(copy.join(' ')).toMatch(/vision-language model \(VLM\)/);
    expect(copy.join(' ')).not.toMatch(/FLAIR|DWI|\bT1\b|ADC|MRI sequence|pre-verified/i);
  });

  it('skips annotation steps and never opens the segment tab when the case disallows it', () => {
    const { onSwitchTab } = renderSingleFrameOnboarding(vi.fn(), false);

    const copy: string[] = [];
    for (let step = 1; step <= 5; step += 1) {
      copy.push(screen.getByRole('dialog').textContent ?? '');
      expect(screen.getByText(`${step} / 5`)).toBeTruthy();
      if (step < 5) fireEvent.keyDown(window, { key: 'ArrowRight' });
    }

    expect(copy.join(' ')).not.toMatch(/Annotation Tools|Brush & Eraser/);
    expect(onSwitchTab).not.toHaveBeenCalledWith('segment');
    expect(copy.join(' ')).toMatch(/Explore the Current View/);
    expect(copy.join(' ')).toMatch(/Suggested Questions/);
  });

  it('closes a segmentation-only tour when that capability is unavailable', async () => {
    const onClose = vi.fn();
    render(
      <GuidedTour
        tourId="seg-tour"
        onClose={onClose}
        capabilities={{ segmentation: false }}
      />,
    );

    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('keeps arrow-key navigation in bounds and closes from the final step', () => {
    const { onClose } = renderSingleFrameOnboarding();

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByText('1 / 7')).toBeTruthy();

    for (let step = 2; step <= 7; step += 1) {
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      expect(screen.getByText(`${step} / 7`)).toBeTruthy();
    }

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByText('7 / 7')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByText('6 / 7')).toBeTruthy();
  });

  it('provides a named dialog, focuses the primary action, and closes with Escape', async () => {
    const { onClose } = renderSingleFrameOnboarding();

    expect(screen.getByRole('dialog', { name: 'Welcome to CaseAttend' })).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Next' })));

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('traps focus within the tour and restores the opener when it unmounts', async () => {
    const opener = document.createElement('button');
    opener.textContent = 'Open tour';
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = renderSingleFrameOnboarding();
    const next = screen.getByRole('button', { name: 'Next' });
    await waitFor(() => expect(document.activeElement).toBe(next));

    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close tour' }));

    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(next);

    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('uses scrollable short-viewport content and 44px action targets', () => {
    renderSingleFrameOnboarding();

    const dialog = screen.getByRole('dialog');
    const card = dialog.querySelector('[class*="max-h-"]');
    expect(card?.className).toContain('overflow-y-auto');
    expect(screen.getByRole('button', { name: 'Close tour' }).className).toContain('min-h-11');
    expect(screen.getByRole('button', { name: 'End tour' }).className).toContain('min-h-11');
    expect(screen.getByRole('button', { name: 'Next' }).className).toContain('min-h-11');
  });

  it('does not claim that teaching cases have been verified', () => {
    render(<GuidedTour tourId="ai-tour" onClose={() => undefined} />);

    expect(screen.getByText('Your AI Tutor')).toBeTruthy();
    expect(screen.getByRole('dialog').textContent).not.toMatch(/pre-verified|verified teaching|reviewed teaching/i);
    expect(screen.getByRole('dialog').textContent).toMatch(/sources and provenance/i);
  });

  it('explains send-time capture in the dedicated AI tutor tour', () => {
    render(<GuidedTour tourId="ai-tour" onClose={() => undefined} />);

    for (let step = 2; step <= 4; step += 1) {
      fireEvent.keyDown(window, { key: 'ArrowRight' });
    }

    expect(screen.getByText('Suggested Questions')).toBeTruthy();
    expect(screen.getByRole('dialog').textContent).toMatch(
      /press Send.*captures the exact current view.*visible learner annotations/i,
    );
  });
});
