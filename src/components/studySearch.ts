import type { CasePackageV1 } from '../core/casePackage';
import { CASE_TYPE_FILTERS } from './studyFilters';

/** The query and public catalog metadata use the same word boundaries. */
export function studySearchWords(text: string): string[] {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('en-US')
    .replace(/\bx[\s\p{Pd}]*rays?\b/gu, 'xray')
    .replace(/\bradiographs?\b/gu, 'xray')
    .replace(/(\p{L})(\p{N})/gu, '$1 $2')
    .replace(/(\p{N})(\p{L})/gu, '$1 $2')
    .match(/[\p{L}\p{N}]+/gu) ?? [];
}

export function indexStudyCases(cases: readonly CasePackageV1[]) {
  return cases.map(casePackage => ({
    casePackage,
    // Do not search teaching notes, answers, provenance, or internal identifiers.
    words: [...new Set(studySearchWords([
      casePackage.title,
      casePackage.vignette,
      casePackage.domain,
      casePackage.presentation.subtitle,
      casePackage.presentation.category,
      CASE_TYPE_FILTERS.find(filter => filter.id === casePackage.presentation.category)?.label,
    ].filter(Boolean).join(' ')))],
  }));
}

export function matchesStudySearch(words: readonly string[], queryWords: readonly string[]): boolean {
  return queryWords.every(query => words.some(word => (
    query.length <= 2 || /\p{N}/u.test(query) ? word === query : word.startsWith(query)
  )));
}
