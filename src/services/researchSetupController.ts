import { APP_VERSION, BUILD_REVISION, SOURCE_TREE_URL } from '../appVersion';
import type { CasePackageV1 } from '../core/casePackage';
import { composeLessonPrompt, getLessonPlanRef, type LessonPlanV1 } from '../core/lessonPlan';
import { sha256Hex, type PortableCasePackageV1 } from '../core/portableCasePackage';
import {
  computeResearchInferencePolicyHash,
  createResearchManifestV1,
  getResearchManifestRef,
  verifyResearchManifestHash,
  type ResearchManifestCreateInput,
  type ResearchManifestV1Draft,
  type ResearchArmV1,
  type ResearchCaseStepV1,
  type ResearchRawChatPolicyV1,
  type ResearchTaskV1,
} from '../core/researchManifest';
import {
  checkResearchStudyLaunchReadiness,
  createResearchStudyBundleV1,
  resolveResearchStudyCase,
  type ResearchStudyBundleV1,
} from '../core/researchStudyBundle';
import { listCasePackages, casePackageToSeries } from '../data/caseRegistry';
import { requireLessonPlanForCase } from '../data/lessonRegistry';
import type {
  FrozenResearchSetup,
  ResearchMaterialOption,
  ResearchSetupDraft,
} from '../components/ResearchSetupWizard/ResearchSetupWizard';
import { getResearchSetupTaskDrafts } from '../components/ResearchSetupWizard/ResearchSetupWizard';
import type {
  ParticipantArmLaunchConfig,
  ParticipantLaunchConfig,
} from '../components/ParticipantMode/ParticipantMode';
import type { Series } from '../types';
import { activateResearchStudyAssets } from './researchAssetResolver';
import { snapshotResearchMaterial } from './researchMaterialSnapshot';
import {
  exportResearchSupportPacket,
  RESEARCH_SUPPORT_PACKET_EXTENSION,
  RESEARCH_SUPPORT_PACKET_MIME_TYPE,
} from './researchPacketArchive';
import { ResearchRecorder } from './researchRecorder';
import {
  researchStore,
  type ResearchStorageStatus,
  type ResearchStore,
} from './researchStore';

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions' as const;
const VLM_PLAIN_LANGUAGE = 'A vision-language model, or VLM, is an AI model that can interpret images and words together. Many current frontier models are VLMs, but the terms are not synonyms.';
const VLM_LIMITATIONS = 'A VLM can miss image details, invent facts, reflect bias, and give different answers to similar inputs. The configured tutor is an educational tool, not medical advice.';

export interface ResearchSetupMaterialSource {
  option: ResearchMaterialOption;
  casePackage: CasePackageV1;
  lessonPlan: LessonPlanV1;
}

type ControllerStore = Pick<
  ResearchStore,
  | 'getStatus'
  | 'subscribeStatus'
  | 'initialize'
  | 'saveDraft'
  | 'saveStudyBundle'
  | 'getStudyBundle'
  | 'startRun'
  | 'append'
  | 'endRun'
>;

export interface ResearchSetupControllerDependencies {
  store?: ControllerStore;
  listMaterialSources?: () => Promise<readonly ResearchSetupMaterialSource[]>;
  snapshotMaterial?: (
    casePackage: CasePackageV1,
    lessonPlan: LessonPlanV1,
  ) => Promise<PortableCasePackageV1>;
  activateAssets?: (bundle: ResearchStudyBundleV1) => Promise<() => void>;
  startRecorder?: (options: {
    store: ControllerStore;
    bundle: ResearchStudyBundleV1;
    participantCode: string;
  }) => Promise<ResearchRecorder>;
  downloadFile?: (bytes: Uint8Array, fileName: string, mimeType: string) => void;
  now?: () => Date;
  deploymentOrigin?: () => string;
  application?: {
    version: string;
    buildRevision: string;
    sourceTreeUrl: string;
  };
}

export interface ResearchParticipantSession {
  participantReference: string;
  armId: string;
  recorder: ResearchRecorder;
  bundle: ResearchStudyBundleV1;
  arm: ResearchArmV1;
  step: ResearchCaseStepV1;
  inferenceConfigSha256: string;
  portableCase: PortableCasePackageV1;
  series: readonly Series[];
  releaseAssets: () => void;
}

export interface ResearchSupportPacketResult {
  bytes: Uint8Array;
  fileName: string;
  bundle: ResearchStudyBundleV1;
}

function lines(value: string): string[] {
  return value.split('\n').map((entry) => entry.trim()).filter(Boolean);
}

function localDateTimeToIso(value: string, field: string): string {
  const timestamp = new Date(value);
  if (!value || Number.isNaN(timestamp.getTime())) {
    throw new Error(`${field} must be an absolute date and time.`);
  }
  return timestamp.toISOString();
}

function stableIds(prefix: string, values: readonly string[]): readonly { id: string; text: string }[] {
  const used = new Map<string, number>();
  return values.map((text, index) => {
    const slug = text
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48)
      .replace(/-+$/g, '') || `item-${index + 1}`;
    const base = `${prefix}-${slug}`;
    const count = (used.get(base) ?? 0) + 1;
    used.set(base, count);
    return { id: count === 1 ? base : `${base}-${count}`, text };
  });
}

function optionFor(casePackage: CasePackageV1, lessonPlan: LessonPlanV1): ResearchMaterialOption {
  const lessonRef = getLessonPlanRef(lessonPlan);
  return {
    key: `${casePackage.id}--${casePackage.manifest.sha256.slice(0, 12)}--${lessonRef.sha256.slice(0, 12)}`,
    title: casePackage.title,
    domain: casePackage.domain,
    caseRef: {
      id: casePackage.id,
      schemaVersion: casePackage.schemaVersion,
      sha256: casePackage.manifest.sha256,
    },
    lessonRef,
    snapshotBehavior: casePackage.preview.src.startsWith('case://assets/')
      ? 'reuse-exact-portable'
      : 'reencode-built-in',
  };
}

async function defaultMaterialSources(): Promise<readonly ResearchSetupMaterialSource[]> {
  const cases = await listCasePackages();
  return Promise.all(cases.map(async (casePackage) => {
    const lessonPlan = await requireLessonPlanForCase(casePackage);
    return { option: optionFor(casePackage, lessonPlan), casePackage, lessonPlan };
  }));
}

function defaultOrigin(): string {
  return globalThis.location?.origin ?? '';
}

function defaultDownload(bytes: Uint8Array, fileName: string, mimeType: string): void {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new Error('This browser cannot create a local support-packet download.');
  }
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const url = URL.createObjectURL(new Blob([copy], { type: mimeType }));
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = 'noopener';
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function manifestDraft(bundle: ResearchStudyBundleV1): ResearchManifestV1Draft {
  const { manifest: _manifest, ...draft } = bundle.researchManifest;
  return draft;
}

function cloneDraft(draft: ResearchSetupDraft): ResearchSetupDraft {
  return structuredClone(draft);
}

function participantInformationText(config: ParticipantLaunchConfig): string {
  const info = config.participantInformation;
  return [
    info.keyInformation,
    `Purpose: ${info.purpose}`,
    `Procedures: ${info.procedures}`,
    `Risks: ${info.risks}`,
    `Benefits: ${info.benefits}`,
    `Privacy: ${info.privacy}`,
    `Voluntary participation: ${info.voluntaryParticipation}`,
    `Compensation: ${info.compensation}`,
    info.vlmDisclosure.plainLanguage,
    info.vlmDisclosure.limitations,
  ].join('\n\n');
}

export class ResearchSetupController {
  private readonly store: ControllerStore;
  private readonly listMaterialSourcesDependency: () => Promise<readonly ResearchSetupMaterialSource[]>;
  private readonly snapshotMaterialDependency: NonNullable<ResearchSetupControllerDependencies['snapshotMaterial']>;
  private readonly activateAssetsDependency: NonNullable<ResearchSetupControllerDependencies['activateAssets']>;
  private readonly startRecorderDependency: NonNullable<ResearchSetupControllerDependencies['startRecorder']>;
  private readonly downloadFile: NonNullable<ResearchSetupControllerDependencies['downloadFile']>;
  private readonly now: () => Date;
  private readonly deploymentOrigin: () => string;
  private readonly application: NonNullable<ResearchSetupControllerDependencies['application']>;
  private readonly materialSources = new Map<string, ResearchSetupMaterialSource>();
  private readonly portableCache = new Map<string, Promise<PortableCasePackageV1>>();

  constructor(dependencies: ResearchSetupControllerDependencies = {}) {
    this.store = dependencies.store ?? researchStore;
    this.listMaterialSourcesDependency = dependencies.listMaterialSources ?? defaultMaterialSources;
    this.snapshotMaterialDependency = dependencies.snapshotMaterial ?? snapshotResearchMaterial;
    this.activateAssetsDependency = dependencies.activateAssets ?? activateResearchStudyAssets;
    this.startRecorderDependency = dependencies.startRecorder ?? (async (options) => ResearchRecorder.start(options));
    this.downloadFile = dependencies.downloadFile ?? defaultDownload;
    this.now = dependencies.now ?? (() => new Date());
    this.deploymentOrigin = dependencies.deploymentOrigin ?? defaultOrigin;
    this.application = dependencies.application ?? {
      version: APP_VERSION,
      buildRevision: BUILD_REVISION,
      sourceTreeUrl: SOURCE_TREE_URL,
    };
  }

  getStorageStatus(): ResearchStorageStatus {
    return this.store.getStatus();
  }

  subscribeStorageStatus(listener: (status: ResearchStorageStatus) => void): () => void {
    return this.store.subscribeStatus(listener);
  }

  initialize(): Promise<ResearchStorageStatus> {
    return this.store.initialize();
  }

  async listMaterials(): Promise<readonly ResearchMaterialOption[]> {
    const sources = await this.listMaterialSourcesDependency();
    const next = new Map<string, ResearchSetupMaterialSource>();
    for (const source of sources) {
      const expected = optionFor(source.casePackage, source.lessonPlan);
      const option = { ...expected, ...source.option };
      if (
        option.caseRef.id !== expected.caseRef.id
        || option.caseRef.sha256 !== expected.caseRef.sha256
        || option.lessonRef.id !== expected.lessonRef.id
        || option.lessonRef.sha256 !== expected.lessonRef.sha256
      ) {
        throw new Error(`Research material '${source.casePackage.id}' has stale source references.`);
      }
      if (next.has(option.key)) throw new Error(`Research material key '${option.key}' is duplicated.`);
      next.set(option.key, { ...source, option });
    }
    this.materialSources.clear();
    next.forEach((source, key) => this.materialSources.set(key, source));
    return [...next.values()].map((source) => structuredClone(source.option));
  }

  private async resolveMaterial(key: string): Promise<ResearchSetupMaterialSource> {
    if (!this.materialSources.has(key)) await this.listMaterials();
    const source = this.materialSources.get(key);
    if (!source) throw new Error('The selected case and lesson are no longer available. Select the material again.');
    return source;
  }

  private async snapshot(key: string): Promise<PortableCasePackageV1> {
    const source = await this.resolveMaterial(key);
    const cacheKey = `${source.casePackage.manifest.sha256}\0${source.lessonPlan.manifest.sha256}`;
    let pending = this.portableCache.get(cacheKey);
    if (!pending) {
      pending = this.snapshotMaterialDependency(source.casePackage, source.lessonPlan);
      this.portableCache.set(cacheKey, pending);
      pending.catch(() => this.portableCache.delete(cacheKey));
    }
    return pending;
  }

  private assertReviewedForFreeze(draft: ResearchSetupDraft): void {
    const missing: string[] = [];
    if (!draft.providerReviewConfirmed) missing.push('provider terms and data practices');
    if (!draft.dataFlowReviewConfirmed) missing.push('the deployed browser-to-provider data flow');
    if (missing.length > 0) {
      throw new Error(`Complete the required researcher review of ${missing.join(' and ')} before creating a frozen configuration.`);
    }
    if (this.application.buildRevision === 'development') {
      throw new Error('A frozen research configuration requires a reproducible commit build. Build CaseAttend from a recorded source revision instead of the development build.');
    }
  }

  private async createBundle(
    draft: ResearchSetupDraft,
    options: { requireResearcherReview?: boolean } = {},
  ): Promise<ResearchStudyBundleV1> {
    if (options.requireResearcherReview) this.assertReviewedForFreeze(draft);
    else if (this.application.buildRevision === 'development') {
      throw new Error('A validated research draft or support packet requires a reproducible commit build. Build CaseAttend from a recorded source revision instead of the development build.');
    }
    const portable = await this.snapshot(draft.materialKey);
    const caseRef = {
      id: portable.casePackage.id,
      schemaVersion: portable.casePackage.schemaVersion,
      sha256: portable.casePackage.manifest.sha256,
    } as const;
    const lessonRef = getLessonPlanRef(portable.lessonPlan);
    const context = {
      id: portable.casePackage.id,
      title: portable.casePackage.title,
      vignette: portable.casePackage.vignette,
      neutralDescription: portable.casePackage.neutralDescription,
      domain: portable.casePackage.domain,
    };

    const arms = await Promise.all(draft.arms.map(async (arm) => {
      const prompt = await composeLessonPrompt(portable.lessonPlan, {
        learnerLevel: arm.learnerLevel,
        mode: arm.mode,
        hasImage: true,
        caseContext: context,
      });
      const stack = portable.casePackage.artifact.kind === 'image-stack'
        ? portable.casePackage.artifact
        : null;
      return {
        id: arm.id.trim(),
        label: arm.label.trim(),
        inferencePolicy: {
          gateway: 'openrouter' as const,
          endpoint: OPENROUTER_ENDPOINT,
          requestedModelId: arm.model.trim(),
          provider: {
            only: [arm.providerId.trim()] as const,
            policyUrl: arm.providerPolicyUrl.trim(),
            allowFallbacks: false as const,
            requireParameters: true as const,
            zeroDataRetention: true as const,
            dataCollection: 'deny' as const,
          },
          temperature: arm.temperature,
          topP: arm.topP,
          maxTokens: arm.maxTokens,
          stream: false as const,
          historyWindowMessages: arm.historyWindowMessages,
        },
        viewerPolicy: {
          version: '1.0' as const,
          allowSeriesSwitch: Boolean(stack && stack.series.length > 1 && portable.casePackage.artifactHints.showSeriesSelector),
          allowFrameNavigation: Boolean(stack && stack.series.some((series) => series.frames.length > 1)),
          allowWindowLevel: portable.casePackage.artifactHints.showWindowLevel,
          allowPanZoom: true,
          allowAnnotations: arm.allowAnnotations,
          allowSegmentation: false,
        },
        capturePolicy: {
          version: '1.0' as const,
          pipelineVersion: 'caseattend-canvas-jpeg-v1' as const,
          trigger: 'send' as const,
          source: 'current-view' as const,
          format: 'image/jpeg' as const,
          quality: 0.9 as const,
          includeVisibleAnnotations: arm.allowAnnotations,
          includeTutorPointers: false as const,
          bakeViewportTransform: true as const,
        },
        caseSteps: [{
          id: 'step-1',
          casePackageRef: caseRef,
          lessonPlanRef: lessonRef,
          learnerLevel: arm.learnerLevel,
          mode: arm.mode,
          systemPromptSha256: await sha256Hex(new TextEncoder().encode(prompt.providerPrompt)),
          requestTemplateVersion: '1.0' as const,
        }],
      };
    }));

    const hypotheses = stableIds('hypothesis', lines(draft.hypotheses))
      .map(({ id, text }) => ({ id, statement: text }));
    const objectives = stableIds('objective', lines(draft.objectives))
      .map(({ id, text }) => ({ id, description: text }));
    const outcomes = stableIds('outcome', lines(draft.outcomes))
      .map(({ id, text }) => ({ id, description: text }));
    const tasks = getResearchSetupTaskDrafts(draft).map((task): ResearchTaskV1 & { phase: 'pre' | 'post' } => {
      const response: ResearchTaskV1['response'] = task.responseKind === 'single-choice'
        ? {
            kind: 'single-choice',
            options: task.options.map((option) => ({
              id: option.id.trim(),
              label: option.label.trim(),
            })),
          }
        : task.responseKind === 'integer-scale'
          ? {
              kind: 'integer-scale',
              min: task.min,
              max: task.max,
              minLabel: task.minLabel.trim(),
              maxLabel: task.maxLabel.trim(),
            }
          : { kind: 'none' };
      return {
        id: task.id.trim(),
        title: task.title.trim(),
        instructions: task.instructions.trim(),
        response,
        phase: task.phase,
      };
    });
    const rawChat: ResearchRawChatPolicyV1 = draft.rawChatEnabled
      ? {
          enabled: true,
          purpose: draft.rawChatJustification.trim(),
          includes: [
            ...(draft.rawChatIncludesLearnerText ? ['learner-text' as const] : []),
            ...(draft.rawChatIncludesModelText ? ['model-text' as const] : []),
          ],
          participantDisclosure: draft.rawChatParticipantDisclosure.trim(),
          accessRoles: ['research-team'],
        }
      : { enabled: false };
    const oversight = draft.oversight.status === 'institution-determined'
      ? {
          status: 'institution-determined' as const,
          determination: draft.oversight.determination,
          institutionName: draft.oversight.institutionName.trim(),
          protocolReference: draft.oversight.protocolReference.trim(),
          determinedAt: localDateTimeToIso(draft.oversight.determinedAt, 'Institutional determination time'),
        }
      : { status: 'draft' as const };

    const input: ResearchManifestCreateInput = {
      version: draft.version.trim(),
      id: draft.id.trim(),
      title: draft.title.trim(),
      application: {
        name: 'CaseAttend',
        version: this.application.version,
        buildRevision: this.application.buildRevision,
        sourceTreeUrl: this.application.sourceTreeUrl,
      },
      deployment: {
        origin: this.deploymentOrigin(),
        operatorName: draft.deploymentOperatorName.trim(),
        privacyPolicyUrl: draft.deploymentPrivacyPolicyUrl.trim(),
      },
      oversight,
      protocol: {
        design: draft.protocolDesign,
        purpose: draft.purpose.trim(),
        population: {
          description: draft.population.trim(),
          includesMinors: draft.includesMinors,
          vulnerableGroups: lines(draft.vulnerableGroups),
        },
        hypotheses,
        objectives,
        outcomes,
      },
      arms,
      assignment: draft.assignment === 'fixed'
        ? { method: 'fixed', armId: draft.fixedArmId.trim() }
        : {
            method: 'sha256-weighted-v1',
            allocations: draft.arms.map((arm) => ({
              armId: arm.id.trim(),
              weight: arm.allocationWeight,
            })),
          },
      tasks: {
        pre: tasks.filter((task) => task.phase === 'pre').map(({ phase: _phase, ...task }) => task),
        post: tasks.filter((task) => task.phase === 'post').map(({ phase: _phase, ...task }) => task),
      },
      collection: {
        sessionEvents: {
          enabled: true,
          schema: 'caseattend.research-record',
          schemaVersion: '1.0',
        },
        taskResponses: {
          enabled: tasks.some((task) => task.response.kind !== 'none'),
          schema: 'caseattend.research-task-response',
          schemaVersion: '1.0',
        },
        currentViewCapture: {
          generated: 'on-send',
          transmittedToInferenceGateway: true,
          storedInSessionEvents: false,
          exported: false,
        },
        rawChat,
      },
      dataManagement: {
        browserStorage: 'indexeddb-required',
        automaticRemoteSync: false,
        studyExport: 'manual-file-export',
        exportFormats: ['jsonl', 'csv'],
        browserDeleteAfter: localDateTimeToIso(draft.browserDeleteAfter, 'Browser record deletion time'),
        exportedCopiesDeleteAfter: localDateTimeToIso(draft.exportedCopiesDeleteAfter, 'Export deletion time'),
        accessRoles: lines(draft.accessRoles),
        deletionInstructions: draft.deletionProcedure.trim(),
        dataFlow: {
          inference: {
            endpoint: OPENROUTER_ENDPOINT,
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
        version: draft.version.trim(),
        language: 'en',
        keyInformation: draft.participantKeyInformation.trim(),
        purpose: draft.participantPurpose.trim(),
        procedures: draft.participantProcedures.trim(),
        risks: draft.participantRisks.trim(),
        benefits: draft.participantBenefits.trim(),
        privacy: draft.participantPrivacy.trim(),
        voluntaryParticipation: draft.participantVoluntaryParticipation.trim(),
        compensation: draft.participantCompensation.trim(),
        vlmDisclosure: {
          term: 'vision-language model (VLM)',
          plainLanguage: VLM_PLAIN_LANGUAGE,
          limitations: VLM_LIMITATIONS,
          notMedicalAdvice: true,
        },
        contacts: [{
          name: draft.contactName.trim(),
          role: draft.contactRole.trim(),
          email: draft.contactEmail.trim(),
        }],
        acknowledgement: { kind: 'required' },
      },
    };
    const manifest = await createResearchManifestV1(input);
    if (!await verifyResearchManifestHash(manifest)) {
      throw new Error('The frozen Research Manifest failed its integrity check.');
    }
    return createResearchStudyBundleV1(manifest, [portable]);
  }

  prepareBundle(draft: ResearchSetupDraft): Promise<ResearchStudyBundleV1> {
    return this.createBundle(cloneDraft(draft));
  }

  async saveDraft(draft: ResearchSetupDraft): Promise<void> {
    const bundle = await this.createBundle(cloneDraft(draft));
    const status = this.store.getStatus().mode === 'uninitialized'
      ? await this.store.initialize()
      : this.store.getStatus();
    if (!status.persistent) {
      throw new Error('Persistent browser storage is unavailable. Export a support packet instead of relying on this browser draft.');
    }
    await this.store.saveDraft(draft.id.trim(), manifestDraft(bundle));
  }

  async exportSupportPacket(
    draft: ResearchSetupDraft,
    frozen?: FrozenResearchSetup,
  ): Promise<ResearchSupportPacketResult> {
    const bundle = frozen?.bundle ?? await this.createBundle(cloneDraft(draft));
    const bytes = await exportResearchSupportPacket(bundle);
    const fileName = `${bundle.researchManifest.id}-${bundle.researchManifest.version}${RESEARCH_SUPPORT_PACKET_EXTENSION}`;
    this.downloadFile(bytes, fileName, RESEARCH_SUPPORT_PACKET_MIME_TYPE);
    return { bytes, fileName, bundle };
  }

  async freeze(draft: ResearchSetupDraft): Promise<FrozenResearchSetup> {
    const snapshot = cloneDraft(draft);
    const bundle = await this.createBundle(snapshot, { requireResearcherReview: true });
    const readiness = await checkResearchStudyLaunchReadiness(bundle);
    const status = this.store.getStatus().mode === 'uninitialized'
      ? await this.store.initialize()
      : this.store.getStatus();
    if (status.persistent) {
      await this.store.saveStudyBundle(bundle, { draftId: snapshot.id });
    }
    const ref = getResearchManifestRef(bundle.researchManifest);
    return {
      id: ref.id,
      version: ref.version,
      sha256: ref.sha256,
      frozenAt: this.now().toISOString(),
      draft: snapshot,
      bundle,
      launchErrors: readiness.errors,
    };
  }

  createParticipantLaunchConfig(frozen: FrozenResearchSetup): ParticipantLaunchConfig {
    const manifest = frozen.bundle.researchManifest;
    const arms: ParticipantArmLaunchConfig[] = manifest.arms.map((arm) => {
      const step = arm.caseSteps[0];
      if (!step) throw new Error(`Frozen arm '${arm.id}' has no teaching case step.`);
      return {
        id: arm.id,
        label: arm.label,
        caseRef: { id: step.casePackageRef.id, manifestSha256: step.casePackageRef.sha256 },
        lessonRef: step.lessonPlanRef,
        provider: arm.inferencePolicy.provider.only[0],
        model: arm.inferencePolicy.requestedModelId,
        temperature: arm.inferencePolicy.temperature,
        topP: arm.inferencePolicy.topP,
        learnerLevel: step.learnerLevel,
        captureSummary: arm.capturePolicy.includeVisibleAnnotations
          ? 'The visible current view and visible annotations are sent to the configured inference provider when you send a message. They are not stored in research session events or exports.'
          : 'The visible current view is sent to the configured inference provider when you send a message. Annotations are disabled, and the image is not stored in research session events or exports.',
      };
    });
    const providerDestinations = [...new Map(manifest.arms.map((arm) => {
      const upstreamProvider = arm.inferencePolicy.provider.only[0];
      return [`${upstreamProvider}\0${arm.inferencePolicy.provider.policyUrl}`, {
        gateway: 'OpenRouter' as const,
        gatewayUrl: arm.inferencePolicy.endpoint,
        upstreamProvider,
        policyUrl: arm.inferencePolicy.provider.policyUrl,
      }];
    })).values()];
    return {
      studyTitle: manifest.title,
      manifestRef: getResearchManifestRef(manifest),
      assignmentSummary: manifest.assignment.method === 'fixed'
        ? `Fixed assignment to arm ${manifest.assignment.armId}.`
        : `Deterministic weighted assignment across ${manifest.assignment.allocations.length} frozen arms using the study-scoped pseudonymous participant reference.`,
      arms,
      providerDestinations,
      participantInformation: manifest.participantInformation,
      dataFields: [
        'pseudonymous study-scoped participant reference',
        'structured session and task events',
        'current-view image fingerprint and dimensions, but not image pixels',
        'model/provider identifiers, timing, token counts when returned, and bounded error codes',
      ],
      rawChatEnabled: manifest.collection.rawChat.enabled,
      retentionSummary: `Browser records must be deleted after ${manifest.dataManagement.browserDeleteAfter}; exported copies after ${manifest.dataManagement.exportedCopiesDeleteAfter}. ${manifest.dataManagement.deletionInstructions}`,
      institutionDetermined: manifest.oversight.status === 'institution-determined',
    };
  }

  participantInformationText(frozen: FrozenResearchSetup): string {
    return participantInformationText(this.createParticipantLaunchConfig(frozen));
  }

  async startParticipant(
    frozen: FrozenResearchSetup,
    participantCode: string,
  ): Promise<ResearchParticipantSession> {
    const readiness = await checkResearchStudyLaunchReadiness(frozen.bundle);
    if (!readiness.valid) {
      throw new Error(`Participant launch is blocked:\n${readiness.errors.map((error) => `- ${error}`).join('\n')}`);
    }
    const recorder = await this.startRecorderDependency({
      store: this.store,
      bundle: frozen.bundle,
      participantCode,
    });
    let releaseAssets: (() => void) | null = null;
    try {
      const arm = frozen.bundle.researchManifest.arms.find((candidate) => candidate.id === recorder.context.armId);
      const step = arm?.caseSteps[0];
      if (!arm || !step) throw new Error('The assigned frozen arm has no exact teaching case.');
      const portableCase = resolveResearchStudyCase(
        frozen.bundle,
        step.casePackageRef,
        step.lessonPlanRef,
      );
      const inferenceConfigSha256 = await computeResearchInferencePolicyHash(arm.inferencePolicy);
      await recorder.record({ type: 'case_step_opened', caseStepId: step.id });
      releaseAssets = await this.activateAssetsDependency(frozen.bundle);
      return {
        participantReference: recorder.participantReference,
        armId: recorder.context.armId,
        recorder,
        bundle: frozen.bundle,
        arm,
        step,
        inferenceConfigSha256,
        portableCase,
        series: casePackageToSeries(portableCase.casePackage),
        releaseAssets,
      };
    } catch (error) {
      releaseAssets?.();
      await recorder.end('abandoned').catch(() => null);
      throw error;
    }
  }
}

export const researchSetupController = new ResearchSetupController();
