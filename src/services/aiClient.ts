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
import { getModel } from './byokStore';
import {
  getOpenRouterResponse,
  fetchSystemPrompt,
  SafeInferenceError,
} from './openrouterClient';
import type { OpenRouterResponseMetadata, ORChunk } from './openrouterClient';

export { SafeInferenceError } from './openrouterClient';
export type { InferenceErrorCode } from './openrouterClient';

export type AiMode = 'chat' | 'deep_think' | 'search';
export type AIProvider = 'gemini' | 'claude' | 'openai' | 'openrouter';
export type Modality = DomainKey;

export interface AIInferenceResult extends OpenRouterResponseMetadata {
  /** SHA-256 of the exact verified, browser-composed prompt sent to OpenRouter. */
  promptSha256: string;
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
): Promise<AIInferenceResult> => {
  try {
    if (!caseId) {
      throw new SafeInferenceError({
        code: 'missing_case',
        message: 'This teaching session is missing a Case Package. Return to the case list and open a registered case.',
        retryable: false,
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
      });
      promptSha256 = await sha256Hex(systemPrompt);
    } catch {
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
      model: requestedModelId ?? getModel(),
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
