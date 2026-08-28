import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SAFETY_FOOTER } from '../../lib/prompts/shared';
import type { CasePackageV1 } from '../core/casePackage';
import {
  INTRO_CACHE_REQUEST_TEMPLATE_VERSION,
  INTRO_CACHE_SCHEMA,
  INTRO_CACHE_SCHEMA_VERSION,
  computeSystemPromptSha256,
  validateIntroCacheV1,
  type IntroCacheV1,
} from '../core/introCache';
import { INTRO_CACHE_SYSTEM_PROMPT } from '../core/introCacheSystemPrompt';
import type { LessonPlanV1 } from '../core/lessonPlan';
import type { PortableCaseAssetV1 } from '../core/portableCasePackage';
import {
  approveIntroCache,
  generateAuthoredIntroCache,
  IntroCacheAuthoringError,
  isIntroCacheCurrent,
} from '../services/introCacheAuthoring';

function makeAsset(sha: string, uri: string): PortableCaseAssetV1 {
  return {
    uri: uri as PortableCaseAssetV1['uri'],
    sha256: sha,
    mimeType: 'image/jpeg',
    byteLength: 4,
    width: 8,
    height: 8,
    bytesBase64: 'AAAA',
  };
}

function makeCasePackage(): CasePackageV1 {
  return {
    schema: 'caseattend.case-package',
    schemaVersion: '1.0',
    id: 'author-case-1',
    title: 'Author case one',
    vignette: 'A patient with a teaching finding.',
    domain: 'radiology',
    difficulty: 'intermediate',
    artifact: {
      kind: 'image',
      modality: 'CR',
      seriesId: 's1',
      seriesLabel: 'Teaching image',
      src: 'case://assets/deadbeef.jpg',
      mimeType: 'image/jpeg',
      sha256: 'ab'.repeat(32),
      alt: 'Chest x-ray teaching image.',
      width: 8,
      height: 8,
    },
    preview: {
      src: 'case://assets/deadbeef.jpg',
      mimeType: 'image/jpeg',
      sha256: 'ab'.repeat(32),
      alt: 'Chest x-ray teaching image.',
      width: 8,
      height: 8,
    },
    artifactHints: { showSeriesSelector: false } as CasePackageV1['artifactHints'],
    provenance: {
      sourceName: 'Case bank',
      sourceUrl: 'https://example.org/case',
      license: { name: 'CC-BY', url: 'https://example.org/license' },
      attribution: 'Author name',
      clinicianReview: { reviewed: false },
    },
    deidentification: { status: 'synthetic', notes: 'synthetic' },
    contentWarnings: ['Medical image'],
    neutralDescription: 'Frontal chest radiograph teaching image.',
    teachingNotes: ['Look at the pleural line.'],
    lessonPlanRef: {
      id: 'author-case-1-lesson',
      version: '1.0.0',
      sha256: 'aa'.repeat(32),
    },
    presentation: {
      subtitle: 'Teaching image',
      category: 'xray',
      accentColor: 'rgba(59,130,246,1)',
      accentGlow: 'rgba(59,130,246,0.15)',
      accentBorder: 'rgba(59,130,246,0.3)',
      textClass: 'text-blue-400',
    },
    manifest: { algorithm: 'SHA-256', sha256: 'cd'.repeat(32) },
  } as CasePackageV1;
}

function makeLessonPlan(): LessonPlanV1 {
  return {
    schema: 'caseattend.lesson-plan',
    schemaVersion: '1.0',
    version: '1.0.0',
    id: 'author-case-1-lesson',
    title: 'Author case one teaching lesson',
    neutralDescription: 'Frontal chest radiograph teaching image.',
    teachingNotes: ['Look at the pleural line.'],
    learner: {
      levels: ['highschool', 'undergrad', 'ms_preclinical', 'ms_clinical', 'resident'],
      prerequisites: [],
    },
    objectives: [{ id: 'obj-1', description: 'Describe the finding.' }],
    socraticOpening: 'What do you notice first?',
    allowedHints: [],
    escalationConditions: [],
    stoppingConditions: [],
    educatorTutorInstructions: 'Guide the learner.',
    rubric: {
      criteria: [{
        id: 'crit-1',
        objectiveIds: ['obj-1'],
        criterion: 'Describes the finding.',
        observableEvidence: ['names the location'],
      }],
    },
    citations: [{
      id: 'cit-1',
      title: 'Source',
      scope: 'artifact-provenance',
      url: 'https://example.org/case',
    }],
    clinicalReview: { reviewed: false },
    manifest: { algorithm: 'SHA-256', sha256: 'aa'.repeat(32) },
  } as LessonPlanV1;
}

function goodLevel(prefix: string) {
  const footer = SAFETY_FOOTER.trim();
  return {
    introPrompt: `${prefix} opening: describe what you see.`,
    introQuestions: [
      {
        id: `${prefix}-q1`,
        label: 'Look',
        prompt: 'What do you see?',
        cachedAnswer: `Educational answer 1.\n\n${footer}`,
      },
    ],
  };
}

function goodModelPayload() {
  return {
    levels: {
      highschool: goodLevel('hs'),
      undergrad: goodLevel('ug'),
      ms_preclinical: goodLevel('pre'),
      ms_clinical: goodLevel('clin'),
      resident: goodLevel('res'),
    },
  };
}

function makeOpenRouterResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('generateAuthoredIntroCache', () => {
  const casePackage = makeCasePackage();
  const lessonPlan = makeLessonPlan();
  const assets = [makeAsset('ab'.repeat(32), 'case://assets/deadbeef.jpg')];
  const originalWarn = console.warn;

  beforeEach(() => {
    console.warn = vi.fn();
  });
  afterEach(() => {
    console.warn = originalWarn;
  });

  it('stamps the exact system-prompt sha the batch pipeline uses', async () => {
    const expected = await computeSystemPromptSha256(INTRO_CACHE_SYSTEM_PROMPT);
    const fetchMock = vi.fn(async () => makeOpenRouterResponse({
      choices: [{ message: { content: JSON.stringify(goodModelPayload()) } }],
    }));
    const cache = await generateAuthoredIntroCache({
      casePackage,
      lessonPlan,
      assets,
      apiKey: 'sk-test',
      modelId: 'test/model',
      fetch: fetchMock,
      now: () => new Date('2026-08-13T00:00:00.000Z'),
    });
    expect(cache.provenance.systemPromptSha256).toBe(expected);
    expect(cache.provenance.requestTemplateVersion).toBe(INTRO_CACHE_REQUEST_TEMPLATE_VERSION);
    expect(cache.schema).toBe(INTRO_CACHE_SCHEMA);
    expect(cache.schemaVersion).toBe(INTRO_CACHE_SCHEMA_VERSION);
  });

  it('produces a draft artifact that passes validateIntroCacheV1', async () => {
    const fetchMock = vi.fn(async () => makeOpenRouterResponse({
      choices: [{ message: { content: JSON.stringify(goodModelPayload()) } }],
    }));
    const cache = await generateAuthoredIntroCache({
      casePackage,
      lessonPlan,
      assets,
      apiKey: 'sk-test',
      modelId: 'test/model',
      fetch: fetchMock,
    });
    expect(cache.review.status).toBe('draft');
    expect(validateIntroCacheV1(cache).valid).toBe(true);
  });

  it('fails closed when any level is missing (no partial artifact)', async () => {
    const missing = { levels: { ...goodModelPayload().levels } as Partial<ReturnType<typeof goodModelPayload>['levels']> };
    delete missing.levels.resident;
    const fetchMock = vi.fn(async () => makeOpenRouterResponse({
      choices: [{ message: { content: JSON.stringify(missing) } }],
    }));
    await expect(
      generateAuthoredIntroCache({
        casePackage, lessonPlan, assets,
        apiKey: 'sk-test', modelId: 'test/model', fetch: fetchMock,
      }),
    ).rejects.toBeInstanceOf(IntroCacheAuthoringError);
  });

  it('rejects an answer missing the safety footer', async () => {
    const payload = goodModelPayload();
    payload.levels.highschool.introQuestions[0].cachedAnswer = 'no footer here';
    const fetchMock = vi.fn(async () => makeOpenRouterResponse({
      choices: [{ message: { content: JSON.stringify(payload) } }],
    }));
    const error = await generateAuthoredIntroCache({
      casePackage, lessonPlan, assets,
      apiKey: 'sk-test', modelId: 'test/model', fetch: fetchMock,
    }).catch((e) => e);
    expect(error).toBeInstanceOf(IntroCacheAuthoringError);
    expect((error as IntroCacheAuthoringError).message).toMatch(/safety footer/);
  });

  it('surfaces a clear missing-key error rather than calling OpenRouter', async () => {
    const fetchMock = vi.fn(async () => makeOpenRouterResponse({}));
    await expect(
      generateAuthoredIntroCache({
        casePackage, lessonPlan, assets,
        apiKey: '   ', modelId: 'test/model', fetch: fetchMock,
      }),
    ).rejects.toMatchObject({ code: 'missing_key' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps HTTP 401 to unauthorized', async () => {
    const fetchMock = vi.fn(async () => makeOpenRouterResponse({}, 401));
    await expect(
      generateAuthoredIntroCache({
        casePackage, lessonPlan, assets,
        apiKey: 'sk-test', modelId: 'test/model', fetch: fetchMock,
      }),
    ).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('maps HTTP 402 to payment_required', async () => {
    const fetchMock = vi.fn(async () => makeOpenRouterResponse({}, 402));
    await expect(
      generateAuthoredIntroCache({
        casePackage, lessonPlan, assets,
        apiKey: 'sk-test', modelId: 'test/model', fetch: fetchMock,
      }),
    ).rejects.toMatchObject({ code: 'payment_required' });
  });

  it('parses JSON wrapped in a code fence', async () => {
    const fetchMock = vi.fn(async () => makeOpenRouterResponse({
      choices: [{ message: { content: '```json\n' + JSON.stringify(goodModelPayload()) + '\n```' } }],
    }));
    const cache = await generateAuthoredIntroCache({
      casePackage, lessonPlan, assets,
      apiKey: 'sk-test', modelId: 'test/model', fetch: fetchMock,
    });
    expect(cache.caseId).toBe(casePackage.id);
  });
});

describe('approveIntroCache', () => {
  it('flips status to approved with reviewer identity stamped', async () => {
    const draft: IntroCacheV1 = {
      schema: INTRO_CACHE_SCHEMA,
      schemaVersion: INTRO_CACHE_SCHEMA_VERSION,
      caseId: 'author-case-1',
      lessonPlanSha256: 'a'.repeat(64),
      provenance: {
        modelId: 'test/model',
        systemPromptSha256: 'b'.repeat(64),
        requestTemplateVersion: INTRO_CACHE_REQUEST_TEMPLATE_VERSION,
        mediaSha: 'c'.repeat(64),
        generatedAt: '2026-08-13T00:00:00.000Z',
      },
      review: { status: 'draft' },
      levels: {
        highschool: goodLevel('hs'),
        undergrad: goodLevel('ug'),
        ms_preclinical: goodLevel('pre'),
        ms_clinical: goodLevel('clin'),
        resident: goodLevel('res'),
      },
    };
    const approved = approveIntroCache(
      draft,
      { name: 'James Weatherhead', credentials: 'MD, PhD candidate' },
      () => new Date('2026-08-13T00:00:00.000Z'),
    );
    expect(approved.review).toEqual({
      status: 'approved',
      reviewer: 'James Weatherhead',
      credentials: 'MD, PhD candidate',
      reviewedAt: '2026-08-13T00:00:00.000Z',
    });
    expect(validateIntroCacheV1(approved).valid).toBe(true);
    expect(draft.review.status).toBe('draft'); // input not mutated
  });

  it('refuses approval without both reviewer name and credentials', () => {
    const draft = {
      schema: INTRO_CACHE_SCHEMA,
      schemaVersion: INTRO_CACHE_SCHEMA_VERSION,
      caseId: 'x',
      lessonPlanSha256: 'a'.repeat(64),
      provenance: {
        modelId: 'm',
        systemPromptSha256: 'b'.repeat(64),
        requestTemplateVersion: INTRO_CACHE_REQUEST_TEMPLATE_VERSION,
        mediaSha: 'c'.repeat(64),
        generatedAt: '2026-08-13T00:00:00.000Z',
      },
      review: { status: 'draft' },
      levels: {
        highschool: goodLevel('hs'),
        undergrad: goodLevel('ug'),
        ms_preclinical: goodLevel('pre'),
        ms_clinical: goodLevel('clin'),
        resident: goodLevel('res'),
      },
    } as unknown as IntroCacheV1;
    expect(() => approveIntroCache(draft, { name: '', credentials: 'MD' })).toThrow(/reviewer name and credentials/);
    expect(() => approveIntroCache(draft, { name: 'James', credentials: '' })).toThrow(/reviewer name and credentials/);
  });
});

describe('isIntroCacheCurrent', () => {
  const casePackage = makeCasePackage();
  const lessonPlan = makeLessonPlan();
  const assets = [makeAsset('ab'.repeat(32), 'case://assets/deadbeef.jpg')];

  it('returns false for null', async () => {
    expect(await isIntroCacheCurrent(null, {
      lessonPlan, assets, neutralDescription: casePackage.neutralDescription,
    })).toBe(false);
  });

  it('returns true when both shas match', async () => {
    const fetchMock = vi.fn(async () => makeOpenRouterResponse({
      choices: [{ message: { content: JSON.stringify(goodModelPayload()) } }],
    }));
    const cache = await generateAuthoredIntroCache({
      casePackage, lessonPlan, assets,
      apiKey: 'sk-test', modelId: 'test/model', fetch: fetchMock,
    });
    expect(await isIntroCacheCurrent(cache, {
      lessonPlan, assets, neutralDescription: casePackage.neutralDescription,
    })).toBe(true);
  });

  it('returns false when the lesson plan sha changed', async () => {
    const fetchMock = vi.fn(async () => makeOpenRouterResponse({
      choices: [{ message: { content: JSON.stringify(goodModelPayload()) } }],
    }));
    const cache = await generateAuthoredIntroCache({
      casePackage, lessonPlan, assets,
      apiKey: 'sk-test', modelId: 'test/model', fetch: fetchMock,
    });
    const differentLesson = { ...lessonPlan, manifest: { algorithm: 'SHA-256' as const, sha256: 'ff'.repeat(32) } };
    expect(await isIntroCacheCurrent(cache, {
      lessonPlan: differentLesson, assets, neutralDescription: casePackage.neutralDescription,
    })).toBe(false);
  });

  it('returns false when media assets changed', async () => {
    const fetchMock = vi.fn(async () => makeOpenRouterResponse({
      choices: [{ message: { content: JSON.stringify(goodModelPayload()) } }],
    }));
    const cache = await generateAuthoredIntroCache({
      casePackage, lessonPlan, assets,
      apiKey: 'sk-test', modelId: 'test/model', fetch: fetchMock,
    });
    const otherAssets = [makeAsset('cd'.repeat(32), 'case://assets/other.jpg')];
    expect(await isIntroCacheCurrent(cache, {
      lessonPlan, assets: otherAssets, neutralDescription: casePackage.neutralDescription,
    })).toBe(false);
  });
});
