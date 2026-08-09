import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSystemPrompt } from '../services/openrouterClient';
import { finalizeCasePackageV1 } from '../core/casePackage';
import { requireCasePackage } from '../data/caseRegistry';
import { requireLessonPlanForCase } from '../data/lessonRegistry';

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

  it('keys prompt composition by the exact Case Package manifest', async () => {
    const original = await requireCasePackage('derm-bcc');
    const lessonPlan = await requireLessonPlanForCase(original);
    const { manifest: _manifest, ...draft } = original;
    const revised = await finalizeCasePackageV1({
      ...draft,
      title: 'Revised same-ID basal cell case',
      vignette: 'A deliberately revised same-ID vignette for the frozen research bundle.',
    });

    const originalPrompt = await fetchSystemPrompt({
      modality: original.domain,
      caseId: original.id,
      learnerLevel: 'undergrad',
      mode: 'chat',
      hasImage: true,
      casePackage: original,
      lessonPlan,
    });
    const revisedPrompt = await fetchSystemPrompt({
      modality: revised.domain,
      caseId: revised.id,
      learnerLevel: 'undergrad',
      mode: 'chat',
      hasImage: true,
      casePackage: revised,
      lessonPlan,
    });

    expect(original.manifest.sha256).not.toBe(revised.manifest.sha256);
    expect(revisedPrompt).not.toBe(originalPrompt);
    expect(revisedPrompt).toContain('Revised same-ID basal cell case');
    expect(revisedPrompt).toContain('deliberately revised same-ID vignette');
  });
});
