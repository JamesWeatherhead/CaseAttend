import type { LearnerLevel } from '../constants';
import { composeLessonPrompt } from '../core/lessonPlan';
import type { PortableCasePackageV1 } from '../core/portableCasePackage';
import {
  createResearchManifestV1,
  type ResearchManifestCreateInput,
  type ResearchManifestV1,
  type ResearchOversightV1,
} from '../core/researchManifest';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

export function makeResearchManifestInput(options: {
  portable?: PortableCasePackageV1;
  oversight?: ResearchOversightV1;
  armCount?: number;
  learnerLevel?: LearnerLevel;
} = {}): ResearchManifestCreateInput {
  const casePackageRef = options.portable
    ? {
        id: options.portable.casePackage.id,
        schemaVersion: options.portable.casePackage.schemaVersion,
        sha256: options.portable.casePackage.manifest.sha256,
      }
    : { id: 'sample-case', schemaVersion: '1.0' as const, sha256: SHA_A };
  const lessonPlanRef = options.portable
    ? {
        id: options.portable.lessonPlan.id,
        version: options.portable.lessonPlan.version,
        sha256: options.portable.lessonPlan.manifest.sha256,
      }
    : { id: 'sample-lesson', version: '1.0.0', sha256: SHA_B };
  const armCount = options.armCount ?? 1;
  const arms = Array.from({ length: armCount }, (_, index) => ({
    id: `arm-${index + 1}`,
    label: `Arm ${index + 1}`,
    inferencePolicy: {
      gateway: 'openrouter' as const,
      endpoint: 'https://openrouter.ai/api/v1/chat/completions' as const,
      requestedModelId: 'openai/gpt-5.4-mini',
      provider: {
        only: ['openai'] as const,
        policyUrl: 'https://openai.com/policies/privacy-policy/',
        allowFallbacks: false as const,
        requireParameters: true as const,
        zeroDataRetention: true as const,
        dataCollection: 'deny' as const,
      },
      temperature: 0.2,
      topP: 0.9,
      maxTokens: 4096,
      seed: 42,
      stream: false as const,
      historyWindowMessages: 10,
    },
    viewerPolicy: {
      version: '1.0' as const,
      allowSeriesSwitch: true,
      allowFrameNavigation: true,
      allowWindowLevel: true,
      allowPanZoom: true,
      allowAnnotations: true,
      allowSegmentation: false,
    },
    capturePolicy: {
      version: '1.0' as const,
      pipelineVersion: 'caseattend-canvas-jpeg-v1' as const,
      trigger: 'send' as const,
      source: 'current-view' as const,
      format: 'image/jpeg' as const,
      quality: 0.9 as const,
      includeVisibleAnnotations: true,
      includeTutorPointers: false as const,
      bakeViewportTransform: true as const,
    },
    caseSteps: [{
      id: 'step-1',
      casePackageRef,
      lessonPlanRef,
      learnerLevel: options.learnerLevel ?? 'undergrad',
      mode: 'chat' as const,
      systemPromptSha256: SHA_A,
      requestTemplateVersion: '1.0' as const,
    }],
  }));

  return {
    version: '1.0.0',
    id: 'sample-study',
    title: 'Sample VLM education study',
    application: {
      name: 'CaseAttend',
      version: '0.3.0',
      buildRevision: 'abcdef1234567890',
      sourceTreeUrl: 'https://github.com/example/caseattend/tree/abcdef1234567890',
    },
    deployment: {
      origin: 'https://study.example.edu',
      operatorName: 'Example University',
      privacyPolicyUrl: 'https://study.example.edu/privacy',
    },
    oversight: options.oversight ?? { status: 'draft' },
    protocol: {
      design: 'exploratory',
      purpose: 'Evaluate how a frozen VLM teaching condition affects image-description practice.',
      population: {
        description: 'Adult learners enrolled in an image-based education course.',
        includesMinors: false,
        vulnerableGroups: [],
      },
      hypotheses: [],
      objectives: [{ id: 'objective-1', description: 'Estimate change in a prespecified learning outcome.' }],
      outcomes: [{ id: 'outcome-1', description: 'Difference between pre-study and post-study task responses.' }],
    },
    arms,
    assignment: armCount === 1
      ? { method: 'fixed', armId: 'arm-1' }
      : {
          method: 'sha256-weighted-v1',
          allocations: arms.map((arm) => ({ armId: arm.id, weight: 1 })),
        },
    tasks: {
      pre: [{
        id: 'confidence-pre',
        title: 'Confidence before the lesson',
        instructions: 'Choose the number that best represents your confidence.',
        response: { kind: 'integer-scale', min: 1, max: 5, minLabel: 'Low', maxLabel: 'High' },
      }],
      post: [{
        id: 'confidence-post',
        title: 'Confidence after the lesson',
        instructions: 'Choose the number that best represents your confidence.',
        response: { kind: 'integer-scale', min: 1, max: 5, minLabel: 'Low', maxLabel: 'High' },
      }],
    },
    collection: {
      sessionEvents: {
        enabled: true,
        schema: 'caseattend.research-record',
        schemaVersion: '1.0',
      },
      taskResponses: {
        enabled: true,
        schema: 'caseattend.research-task-response',
        schemaVersion: '1.0',
      },
      currentViewCapture: {
        generated: 'on-send',
        transmittedToInferenceGateway: true,
        storedInSessionEvents: false,
        exported: false,
      },
    },
    dataManagement: {
      browserStorage: 'indexeddb-required',
      automaticRemoteSync: false,
      studyExport: 'manual-file-export',
      exportFormats: ['jsonl', 'csv'],
      browserDeleteAfter: '2027-01-01T00:00:00Z',
      exportedCopiesDeleteAfter: '2028-01-01T00:00:00Z',
      accessRoles: ['principal-investigator', 'data-analyst'],
      deletionInstructions: 'Delete the browser study record and every exported copy on the listed dates.',
      dataFlow: {
        inference: {
          endpoint: 'https://openrouter.ai/api/v1/chat/completions',
          sent: ['system-prompt', 'learner-message', 'current-view-image'],
          received: ['model-response'],
          occurs: 'when-participant-sends',
          authentication: {
            method: 'browser-held-openrouter-api-key',
            storage: 'browser-local-storage',
            sentTo: 'openrouter-only',
            includedInResearchRecords: false,
          },
        },
        studyExport: { destination: 'research-team', automaticUpload: false },
      },
    },
    participantInformation: {
      version: '1.0.0',
      language: 'en',
      keyInformation: 'You are being asked to try an AI-assisted image lesson for a research study.',
      purpose: 'The study examines learning with an image-aware AI tutor.',
      procedures: 'Complete a short task, use the lesson, then complete a second task.',
      risks: 'The model may be wrong, biased, or produce unexpected language.',
      benefits: 'You may not receive a direct benefit.',
      privacy: 'A study-specific pseudonymous ID is used; follow the study instructions about personal information.',
      voluntaryParticipation: 'Taking part is voluntary, and you may stop without penalty.',
      compensation: 'No compensation is offered.',
      vlmDisclosure: {
        term: 'vision-language model (VLM)',
        plainLanguage: 'A vision-language model is a frontier AI model that can respond to both images and words.',
        limitations: 'It can miss image details, invent facts, and produce different responses from similar inputs.',
        notMedicalAdvice: true,
      },
      contacts: [{ name: 'Study Team', role: 'Principal investigator', email: 'study@example.edu' }],
      acknowledgement: { kind: 'required' },
    },
  };
}

export async function makeResearchManifest(options: Parameters<typeof makeResearchManifestInput>[0] = {}): Promise<ResearchManifestV1> {
  return createResearchManifestV1(makeResearchManifestInput(options));
}

export async function populateResearchSystemPromptHashes(
  input: ResearchManifestCreateInput,
  portableCases: readonly PortableCasePackageV1[],
): Promise<ResearchManifestCreateInput> {
  const arms = await Promise.all(input.arms.map(async (arm) => ({
    ...arm,
    caseSteps: await Promise.all(arm.caseSteps.map(async (step) => {
      const portable = portableCases.find((candidate) => (
        candidate.casePackage.id === step.casePackageRef.id
        && candidate.casePackage.schemaVersion === step.casePackageRef.schemaVersion
        && candidate.casePackage.manifest.sha256 === step.casePackageRef.sha256
        && candidate.lessonPlan.id === step.lessonPlanRef.id
        && candidate.lessonPlan.version === step.lessonPlanRef.version
        && candidate.lessonPlan.manifest.sha256 === step.lessonPlanRef.sha256
      ));
      if (!portable) throw new Error(`No exact portable fixture resolves research step '${step.id}'.`);
      const composed = await composeLessonPrompt(portable.lessonPlan, {
        learnerLevel: step.learnerLevel,
        mode: step.mode,
        hasImage: true,
        caseContext: {
          id: portable.casePackage.id,
          title: portable.casePackage.title,
          vignette: portable.casePackage.vignette,
          neutralDescription: portable.casePackage.neutralDescription,
          domain: portable.casePackage.domain,
        },
      });
      const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(composed.providerPrompt),
      );
      return {
        ...step,
        systemPromptSha256: Array.from(
          new Uint8Array(digest),
          (byte) => byte.toString(16).padStart(2, '0'),
        ).join(''),
      };
    })),
  })));
  return { ...input, arms };
}
