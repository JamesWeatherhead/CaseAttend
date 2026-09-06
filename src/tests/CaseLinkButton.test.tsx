// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CaseLinkButton from '../components/CaseLinkButton';

describe('case link sharing', () => {
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, get: () => undefined });
    window.history.replaceState({}, '', '/');
  });
  afterEach(() => {
    cleanup(); vi.restoreAllMocks();
    if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
    else Reflect.deleteProperty(navigator, 'clipboard');
  });
  it('copies a query-free URL and announces success', async () => {
    const writeText = vi.fn(async () => {});
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({ writeText } as unknown as Clipboard);
    window.history.replaceState({}, '', '/?code=secret#case/case-a');
    render(<CaseLinkButton caseId="case-a" local={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy case link' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Case link copied.'));
    expect(writeText).toHaveBeenCalledWith(window.location.origin + '/#case/case-a');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('offers selectable text when clipboard permission is unavailable', async () => {
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({ writeText: vi.fn(async () => { throw new Error('denied'); }) } as unknown as Clipboard);
    render(<CaseLinkButton caseId="case-a" local={false} />);
    const button = screen.getByRole('button', { name: 'Copy case link' });
    button.focus();
    fireEvent.click(button);
    const input = await screen.findByRole('textbox', { name: 'Case link' }) as HTMLInputElement;
    expect(input.value).toBe(window.location.origin + '/#case/case-a');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
    await waitFor(() => expect(document.activeElement).toBe(input));
    expect(input.selectionEnd).toBe(input.value.length);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('explains that a local link does not transfer the teaching material', async () => {
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({ writeText: vi.fn(async () => {}) } as unknown as Clipboard);
    render(<CaseLinkButton caseId="local-case" local />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy case link for this browser' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('export its .caseattend file');
  });
});
