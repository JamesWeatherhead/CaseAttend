/**
 * AI Client: front-end inference dispatcher.
 *
 * One path: OpenRouter (BYOK), BROWSER-DIRECT. The visitor's key goes straight
 * from this browser to OpenRouter (see openrouterClient.ts). Our servers never
 * see it, so we cannot store, log, or leak it, and cannot run up anyone's bill.
 * The versioned teaching prompt is assembled in this browser before the direct
 * OpenRouter request. There is no CaseAttend prompt or inference backend.
 *
 * Output funnels through onChunk with structured-block parsing
 * (<POINTERS> / <SUGGESTIONS>), so the panel renders clean prose first, then the
 * pointers and suggestions.
 */

import { LearnerLevel } from '../constants';
import { AiPointer } from '../types';
import type { DomainKey } from '../lib/domains';
import type { CasePackageV1 } from '../core/casePackage';
import type { LessonPlanV1 } from '../core/lessonPlan';
import { getModel } from './byokStore';
import {
  getOpenRouterResponse,
  fetchSystemPrompt,
  SafeInferenceError,
} from './openrouterClient';
import type {
  LockedOpenRouterPolicy,
  OpenRouterResponseMetadata,
  ORChunk,
} from './openrouterClient';

export { SafeInferenceError } from './openrouterClient';
export type { InferenceErrorCode } from './openrouterClient';

export type AiMode = 'chat' | 'deep_think' | 'search';
export type AIProvider = 'gemini' | 'claude' | 'openai' | 'openrouter';
export type Modality = DomainKey;

export interface AIInferenceResult extends OpenRouterResponseMetadata {
  /** SHA-256 of the exact verified, browser-composed prompt sent to OpenRouter. */
  promptSha256: string;
}

/** Exact content and inference policy used by a frozen participant condition. */
export interface LockedTutorRuntime {
  casePackage: CasePackageV1;
  lessonPlan: LessonPlanV1;
  /** Hash frozen in the selected research case step. */
  expectedSystemPromptSha256: string;
  /** Exact number of prior UI messages included in the learner request. */
  historyWindowMessages: number;
  requestTemplateVersion: '1.0';
  openRouterPolicy: LockedOpenRouterPolicy;
}

type OnChunk = (
  text: string,
  sources?: any[],
  toolCalls?: any[],
  allLevelSuggestions?: Record<LearnerLevel, string[]>,
  fullTextReplace?: string,
  pointers?: AiPointer[]
) => void;

// ── Structured-block parsing ─────────────────────────────────────────────────
// The model appends trailing <POINTERS>[...]</POINTERS> and
// <SUGGESTIONS>{...}</SUGGESTIONS> blocks. We surface clean prose first, then the
// pointers and suggestions.

function extractSuggestions(text: string): {
  cleanText: string;
  suggestions: Record<string, string[]> | null;
} {
  const openIdx = text.indexOf('<SUGGESTIONS>');
  if (openIdx === -1) return { cleanText: text, suggestions: null };
  const closeIdx = text.indexOf('</SUGGESTIONS>');
  const cleanText = text.substring(0, openIdx).trimEnd();
  if (closeIdx === -1) return { cleanText, suggestions: null };
  const jsonBlock = text.substring(openIdx + 13, closeIdx).trim();
  try {
    return { cleanText, suggestions: JSON.parse(jsonBlock) };
  } catch {
    return { cleanText, suggestions: null };
  }
}

function extractPointers(text: string): AiPointer[] | null {
  const openIdx = text.indexOf('<POINTERS>');
  if (openIdx === -1) return null;
  const closeIdx = text.indexOf('</POINTERS>');
  if (closeIdx === -1) return null;
  const jsonBlock = text.substring(openIdx + 10, closeIdx).trim();
  try {
    const parsed = JSON.parse(jsonBlock);
    return Array.isArray(parsed) ? (parsed as AiPointer[]) : null;
  } catch {
    return null;
  }
}

function getFirstStructuredTagIndex(text: string): number {
  const p = text.indexOf('<POINTERS>');
  const s = text.indexOf('<SUGGESTIONS>');
  if (p === -1 && s === -1) return -1;
  if (p === -1) return s;
  if (s === -1) return p;
  return Math.min(p, s);
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// Replay the word-chunks from a browser-direct OpenRouter call through onChunk,
// applying the structured-block parsing so the UI reacts as it streams.
function emitOpenRouterChunks(chunks: ORChunk[], onChunk: OnChunk): void {
  let fullText = '';
  let structuredBlockStarted = false;
  let suggestionsEmitted = false;
  let pointersEmitted = false;

  for (const chunk of chunks) {
    if (chunk.done) {
      if (!pointersEmitted || !suggestionsEmitted) {
        const firstTag = getFirstStructuredTagIndex(fullText);
        if (firstTag !== -1 && !structuredBlockStarted) {
          onChunk('', undefined, undefined, undefined, fullText.substring(0, firstTag).trimEnd());
        }
        if (!pointersEmitted) {
          const pointers = extractPointers(fullText);
          if (pointers) onChunk('', undefined, undefined, undefined, undefined, pointers);
        }
        if (!suggestionsEmitted) {
          const { suggestions } = extractSuggestions(fullText);
          if (suggestions) onChunk('', undefined, undefined, suggestions as Record<LearnerLevel, string[]>);
        }
      }
      break;
    }

    if (!chunk.text) continue;
    fullText += chunk.text;

    const firstTag = getFirstStructuredTagIndex(fullText);
    if (firstTag !== -1 && !structuredBlockStarted) {
      structuredBlockStarted = true;
      onChunk('', undefined, undefined, undefined, fullText.substring(0, firstTag).trimEnd());
    }

    if (structuredBlockStarted) {
      if (!pointersEmitted) {
        const pointers = extractPointers(fullText);
        if (pointers) {
          onChunk('', undefined, undefined, undefined, undefined, pointers);
          pointersEmitted = true;
        }
      }
      if (!suggestionsEmitted) {
        const { suggestions } = extractSuggestions(fullText);
        if (suggestions) {
          onChunk('', undefined, undefined, suggestions as Record<LearnerLevel, string[]>);
          suggestionsEmitted = true;
        }
      }
    } else {
      onChunk(chunk.text);
    }
  }
}

export const streamChatResponse = async (
  message: string,
  mode: AiMode,
  learnerLevel: LearnerLevel,
  imageBase64: string | null,
  onChunk: OnChunk,
  _provider: AIProvider = 'openrouter',
  modality: Modality = 'radiology',
  caseId?: string,
  signal?: AbortSignal,
  requestedModelId?: string,
  lockedRuntime?: LockedTutorRuntime,
): Promise<AIInferenceResult> => {
  try {
    if (!caseId) {
      throw new SafeInferenceError({
        code: 'missing_case',
        message: 'This teaching session is missing a Case Package. Return to the case list and open a registered case.',
        retryable: false,
      });
    }
    if (lockedRuntime && (
      lockedRuntime.requestTemplateVersion !== '1.0'
      || !Number.isSafeInteger(lockedRuntime.historyWindowMessages)
      || lockedRuntime.historyWindowMessages < 0
      || lockedRuntime.historyWindowMessages > 100
      || !/^[a-f0-9]{64}$/.test(lockedRuntime.expectedSystemPromptSha256)
    )) {
      throw new SafeInferenceError({
        code: 'protocol_deviation',
        message: 'The learner request template or prompt reference does not match this CaseAttend build. The model request was not sent.',
        retryable: false,
        deviation: { code: 'inference_parameter_mismatch' },
      });
    }
    let systemPrompt: string;
    let promptSha256: string;
    try {
      systemPrompt = await fetchSystemPrompt({
        modality,
        caseId,
        learnerLevel,
        mode,
        hasImage: !!imageBase64,
        ...(lockedRuntime
          ? {
              casePackage: lockedRuntime.casePackage,
              lessonPlan: lockedRuntime.lessonPlan,
            }
          : {}),
      });
      promptSha256 = await sha256Hex(systemPrompt);
      if (lockedRuntime && promptSha256 !== lockedRuntime.expectedSystemPromptSha256) {
        throw new SafeInferenceError({
          code: 'protocol_deviation',
          message: 'The teaching prompt does not match the frozen research condition. The model request was not sent.',
          retryable: false,
          deviation: { code: 'inference_parameter_mismatch' },
        });
      }
    } catch (error) {
      if (error instanceof SafeInferenceError) throw error;
      throw new SafeInferenceError({
        code: 'prompt_resolution_failed',
        message: 'This case\'s verified teaching prompt could not be prepared. Return to the case list and reopen the case.',
        retryable: false,
      });
    }
    const response = await getOpenRouterResponse({
      message,
      systemPrompt,
      imageBase64,
      mode,
      model: lockedRuntime?.openRouterPolicy.model ?? requestedModelId ?? getModel(),
      ...(lockedRuntime ? { lockedPolicy: lockedRuntime.openRouterPolicy } : {}),
      signal,
    });
    emitOpenRouterChunks(response.chunks, onChunk);
    return { ...response.metadata, promptSha256 };
  } catch (error: unknown) {
    if (error instanceof SafeInferenceError) throw error;
    throw new SafeInferenceError({
      code: 'unexpected_error',
      message: 'Sorry, I encountered an error connecting to the AI service.',
      retryable: true,
    });
  }
};
