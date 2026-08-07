/**
 * AI Client: front-end inference dispatcher.
 *
 * One path: OpenRouter (BYOK), BROWSER-DIRECT. The visitor's key goes straight
 * from this browser to OpenRouter (see openrouterClient.ts). Our servers never
 * see it, so we cannot store, log, or leak it, and cannot run up anyone's bill.
 * We only fetch the assembled teaching prompt from /api/prompt, a request that
 * carries no key.
 *
 * Output funnels through onChunk with structured-block parsing
 * (<POINTERS> / <SUGGESTIONS>), so the panel renders clean prose first, then the
 * pointers and suggestions.
 */

import { LearnerLevel } from '../constants';
import { AiPointer } from '../types';
import { getKey, getModel } from './byokStore';
import { getOpenRouterResponse, fetchSystemPrompt } from './openrouterClient';
import type { ORChunk } from './openrouterClient';

export type AiMode = 'chat' | 'deep_think' | 'search';
export type AIProvider = 'gemini' | 'claude' | 'openai' | 'openrouter';
export type Modality = 'radiology' | 'pathology';

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
  caseId?: string
) => {
  try {
    const key = getKey();
    if (!key) {
      throw new Error('Connect your OpenRouter account to start chatting. Your key stays in your browser.');
    }
    const systemPrompt = await fetchSystemPrompt({
      modality,
      caseId,
      learnerLevel,
      mode,
      hasImage: !!imageBase64,
    });
    const chunks = await getOpenRouterResponse({
      message,
      systemPrompt,
      imageBase64,
      mode,
      model: getModel(),
      apiKey: key,
    });
    emitOpenRouterChunks(chunks, onChunk);
  } catch (error: any) {
    let userMessage = 'Sorry, I encountered an error connecting to the AI service.';
    if (error.message) {
      if (error.message.includes('429')) userMessage = 'High traffic (429). Please try again in a moment.';
      else if (error.message.includes('500') || error.message.includes('503')) userMessage = 'AI service temporarily unavailable. Please try again.';
      else userMessage = error.message;
    }
    throw new Error(userMessage);
  }
};

/**
 * Pre-analyze a captured slice. Runs once when the user captures an image.
 * Returns a structured description that becomes persistent grounding context for
 * subsequent messages. Like chat, this goes browser-direct to OpenRouter.
 */
export const preAnalyzeSlice = async (
  imageBase64: string,
  _provider: AIProvider,
  modality: Modality,
  seriesDescription: string,
  studyDescription: string,
): Promise<string> => {
  const analyzePrompt = modality === 'pathology'
    ? `You are a pathology teaching assistant. Analyze this H&E histology image and provide a BRIEF structured description (3-5 bullet points) covering:
- Tissue type and architecture
- Staining quality and pattern
- Key cellular features visible
- Notable findings (if any)
- Magnification assessment
Context: ${studyDescription}, Series: ${seriesDescription}
This analysis will be used as grounding context for subsequent teaching questions. Be factual and concise. EDUCATIONAL USE ONLY.`
    : `You are a radiology teaching assistant. Analyze this MRI slice and provide a BRIEF structured description (3-5 bullet points) covering:
- Imaging sequence and plane
- Key anatomical structures visible
- Signal characteristics
- Notable features (if any)
Context: ${studyDescription}, Series: ${seriesDescription}
This analysis will be used as grounding context for subsequent teaching questions. Be factual and concise. EDUCATIONAL USE ONLY.`;

  const key = getKey();
  if (!key) return ''; // Not connected yet, skip grounding silently.
  try {
    const chunks = await getOpenRouterResponse({
      message: analyzePrompt,
      systemPrompt: '',
      imageBase64,
      mode: 'chat',
      model: getModel(),
      apiKey: key,
    });
    let fullText = '';
    for (const c of chunks) {
      if (c.done) break;
      if (c.text) fullText += c.text;
    }
    return fullText;
  } catch {
    return '';
  }
};
