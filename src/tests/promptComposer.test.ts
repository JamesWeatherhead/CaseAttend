import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSystemPrompt } from '../services/openrouterClient';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('browser-local lesson prompt composition', () => {
  it('composes the exact registered lesson without calling a CaseAttend prompt API', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const prompt = await fetchSystemPrompt({
      modality: 'dermatology',
      caseId: 'derm-bcc',
      learnerLevel: 'ms_preclinical',
      mode: 'chat',
      hasImage: true,
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(prompt).toContain('FIXED PUBLIC SAFETY POLICY');
    expect(prompt).toContain('derm-bcc-lesson');
    expect(prompt).toContain('Nodular basal cell carcinoma teaching case.');
    expect(prompt).not.toContain('Suspicious pigmented lesion and melanoma teaching case.');
  });

  it('fails closed for unknown cases and domain mismatches', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(fetchSystemPrompt({
      modality: 'radiology',
      caseId: 'unknown-case',
      learnerLevel: 'undergrad',
      mode: 'chat',
      hasImage: false,
    })).rejects.toThrow('Unknown Case Package');

    await expect(fetchSystemPrompt({
      modality: 'pathology',
      caseId: 'derm-bcc',
      learnerLevel: 'undergrad',
      mode: 'chat',
      hasImage: false,
    })).rejects.toThrow("belongs to 'dermatology', not 'pathology'");

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
