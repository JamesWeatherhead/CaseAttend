import { beforeAll, describe, expect, it } from 'vitest';
import type { CasePackageV1 } from '../core/casePackage';
import { listBuiltinCasePackages } from '../data/caseRegistry';
import { indexStudyCases, matchesStudySearch, studySearchWords } from '../components/studySearch';
import { matchesStudyFilter } from '../components/studyFilters';

describe('catalog word search', () => {
  let cases: readonly CasePackageV1[];
  let index: ReturnType<typeof indexStudyCases>;
  const find = (query: string) => index.filter(entry => matchesStudySearch(entry.words, studySearchWords(query))).map(entry => entry.casePackage);

  beforeAll(async () => {
    cases = await listBuiltinCasePackages();
    index = indexStudyCases(cases);
  });

  it('finds the same cases across word order, spacing, and capitalization', () => {
    expect(find('chest pain').length).toBeGreaterThan(0);
    expect(find('pain chest')).toEqual(find('chest pain'));
    expect(find('  CHEST   pain  ')).toEqual(find('chest pain'));
    expect(find('CT head')).toEqual(find('head ct'));
    expect(find('CT head').length).toBe(2);
  });

  it('uses word boundaries for CT instead of matching infection or structure', () => {
    expect(find('ct').map(item => item.id)).toEqual(cases.filter(item => item.presentation.category === 'ct').map(item => item.id));
    expect(find('ct').length).toBe(2);
  });

  it.each(['xray', 'x-ray', 'x ray', 'X–RAYS', 'radiograph', 'radiographs'])('finds every X-ray with %s', query => {
    expect(find(query).map(item => item.id)).toEqual(cases.filter(item => item.presentation.category === 'xray').map(item => item.id));
    expect(find(query).length).toBe(14);
  });

  it('keeps untagged cases and combines independent filters without changing cases', () => {
    const untagged = cases.filter(item => !['step-1', 'step-2', 'clerkship'].some(filter => matchesStudyFilter(item, filter)));
    expect(untagged.length).toBe(16);
    expect(untagged.every(item => matchesStudyFilter(item, 'all'))).toBe(true);
    const selected = find('head').filter(item => matchesStudyFilter(item, 'ct') && matchesStudyFilter(item, 'step-2'));
    expect(selected.length).toBe(2);
    expect(selected.every(item => cases.includes(item))).toBe(true);
  });

  it('indexes only public catalog fields, including unfamiliar imported categories', () => {
    const imported = {
      ...cases[0], id: 'hidden-identifier', title: 'Évaluation 21M', vignette: 'Synthetic café image.',
      teachingNotes: ['secret-diagnosis'], neutralDescription: 'hidden-clue',
      presentation: { ...cases[0].presentation, category: 'custom-category', subtitle: 'Imported material' },
    };
    const entry = indexStudyCases([imported])[0];
    const matches = (query: string) => matchesStudySearch(entry.words, studySearchWords(query));
    expect(entry.casePackage).toBe(imported);
    expect(matches('CAFE eval')).toBe(true);
    expect(matches('custom category')).toBe(true);
    expect(matches('21')).toBe(true);
    expect(matches('2')).toBe(false);
    expect(matches('secret diagnosis')).toBe(false);
    expect(matches('hidden identifier')).toBe(false);
    expect(matches('hidden clue')).toBe(false);
    expect(matchesStudyFilter(imported, 'all')).toBe(true);
  });
});
