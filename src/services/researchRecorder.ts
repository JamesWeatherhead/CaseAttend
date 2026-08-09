import { canonicalizeJson } from '../core/casePackage';
import { getResearchManifestRef, type ResearchManifestRef } from '../core/researchManifest';
import { deriveResearchParticipantId } from '../core/researchParticipant';
import type { ResearchStudyBundleV1 } from '../core/researchStudyBundle';
import {
  ResearchStorageUnavailableError,
  researchStore,
  type ResearchRecordPayloadV1,
  type ResearchRecordV1,
  type ResearchRunV1,
  type ResearchStore,
} from './researchStore';

export interface ResearchRecorderContext {
  runId: string;
  manifestRef: ResearchManifestRef;
  participantId: string;
  armId: string;
}

export interface StartResearchRecorderOptions {
  store?: Pick<
    ResearchStore,
    'getStatus' | 'initialize' | 'getStudyBundle' | 'startRun' | 'append' | 'endRun'
  >;
  bundle: ResearchStudyBundleV1;
  /**
   * An institution-assigned high-entropy pseudonymous code. It is used only
   * during this async call and is never retained on the recorder or in storage.
   */
  participantCode: string;
  runId?: string;
  startedAt?: string;
}

function studyManifest(bundle: ResearchStudyBundleV1) {
  const manifest = (bundle as unknown as { researchManifest?: unknown }).researchManifest;
  if (!manifest) throw new Error('The research study bundle is missing its manifest.');
  return manifest as Parameters<typeof getResearchManifestRef>[0];
}

/**
 * Immutable participant-run coordinator. The raw participant code exists only
 * as a local argument to `start`; subsequent writes use the derived
 * study-scoped pseudonymous identifier returned by the core privacy boundary.
 */
export class ResearchRecorder {
  readonly context: ResearchRecorderContext;

  private readonly store: Pick<ResearchStore, 'append' | 'endRun'>;
  private ended = false;

  private constructor(
    run: ResearchRunV1,
    store: Pick<ResearchStore, 'append' | 'endRun'>,
  ) {
    this.context = Object.freeze({
      runId: run.runId,
      manifestRef: structuredClone(run.manifestRef),
      participantId: run.participantId,
      armId: run.armId,
    });
    this.store = store;
  }

  static async start(options: StartResearchRecorderOptions): Promise<ResearchRecorder> {
    const store = options.store ?? researchStore;
    const status = store.getStatus().mode === 'uninitialized'
      ? await store.initialize()
      : store.getStatus();
    if (!status.launchAllowed || !status.persistent) {
      throw new ResearchStorageUnavailableError(
        status.mode === 'unavailable'
          ? status.reason
          : 'Persistent browser research storage has not been verified.',
      );
    }

    const manifest = studyManifest(options.bundle);
    const manifestRef = getResearchManifestRef(manifest);
    const frozen = await store.getStudyBundle(manifestRef.sha256);
    if (!frozen || canonicalizeJson(frozen) !== canonicalizeJson(options.bundle)) {
      throw new Error(
        'Freeze the exact validated study bundle in persistent storage before participant launch.',
      );
    }

    // Do not assign the raw code to an object, closure, URL, storage key, or
    // log. Core normalization/derivation validates its high-entropy format.
    const participantId = await deriveResearchParticipantId(manifest, options.participantCode);
    const run = await store.startRun({
      manifestSha256: manifestRef.sha256,
      participantId,
      ...(options.runId ? { runId: options.runId } : {}),
      ...(options.startedAt ? { startedAt: options.startedAt } : {}),
    });
    return new ResearchRecorder(run, store);
  }

  get isEnded(): boolean {
    return this.ended;
  }

  /** UI-safe study-scoped pseudonym; never the participant's entered code. */
  get participantReference(): string {
    return this.context.participantId;
  }

  record(payload: Exclude<ResearchRecordPayloadV1, { type: 'run_started' | 'run_ended' }>): Promise<ResearchRecordV1> {
    if (this.ended) {
      return Promise.reject(new Error(`Research run ${this.context.runId} has already ended.`));
    }
    return this.store.append(this.context.runId, payload);
  }

  async end(
    reason: Extract<ResearchRecordPayloadV1, { type: 'run_ended' }>['reason'] = 'completed',
  ): Promise<ResearchRecordV1 | null> {
    if (this.ended) return null;
    const record = await this.store.endRun(this.context.runId, reason);
    this.ended = true;
    return record;
  }

  /** Stop local writes after a deletion/invalidation without adding a record. */
  abandon(): void {
    this.ended = true;
  }
}
