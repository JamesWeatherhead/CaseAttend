import { describe, expect, it } from 'vitest';
import type { CasePackageV1 } from '../core/casePackage';
import { matchesStudyFilter } from '../components/studyFilters';

function fixture(subtitle: string, category: string): CasePackageV1 {
  return {
    presentation: { subtitle, category },
  } as CasePackageV1;
}

describe('Study List curriculum and modality filters', () => {
  it('matches exact pipe-delimited curriculum tokens independently of modality', () => {
    const ecg = fixture('Step 2 | Clerkship | ECG', 'ecg');

    expect(matchesStudyFilter(ecg, 'all')).toBe(true);
    expect(matchesStudyFilter(ecg, 'step-2')).toBe(true);
    expect(matchesStudyFilter(ecg, 'clerkship')).toBe(true);
    expect(matchesStudyFilter(ecg, 'ecg')).toBe(true);
    expect(matchesStudyFilter(ecg, 'step-1')).toBe(false);
    expect(matchesStudyFilter(ecg, 'ultrasound')).toBe(false);
  });

  it('normalizes token whitespace and case without matching partial labels', () => {
    const stepOne = fixture('  STEP 1 | Foundations | MRI  ', 'mri');
    const stepTen = fixture('Step 10 | MRI', 'mri');

    expect(matchesStudyFilter(stepOne, 'step-1')).toBe(true);
    expect(matchesStudyFilter(stepOne, 'mri')).toBe(true);
    expect(matchesStudyFilter(stepTen, 'step-1')).toBe(false);
    expect(matchesStudyFilter(stepOne, 'unknown')).toBe(false);
  });
});
