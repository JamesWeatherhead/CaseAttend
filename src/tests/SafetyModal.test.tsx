// @vitest-environment jsdom

import React from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SafetyModal from '../components/SafetyModal';
import type { CasePackageV1 } from '../core/casePackage';

const mocks = vi.hoisted(() => ({
  listCasePackages: vi.fn(),
}));

vi.mock('../data/caseRegistry', () => ({
  listCasePackages: mocks.listCasePackages,
}));

function caseWithRightsEvidence(
  id: string,
  licenseEvidenceUrl: string,
): CasePackageV1 {
  return {
    id,
    title: `Rights fixture ${id}`,
    domain: 'ophthalmology',
    presentation: { subtitle: 'Fundus photograph' },
    provenance: {
      sourceName: 'Exact item record',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Fixture.jpg',
      licenseEvidenceUrl,
      attribution: 'Fixture creator',
      license: {
        name: 'CC0 1.0 Universal',
        url: 'https://creativecommons.org/publicdomain/zero/1.0/',
      },
      clinicianReview: { reviewed: false },
    },
    deidentification: { status: 'not-reviewed' },
  } as CasePackageV1;
}

describe('SafetyModal rights evidence', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows a distinct safe item-level rights link and rejects credentialed URLs', async () => {
    const safeEvidence = 'https://commons.wikimedia.org/wiki/File:Fixture.jpg#Licensing';
    mocks.listCasePackages.mockResolvedValue([
      caseWithRightsEvidence('safe-rights', safeEvidence),
      caseWithRightsEvidence('unsafe-rights', 'https://user:secret@example.org/evidence'),
    ]);

    render(<SafetyModal onClose={() => undefined} />);

    const safeCard = (await screen.findByText('Rights fixture safe-rights')).closest('article');
    const unsafeCard = screen.getByText('Rights fixture unsafe-rights').closest('article');
    if (!safeCard || !unsafeCard) throw new Error('Expected rights fixture cards.');

    const evidenceLink = within(safeCard).getByRole('link', {
      name: 'View item-level evidence',
    });
    expect(evidenceLink.getAttribute('href')).toBe(safeEvidence);
    expect(evidenceLink.getAttribute('rel')).toBe('noopener noreferrer');
    expect(within(safeCard).getByRole('link', { name: 'CC0 1.0 Universal' })).not.toBe(
      evidenceLink,
    );
    expect(within(unsafeCard).getByText('Not recorded in Case Package v1')).toBeTruthy();
    expect(within(unsafeCard).queryByRole('link', { name: 'View item-level evidence' })).toBeNull();
  });
});
