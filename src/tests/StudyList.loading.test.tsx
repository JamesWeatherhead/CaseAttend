// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StudyList from '../components/StudyList';

const mocks = vi.hoisted(() => ({
  searchDicomWebStudies: vi.fn(),
}));

vi.mock('../services/dicomService', () => ({
  searchDicomWebStudies: mocks.searchDicomWebStudies,
}));

vi.mock('../services/openrouterAuth', () => ({
  beginOpenRouterOAuth: vi.fn(),
}));

vi.mock('../services/byokStore', () => ({
  BYOK_CHANGED_EVENT: 'caseattend:byok-changed',
  hasKey: () => false,
}));

describe('StudyList case loading', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows a recoverable error instead of spinning forever when the registry rejects', async () => {
    mocks.searchDicomWebStudies
      .mockRejectedValueOnce(new Error('registry unavailable'))
      .mockResolvedValueOnce([]);

    render(
      <StudyList
        onSelectStudy={() => undefined}
        connectionType="DICOMWEB"
        setConnectionType={() => undefined}
        dicomConfig={{ url: 'local', name: 'Built-in cases' }}
        setDicomConfig={() => undefined}
      />,
    );

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Cases could not be loaded. Your browser-local session data is still available.',
    );
    expect(screen.queryByRole('status', { name: 'Loading cases' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Try loading cases again' }));
    await waitFor(() => expect(mocks.searchDicomWebStudies).toHaveBeenCalledTimes(2));
    await screen.findByText('Cases');
  });
});
