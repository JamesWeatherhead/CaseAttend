import type { CasePackageV1 } from '../core/casePackage';

export interface StudyFilter {
  id: string;
  label: string;
  matches: (casePackage: CasePackageV1) => boolean;
}

function matchesCategory(category: string): StudyFilter['matches'] {
  return (casePackage) => casePackage.presentation.category === category;
}

function subtitleTokens(casePackage: CasePackageV1): Set<string> {
  return new Set(
    casePackage.presentation.subtitle
      .split('|')
      .map((token) => token.trim().toLocaleLowerCase('en-US'))
      .filter(Boolean),
  );
}

function matchesSubtitleToken(token: string): StudyFilter['matches'] {
  const normalized = token.toLocaleLowerCase('en-US');
  return (casePackage) => subtitleTokens(casePackage).has(normalized);
}

export const CURRICULUM_FILTERS: readonly StudyFilter[] = [
  { id: 'all', label: 'Any curriculum', matches: () => true },
  { id: 'step-1', label: 'Step 1', matches: matchesSubtitleToken('Step 1') },
  { id: 'step-2', label: 'Step 2', matches: matchesSubtitleToken('Step 2') },
  { id: 'clerkship', label: 'Clerkship', matches: matchesSubtitleToken('Clerkship') },
];

export const CASE_TYPE_FILTERS: readonly StudyFilter[] = [
  { id: 'all', label: 'All case types', matches: () => true },
  { id: 'xray', label: 'X-ray', matches: matchesCategory('xray') },
  { id: 'ct', label: 'CT', matches: matchesCategory('ct') },
  { id: 'mri', label: 'MRI', matches: matchesCategory('mri') },
  { id: 'path', label: 'Pathology', matches: matchesCategory('path') },
  { id: 'derm', label: 'Dermatology', matches: matchesCategory('derm') },
  { id: 'ecg', label: 'ECG', matches: matchesCategory('ecg') },
  { id: 'ultrasound', label: 'Ultrasound', matches: matchesCategory('ultrasound') },
  { id: 'ophthalmology', label: 'Ophthalmology', matches: matchesCategory('ophthalmology') },
];

export function matchesStudyFilter(casePackage: CasePackageV1, filterId: string): boolean {
  return [...CASE_TYPE_FILTERS, ...CURRICULUM_FILTERS].find((filter) => filter.id === filterId)?.matches(casePackage) ?? false;
}
