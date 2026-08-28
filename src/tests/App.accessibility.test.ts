// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { resolveArtifactAccessibleDescription } from '../App';
import type { CasePackageV1 } from '../core/casePackage';

describe('case viewer accessibility metadata', () => {
  it('uses the authored image or current-frame description instead of the case summary', () => {
    const single = {
      id: 'single-case',
      neutralDescription: 'Generic case summary.',
      artifact: {
        kind: 'image',
        seriesId: 'image-series',
        alt: 'Authored description of the single teaching image.',
      },
    } as CasePackageV1;
    expect(resolveArtifactAccessibleDescription(single, 'single-case:image-series', 0))
      .toBe('Authored description of the single teaching image.');

    const stack = {
      id: 'stack-case',
      neutralDescription: 'Generic stack summary.',
      artifact: {
        kind: 'image-stack',
        series: [{
          id: 'axial',
          frames: [
            { alt: 'First authored frame description.' },
            { alt: 'Second authored frame description.' },
          ],
        }],
      },
    } as unknown as CasePackageV1;
    expect(resolveArtifactAccessibleDescription(stack, 'stack-case:axial', 1))
      .toBe('Second authored frame description.');
    expect(resolveArtifactAccessibleDescription(stack, 'unrelated-series', 1))
      .toBe('Generic stack summary.');
  });
});
