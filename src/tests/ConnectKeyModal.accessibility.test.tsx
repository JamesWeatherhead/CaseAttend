// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ConnectKeyModal from '../components/ConnectKeyModal';

const connect = vi.hoisted(() => vi.fn());
vi.mock('../services/openrouterAuth', () => ({ beginOpenRouterOAuth: connect }));
vi.mock('../services/byokStore', () => ({
  hasKey: () => false, getModel: () => 'test:free', setModel: vi.fn(), clearKey: vi.fn(),
  MODEL_OPTIONS: [{ id: 'test:free', label: 'Test model' }],
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('contains keyboard focus, closes with Escape, and restores its trigger', () => {
  function Example() {
    const [open, setOpen] = useState(false);
    return <><button onClick={() => setOpen(true)}>Connect tutor</button>{open && <ConnectKeyModal onClose={() => setOpen(false)} />}</>;
  }
  render(<Example />);
  const trigger = screen.getByRole('button', { name: 'Connect tutor' });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = screen.getByRole('dialog', { name: 'Connect your AI tutor' });
  expect(document.activeElement).toBe(dialog);
  fireEvent.keyDown(dialog, { key: 'Tab' });
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
  fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Add credit' }));
  fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
  fireEvent.keyDown(dialog, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it('shows a recoverable connection error without exposing provider details', async () => {
  connect.mockRejectedValueOnce(new Error('private provider diagnostic'));
  render(<ConnectKeyModal onClose={() => undefined} />);
  fireEvent.click(screen.getByRole('button', { name: 'Continue with OpenRouter' }));
  expect((await screen.findByRole('alert')).textContent).toBe('Could not open OpenRouter. Please try again.');
  expect(screen.getByRole('button', { name: 'Continue with OpenRouter' })).toHaveProperty('disabled', false);
  expect(screen.queryByText('private provider diagnostic')).toBeNull();
});
