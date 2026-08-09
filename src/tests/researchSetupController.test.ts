// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { finalizeCasePackageV1 } from '../core/casePackage';
import { createPortableCasePackageV1 } from '../core/portableCasePackage';
import type { ResearchRecorder } from '../services/researchRecorder';
import {
  ResearchSetupController,
  type ResearchSetupControllerDependencies,
  type ResearchSetupMaterialSource,
} from '../services/researchSetupController';
import type { ResearchSetupDraft } from '../components/ResearchSetupWizard/ResearchSetupWizard';
import { createInitialResearchSetupDraft } from '../components/ResearchSetupWizard/ResearchSetupWizard';
import { makePortableCasePackage } from './portableCaseTestFixture';

const NOW = new Date('2026-08-09T18:00:00.000Z');

async function materialSource(): Promise<ResearchSetupMaterialSource> {
  const initial = await makePortableCasePackage();
  const { manifest: _manifest, ...caseDraft } = initial.casePackage;
  const casePackage = await finalizeCasePackageV1({
    ...caseDraft,
    deidentification: {
      status: 'synthetic',
      notes: 'Generated test pixels contain no person or patient data.',
    },
  });
  const portable = await createPortableCasePackageV1(
    casePackage,
    initial.lessonPlan,
    initial.assets,
  );
  return {
    option: {
      key: 'portable-research-case',
      title: casePackage.title,
      domain: casePackage.domain,
      caseRef: {
        id: casePackage.id,
        schemaVersion: casePackage.schemaVersion,
        sha256: casePackage.manifest.sha256,
      },
      lessonRef: {
        id: portable.lessonPlan.id,
        version: portable.lessonPlan.version,
        sha256: portable.lessonPlan.manifest.sha256,
      },
      snapshotBehavior: 'reuse-exact-portable',
    },
    casePackage,
    lessonPlan: portable.lessonPlan,
  };
}

function completeDraft(materialKey: string, determined = false): ResearchSetupDraft {
  return {
    ...createInitialResearchSetupDraft(materialKey),
    id: 'visual-reasoning-pilot',
    title: 'Visual reasoning pilot',
    purpose: 'Evaluate a question-first VLM tutor for visual education.',
    population: 'Adult learners in a university course.',
    hypotheses: 'Question-first guidance changes the prespecified reasoning outcome.',
    objectives: 'Describe visible features before interpreting them.',
    outcomes: 'Prespecified visual-reasoning score.',
    deploymentOperatorName: 'Example University',
    deploymentPrivacyPolicyUrl: 'https://example.edu/privacy',
    materialKey,
    arms: [{
      ...createInitialResearchSetupDraft().arms[0],
      id: 'question-first',
      label: 'Configured activity',
      providerId: 'example-provider',
      providerPolicyUrl: 'https://provider.example/privacy',
      model: 'example/model-v1',
      historyWindowMessages: 7,
    }],
    fixedArmId: 'question-first',
    tasks: 'Describe the visible features.',
    participantKeyInformation: 'You are invited to try a visual education activity that uses AI.',
    participantPurpose: 'The study examines visual education with an AI tutor.',
    participantProcedures: 'Review a case, use the tutor, and complete the configured tasks.',
    participantRisks: 'The AI can be wrong, biased, or unexpected.',
    participantBenefits: 'You may receive no direct benefit.',
    participantPrivacy: 'A pseudonymous reference and structured events are stored in this browser.',
    participantVoluntaryParticipation: 'Participation is voluntary and you may exit at any time.',
    participantCompensation: 'No compensation is offered.',
    contactName: 'Research Office',
    contactRole: 'Study contact',
    contactEmail: 'research@example.edu',
    browserDeleteAfter: '2027-08-09T12:00',
    exportedCopiesDeleteAfter: '2027-09-09T12:00',
    deletionProcedure: 'Delete browser records and tracked exported copies by the listed deadlines.',
    accessRoles: 'research-team',
    providerReviewConfirmed: true,
    dataFlowReviewConfirmed: true,
    oversight: determined ? {
      status: 'institution-determined',
      determination: 'exempt',
      institutionName: 'Example University',
      protocolReference: 'IRB-EXAMPLE-42',
      determinedAt: '2026-08-09T12:00',
    } : {
      status: 'draft',
      determination: 'approved',
      institutionName: '',
      protocolReference: '',
      determinedAt: '',
    },
  };
}

function persistentStore() {
  return {
    getStatus: vi.fn(() => ({
      mode: 'indexeddb' as const,
      persistent: true as const,
      launchAllowed: true as const,
      message: 'Research data is stored only in this browser.' as const,
    })),
    subscribeStatus: vi.fn(() => () => undefined),
    initialize: vi.fn(async () => ({
      mode: 'indexeddb' as const,
      persistent: true as const,
      launchAllowed: true as const,
      message: 'Research data is stored only in this browser.' as const,
    })),
    saveDraft: vi.fn(async () => ({} as never)),
    saveStudyBundle: vi.fn(async () => ({} as never)),
    getStudyBundle: vi.fn(async () => null),
    startRun: vi.fn(async () => ({} as never)),
    append: vi.fn(async () => ({} as never)),
    endRun: vi.fn(async () => ({} as never)),
  };
}

async function setup(overrides: Partial<ResearchSetupControllerDependencies> = {}) {
  const source = await materialSource();
  const portable = await createPortableCasePackageV1(
    source.casePackage,
    source.lessonPlan,
    (await makePortableCasePackage()).assets,
  ).catch(async () => {
    const original = await makePortableCasePackage();
    return createPortableCasePackageV1(source.casePackage, source.lessonPlan, original.assets);
  });
  const store = persistentStore();
  const controller = new ResearchSetupController({
    store,
    listMaterialSources: async () => [source],
    snapshotMaterial: async () => portable,
    now: () => NOW,
    deploymentOrigin: () => 'https://study.example.edu',
    application: {
      version: '0.3.0',
      buildRevision: 'abcdef1',
      sourceTreeUrl: 'https://github.com/JamesWeatherhead/CaseAttend/tree/abcdef1',
    },
    downloadFile: vi.fn(),
    ...overrides,
  });
  return { controller, source, portable, store };
}

describe('ResearchSetupController', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('creates a hash-verified exact bundle with conservative fixed policies and approved VLM wording', async () => {
    const { controller, source, portable } = await setup();
    const [option] = await controller.listMaterials();
    const bundle = await controller.prepareBundle(completeDraft(source.option.key));
    const manifest = bundle.researchManifest;

    expect(option.snapshotBehavior).toBe('reuse-exact-portable');
    expect(manifest.arms[0].caseSteps[0].casePackageRef.sha256).toBe(portable.casePackage.manifest.sha256);
    expect(manifest.arms[0].inferencePolicy.provider).toEqual({
      only: ['example-provider'],
      policyUrl: 'https://provider.example/privacy',
      allowFallbacks: false,
      requireParameters: true,
      zeroDataRetention: true,
      dataCollection: 'deny',
    });
    expect(manifest.arms[0].inferencePolicy.historyWindowMessages).toBe(7);
    expect(manifest.arms[0].capturePolicy).toMatchObject({
      trigger: 'send',
      source: 'current-view',
      quality: 0.9,
      includeTutorPointers: false,
      bakeViewportTransform: true,
    });
    expect(manifest.dataManagement.dataFlow.inference.authentication).toEqual({
      method: 'browser-held-openrouter-api-key',
      storage: 'browser-local-storage',
      sentTo: 'openrouter-only',
      includedInResearchRecords: false,
    });
    expect(manifest.collection.rawChat).toEqual({ enabled: false });
    expect(manifest.participantInformation.vlmDisclosure.plainLanguage).toContain('the terms are not synonyms');
  });

  it('requires the two human reviews for freeze and reports core launch blockers without claiming approval', async () => {
    const { controller, source, store } = await setup();
    const incompleteReview = completeDraft(source.option.key);
    incompleteReview.providerReviewConfirmed = false;
    await expect(controller.freeze(incompleteReview)).rejects.toThrow(/provider terms/i);

    const frozen = await controller.freeze(completeDraft(source.option.key));
    expect(frozen.launchErrors.join(' ')).toMatch(/institution-determined/i);
    expect(store.saveStudyBundle).toHaveBeenCalledTimes(1);
  });

  it('maps structured pre/post instruments exactly and enables response collection only when needed', async () => {
    const { controller, source } = await setup();
    const draft = completeDraft(source.option.key);
    draft.tasks = '';
    draft.structuredTasks = [{
      id: 'baseline-strategy',
      phase: 'pre',
      title: 'Baseline strategy',
      instructions: 'Choose the strategy you would use first.',
      responseKind: 'single-choice',
      options: [
        { id: 'describe-first', label: 'Describe visible features first' },
        { id: 'diagnose-first', label: 'Name a diagnosis first' },
      ],
      min: 1,
      max: 5,
      minLabel: 'Low',
      maxLabel: 'High',
    }, {
      id: 'confidence-post',
      phase: 'post',
      title: 'Confidence after activity',
      instructions: 'Rate your confidence after the activity.',
      responseKind: 'integer-scale',
      options: [],
      min: 1,
      max: 7,
      minLabel: 'Not confident',
      maxLabel: 'Very confident',
    }];

    const manifest = (await controller.prepareBundle(draft)).researchManifest;
    expect(manifest.tasks.pre).toEqual([expect.objectContaining({
      id: 'baseline-strategy',
      response: {
        kind: 'single-choice',
        options: [
          { id: 'describe-first', label: 'Describe visible features first' },
          { id: 'diagnose-first', label: 'Name a diagnosis first' },
        ],
      },
    })]);
    expect(manifest.tasks.post).toEqual([expect.objectContaining({
      id: 'confidence-post',
      response: {
        kind: 'integer-scale',
        min: 1,
        max: 7,
        minLabel: 'Not confident',
        maxLabel: 'Very confident',
      },
    })]);
    expect(manifest.collection.taskResponses.enabled).toBe(true);
  });

  it('fails closed when the build does not identify an exact source revision', async () => {
    const { source } = await setup();
    const { controller } = await setup({
      application: {
        version: '0.3.0',
        buildRevision: 'development',
        sourceTreeUrl: 'https://github.com/JamesWeatherhead/CaseAttend/tree/main',
      },
    });
    await expect(controller.prepareBundle(completeDraft(source.option.key))).rejects.toThrow(/reproducible commit build/i);
  });

  it('starts only the assigned frozen arm, records case open, and activates exact in-memory assets', async () => {
    const record = vi.fn(async () => ({} as never));
    const end = vi.fn(async () => null);
    const releaseAssets = vi.fn();
    const { source } = await setup();
    const { controller } = await setup({
      startRecorder: vi.fn(async () => ({
        context: {
          runId: 'run-1',
          manifestRef: { id: 'visual-reasoning-pilot', version: '1.0.0', sha256: 'a'.repeat(64) },
          participantId: 'b'.repeat(64),
          armId: 'question-first',
        },
        participantReference: 'b'.repeat(64),
        record,
        end,
      } as unknown as ResearchRecorder)),
      activateAssets: vi.fn(async () => releaseAssets),
    });
    const frozen = await controller.freeze(completeDraft(source.option.key, true));
    const session = await controller.startParticipant(frozen, '0123456789ABCDEFGHJK');

    expect(session.arm.id).toBe('question-first');
    expect(session.step.id).toBe('step-1');
    expect(session.series.length).toBeGreaterThan(0);
    expect(record).toHaveBeenCalledWith({ type: 'case_step_opened', caseStepId: 'step-1' });
    session.releaseAssets();
    expect(releaseAssets).toHaveBeenCalledTimes(1);
  });
});
