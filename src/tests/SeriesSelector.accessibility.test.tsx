// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SeriesSelector from '../components/SeriesSelector';
import type { Series } from '../types';

vi.mock('../services/dicomService', () => ({
  fetchDicomImageBlob: vi.fn(async () => new Blob(['image'], { type: 'image/jpeg' })),
}));

const series: Series[] = [
  {
    id: 'study:flair',
    studyId: 'study',
    description: 'FLAIR',
    modality: 'MR',
    instanceCount: 2,
    instances: ['/one.jpg', '/two.jpg'],
  },
  {
    id: 'study:dwi',
    studyId: 'study',
    description: 'DWI',
    modality: 'MR',
    instanceCount: 1,
    instances: ['/dwi.jpg'],
  },
];

describe('SeriesSelector accessibility', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses named keyboard-focusable buttons with an exact selected state', async () => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:thumbnail'),
      revokeObjectURL: vi.fn(),
    });
    const onSelectSeries = vi.fn();
    render(
      <SeriesSelector
        seriesList={series}
        activeSeriesId="study:flair"
        onSelectSeries={onSelectSeries}
        dicomConfig={{ url: '', name: 'Local' }}
      />,
    );

    const flair = screen.getByRole('button', { name: 'FLAIR, 2 images' });
    const dwi = screen.getByRole('button', { name: 'DWI, 1 image' });
    expect(flair.getAttribute('aria-pressed')).toBe('true');
    expect(dwi.getAttribute('aria-pressed')).toBe('false');
    dwi.focus();
    expect(document.activeElement).toBe(dwi);
    fireEvent.click(dwi);
    expect(onSelectSeries).toHaveBeenCalledWith(series[1]);
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(2));
  });
});
