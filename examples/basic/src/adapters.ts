import {
  createCaseAttendEngine,
  type ArtifactLoader,
  type ArtifactReference,
  type CaseMaterial,
  type CaseRegistry,
  type CoreEventV1,
  type CorePlatform,
  type DomainPlugin,
  type InferenceAdapter,
  type PromptComposer,
  type SessionStore,
} from '@caseattend/core';
import syntheticVisual from '../../shared/synthetic-visual.svg?raw';

export const NEUTRAL_DESCRIPTION = 'Three overlapping labeled shapes: a blue circle, an amber triangle, and a pink rounded rectangle on a dark grid.';

export const SYNTHETIC_CASE: CaseMaterial = Object.freeze({
  id: 'synthetic-shape-overlap',
  title: 'Synthetic shape overlap',
  domainId: 'visual-literacy',
  casePackage: Object.freeze({
    schemaVersion: 'example-1.0',
    synthetic: true,
    neutralDescription: NEUTRAL_DESCRIPTION,
  }),
  lessonId: 'describe-before-interpreting',
  artifactHints: Object.freeze({
    showWindowLevel: false,
    showSeriesSelector: false,
    showSegmentation: false,
  }),
});

export const CURRENT_VIEW: ArtifactReference = Object.freeze({
  id: 'synthetic-current-view',
  label: 'Static synthetic shape view',
  mimeType: 'image/svg+xml',
});

export const SYNTHETIC_VISUAL_DATA_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(syntheticVisual)}`;

class StaticCaseRegistry implements CaseRegistry {
  async listCases(): Promise<readonly CaseMaterial[]> {
    return [SYNTHETIC_CASE];
  }

  async getCase(caseId: string): Promise<CaseMaterial | undefined> {
    return caseId === SYNTHETIC_CASE.id ? SYNTHETIC_CASE : undefined;
  }
}

class StaticArtifactLoader implements ArtifactLoader {
  private readonly bytes = new TextEncoder().encode(syntheticVisual);

  async loadArtifact({ artifact }: Parameters<ArtifactLoader['loadArtifact']>[0]) {
    if (artifact.id !== CURRENT_VIEW.id) throw new Error('Unknown synthetic artifact.');
    return {
      bytes: new Uint8Array(this.bytes),
      mimeType: 'image/svg+xml',
    };
  }
}

export const visualLiteracyDomain: DomainPlugin = Object.freeze({
  id: 'visual-literacy',
  displayName: 'Visual literacy',
  supports: (material: CaseMaterial) => material.domainId === 'visual-literacy',
});

class ShapePromptComposer implements PromptComposer {
  async compose({ caseMaterial, learnerMessage, artifact }: Parameters<PromptComposer['compose']>[0]) {
    return {
      prompt: [
        'You are a visual-literacy tutor. Ask one question at a time.',
        `Case: ${caseMaterial.title}`,
        `Current artifact digest: ${artifact?.sha256 ?? 'none'}`,
        `Learner message: ${learnerMessage}`,
      ].join('\n'),
      requestedModel: 'local-deterministic-demo',
    };
  }
}

const mockInference: InferenceAdapter = async ({ learnerMessage }) => {
  const mentionsOverlap = /overlap|behind|front|cover/i.test(learnerMessage);
  return {
    text: mentionsOverlap
      ? 'Good observation. Which pair of shapes has the largest shared region, and what visible boundary supports your answer?'
      : 'Start with description before interpretation. Name two shapes, then describe where their visible boundaries meet.',
    modelId: 'local-deterministic-demo',
    finishReason: 'stop',
    usage: {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    },
  };
};

class MemorySessionStore implements SessionStore {
  constructor(private readonly onEvent: (event: CoreEventV1) => void) {}

  append(event: CoreEventV1): void {
    this.onEvent(structuredClone(event));
  }
}

const browserPlatform: CorePlatform = {
  now: () => Date.now(),
  randomId: () => crypto.randomUUID(),
  async sha256(bytes) {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', copy.buffer));
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  },
};

export function createBasicExampleEngine(onEvent: (event: CoreEventV1) => void) {
  return createCaseAttendEngine({
    caseRegistry: new StaticCaseRegistry(),
    artifactLoader: new StaticArtifactLoader(),
    domains: [visualLiteracyDomain],
    promptComposer: new ShapePromptComposer(),
    inference: mockInference,
    destination: {
      kind: 'teaching',
      sessionStore: new MemorySessionStore(onEvent),
    },
    platform: browserPlatform,
  });
}
