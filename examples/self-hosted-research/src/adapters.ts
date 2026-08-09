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
  type ResearchSink,
} from '@caseattend/core';
import syntheticVisual from '../../shared/synthetic-visual.svg?raw';

export const NEUTRAL_DESCRIPTION = 'Three overlapping labeled shapes: a blue circle, an amber triangle, and a pink rounded rectangle on a dark grid.';

export const RESEARCH_CASE: CaseMaterial = Object.freeze({
  id: 'synthetic-research-shapes',
  title: 'Synthetic visual reasoning study',
  domainId: 'visual-literacy-research',
  casePackage: Object.freeze({
    schemaVersion: 'example-1.0',
    synthetic: true,
    rawChatCollection: false,
  }),
  lessonId: 'observation-before-interpretation',
  artifactHints: Object.freeze({
    showWindowLevel: false,
    showSeriesSelector: false,
    showSegmentation: false,
  }),
});

export const CURRENT_VIEW: ArtifactReference = Object.freeze({
  id: 'research-current-view',
  label: 'Static synthetic research view',
  mimeType: 'image/svg+xml',
});

export const SYNTHETIC_VISUAL_DATA_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(syntheticVisual)}`;

class ResearchCaseRegistry implements CaseRegistry {
  async listCases(): Promise<readonly CaseMaterial[]> {
    return [RESEARCH_CASE];
  }

  async getCase(caseId: string): Promise<CaseMaterial | undefined> {
    return caseId === RESEARCH_CASE.id ? RESEARCH_CASE : undefined;
  }
}

class SyntheticArtifactLoader implements ArtifactLoader {
  private readonly bytes = new TextEncoder().encode(syntheticVisual);

  async loadArtifact({ artifact }: Parameters<ArtifactLoader['loadArtifact']>[0]) {
    if (artifact.id !== CURRENT_VIEW.id) throw new Error('Unknown synthetic artifact.');
    return {
      bytes: new Uint8Array(this.bytes),
      mimeType: 'image/svg+xml',
    };
  }
}

const researchDomain: DomainPlugin = Object.freeze({
  id: 'visual-literacy-research',
  displayName: 'Visual literacy research',
  supports: (material: CaseMaterial) => material.domainId === 'visual-literacy-research',
});

class ResearchPromptComposer implements PromptComposer {
  async compose({ caseMaterial, learnerMessage, artifact }: Parameters<PromptComposer['compose']>[0]) {
    return {
      prompt: [
        'You are a visual-literacy tutor in a synthetic research integration test.',
        'Ask one neutral follow-up question. Do not make clinical claims.',
        `Case: ${caseMaterial.title}`,
        `Artifact digest: ${artifact?.sha256 ?? 'none'}`,
        `Learner message: ${learnerMessage}`,
      ].join('\n'),
      requestedModel: 'local-deterministic-research-demo',
    };
  }
}

const deterministicResearchInference: InferenceAdapter = async ({ learnerMessage }) => ({
  text: learnerMessage.length > 48
    ? 'You included several details. Which one is a direct visual observation, and which one is an interpretation?'
    : 'What visible boundary or overlap would support that observation?',
  modelId: 'local-deterministic-research-demo',
  finishReason: 'stop',
  usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
});

class MemoryResearchSink implements ResearchSink {
  constructor(private readonly onRecord: (event: CoreEventV1) => void) {}

  async record(event: CoreEventV1): Promise<void> {
    // A real sink must validate again at its trust boundary. This example keeps
    // the already-validated, raw-free event in memory and makes no request.
    this.onRecord(structuredClone(event));
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

export function createResearchExampleEngine(onRecord: (event: CoreEventV1) => void) {
  return createCaseAttendEngine({
    caseRegistry: new ResearchCaseRegistry(),
    artifactLoader: new SyntheticArtifactLoader(),
    domains: [researchDomain],
    promptComposer: new ResearchPromptComposer(),
    inference: deterministicResearchInference,
    destination: {
      kind: 'research',
      researchSink: new MemoryResearchSink(onRecord),
    },
    platform: browserPlatform,
  });
}
