import {
  CORE_MAX_ARTIFACT_BYTES,
  createCaseAttendEngine,
  type CancellationSignal,
  type CaseMaterial,
  type CoreEventV1,
  type DomainPlugin,
  type InferenceResult,
} from '../core';
import { streamChatResponse } from './aiClient';

/** The tutor UI depends on orchestration, not a provider-specific client. */
export interface TeachingEnginePort {
  runTurn: typeof streamChatResponse;
}

/** Isolated component tests retain their established aiClient mock boundary. */
export const compatibilityTeachingEngine: TeachingEnginePort = Object.freeze({
  runTurn: streamChatResponse,
});

type BrowserTurnArguments = Parameters<typeof streamChatResponse>;
type BrowserTurnResult = Awaited<ReturnType<typeof streamChatResponse>>;
type BrowserCaseMaterial = CaseMaterial;

interface PendingBrowserTurn {
  readonly args: BrowserTurnArguments;
  result?: BrowserTurnResult;
  error?: unknown;
}

export interface BrowserTeachingEngine extends TeachingEnginePort {
  contract(): { readonly contractVersion: '1.0' };
  diagnostics(): { readonly activeTurns: number };
}

export interface BrowserTeachingEngineOptions {
  /** Metadata-only core lifecycle observer; production leaves this unset. */
  readonly onCoreEvent?: (event: CoreEventV1) => void | Promise<void>;
}

function dataUrlBytes(value: string): { bytes: Uint8Array; mimeType: string } {
  const match = /^data:([^;,]{1,128});base64,([A-Za-z0-9+/=\r\n]+)$/.exec(value);
  if (!match) throw new Error('The submitted view is not a base64 data URL.');
  const mimeType = match[1];
  if (mimeType !== 'image/jpeg' && mimeType !== 'image/png' && mimeType !== 'image/webp') throw new Error('The submitted view uses an unsupported image format.');
  const encoded = match[2].replace(/[\r\n]/g, '');
  if (encoded.length > Math.ceil(CORE_MAX_ARTIFACT_BYTES / 3) * 4) throw new Error('The submitted view is too large.');
  const decoded = globalThis.atob(encoded);
  if (decoded.length === 0 || decoded.length > CORE_MAX_ARTIFACT_BYTES) throw new Error('The submitted view is empty or too large.');
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
  return { bytes, mimeType };
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const stableBytes = new Uint8Array(bytes);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', stableBytes.buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function coreFinishReason(reason: BrowserTurnResult['finishReason']): InferenceResult['finishReason'] {
  if (reason === 'stop' || reason === 'length') return reason;
  if (reason === 'content_filter') return 'filtered';
  return reason ? 'other' : undefined;
}

function cancellationSignal(signal?: AbortSignal): CancellationSignal {
  return {
    get cancelled() { return signal?.aborted === true; },
    get reason() { return signal?.aborted ? 'cancelled' as const : undefined; },
    throwIfCancelled() {
      if (signal?.aborted) throw new Error('Teaching turn cancelled.');
    },
  };
}

const domainIds = ['radiology', 'pathology', 'dermatology'] as const;
const browserDomains: readonly DomainPlugin<BrowserCaseMaterial>[] = domainIds.map((id) => Object.freeze({
  id,
  displayName: `${id[0].toUpperCase()}${id.slice(1)}`,
  supports: (caseMaterial: BrowserCaseMaterial) => caseMaterial.domainId === id,
}));

/**
 * Builds the production browser bridge around the public headless factory.
 * Raw messages, screenshots, callbacks, and provider errors live only in a
 * short-lived closure map; the core event contract contains metadata only.
 */
export function createBrowserTeachingEngine(
  options: BrowserTeachingEngineOptions = {},
): BrowserTeachingEngine {
  const pendingTurns = new Map<string, PendingBrowserTurn>();
  let nextContextId = 0;

  const contextFor = (caseMaterial: BrowserCaseMaterial): PendingBrowserTurn => {
    const context = pendingTurns.get(caseMaterial.id);
    if (!context) throw new Error('Browser teaching context is no longer active.');
    return context;
  };

  const coreEngine = createCaseAttendEngine<BrowserCaseMaterial>({
    caseRegistry: {
      async listCases() { return []; },
      async getCase(contextId) {
        const context = pendingTurns.get(contextId);
        if (!context) return undefined;
        return {
          id: contextId,
          title: 'Active teaching case',
          domainId: context.args[6] ?? 'radiology',
          // The browser bridge deliberately keeps the app package in its
          // private context; core only needs an opaque host payload here.
          casePackage: Object.freeze({}),
        };
      },
    },
    artifactLoader: {
      async loadArtifact({ caseMaterial }) {
        const submittedView = contextFor(caseMaterial).args[3];
        if (!submittedView) throw new Error('No submitted view is available.');
        return dataUrlBytes(submittedView);
      },
    },
    domains: browserDomains,
    promptComposer: {
      async compose({ caseMaterial, learnerMessage }) {
        const requestedModel = contextFor(caseMaterial).args[9];
        return { prompt: learnerMessage, ...(requestedModel ? { requestedModel } : {}) };
      },
    },
    inference: async ({ caseMaterial, onTextDelta }): Promise<InferenceResult> => {
      const context = contextFor(caseMaterial);
      let text = '';
      const originalOnChunk = context.args[4];
      const args: BrowserTurnArguments = [...context.args];
      args[4] = (chunk, sources, toolCalls, suggestions, fullTextReplace, pointers) => {
        text = fullTextReplace === undefined ? text + chunk : fullTextReplace;
        if (chunk) onTextDelta(chunk);
        originalOnChunk(chunk, sources, toolCalls, suggestions, fullTextReplace, pointers);
      };
      try {
        const result = await streamChatResponse(...args);
        context.result = result;
        return {
          text,
          modelId: result.resolvedModelId ?? result.model,
          ...(result.upstreamProviderId ? { routeId: result.upstreamProviderId } : {}),
          finishReason: coreFinishReason(result.finishReason),
          usage: result.usage,
        };
      } catch (error) {
        // Core normalizes arbitrary adapters. Restore the app's already-closed
        // SafeInferenceError after the core records its terminal transition.
        context.error = error;
        throw error;
      }
    },
    destination: {
      kind: 'teaching',
      sessionStore: { append: (event) => options.onCoreEvent?.(event) },
    },
    platform: { now: () => Date.now(), randomId: () => globalThis.crypto.randomUUID(), sha256 },
  });

  return Object.freeze({
    async runTurn(...args: BrowserTurnArguments): Promise<BrowserTurnResult> {
      nextContextId += 1;
      const contextId = `browser-turn-${nextContextId}`;
      const context: PendingBrowserTurn = { args: [...args] };
      pendingTurns.set(contextId, context);
      try {
        await coreEngine.runTurn({
          caseId: contextId,
          learnerMessage: args[0],
          learnerLevel: args[2],
          mode: args[1],
          hasImage: Boolean(args[3]),
          // aiClient already received the exact, bounded conversation window
          // in learnerMessage; do not duplicate it in the provider prompt.
          historyWindowMessages: [],
          ...(args[3] ? {
            artifact: {
              id: 'submitted-view',
              mimeType: args[3].slice(5, args[3].indexOf(';')),
            },
          } : {}),
          signal: cancellationSignal(args[8]),
        });
        if (!context.result) throw new Error('The inference adapter completed without a result.');
        return context.result;
      } catch (error) {
        if (context.error !== undefined) throw context.error;
        throw error;
      } finally {
        pendingTurns.delete(contextId);
      }
    },
    contract: () => coreEngine.toJSON(),
    diagnostics: () => Object.freeze({ activeTurns: pendingTurns.size }),
  });
}

export const browserTeachingEngine = createBrowserTeachingEngine();

export function browserTeachingEngineContract(): ReturnType<BrowserTeachingEngine['contract']> {
  return browserTeachingEngine.contract();
}
