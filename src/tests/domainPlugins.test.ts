import { describe, expect, it } from 'vitest';
import { LEARNER_LEVELS } from '../constants';
import { getDomain } from '../lib/domains';
import type { DomainKey } from '../lib/domains/types';

const NEW_DOMAINS = ['ecg', 'ultrasound', 'ophthalmology'] as const satisfies readonly DomainKey[];

describe('visual case domain plugins', () => {
  it.each(NEW_DOMAINS)('registers a complete %s plugin', (key) => {
    const domain = getDomain(key);

    expect(domain.key).toBe(key);
    expect(domain.label.trim()).not.toBe('');
    expect(domain.artifactHints.showWindowLevel).toBe(false);
    expect(domain.artifactHints.showSeriesSelector).toBe(false);
    expect(domain.contextLabel('OT').trim()).not.toBe('');
    expect(domain.captureLabel('OT').trim()).not.toBe('');
    for (const { id } of LEARNER_LEVELS) {
      expect(domain.welcomeMessage(id).trim()).not.toBe('');
      expect(domain.getInitialSuggestions(id, true)).toHaveLength(2);
      expect(domain.getInitialSuggestions(id, false)).toHaveLength(2);
    }
  });
});
