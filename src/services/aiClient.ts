/**
 * AI Client — front-end inference dispatcher.
 *
 * Two paths, one UI:
 *  - OpenRouter (BYOK, default): BROWSER-DIRECT. The visitor's key goes straight
 *    from this browser to OpenRouter (see openrouterClient.ts). Our servers never
 *    see it, so we cannot store, log, or leak it — or run up anyone's bill. We only
 *    fetch the assembled teaching prompt from /api/prompt (that request has no key).
 *  - gemini / claude / openai (owner-funded): POST to /api/chat, which holds those
 *    keys server-side and streams the reply back as SSE.
 *
 * Both funnel through the same onChunk callback + structured-block parsing
 * (<POINTERS> / <SUGGESTIONS>), so the panel behaves identically either way.
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

// ── Structured-block parsing (ported verbatim from api/chat.ts) ──────────────
// The model appends trailing <POINTERS>[...]</POINTERS> and
// <SUGGESTIONS>{...}</SUGGESTIONS> blocks. We surface clean prose first, then the
// pointers/suggestions — exactly as the server SSE path does.

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
// mirroring chat.ts's streaming/parse logic so the UI reacts identically.
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
  provider: AIProvider = 'openrouter',
  modality: Modality = 'radiology',
  caseId?: string
) => {
  try {
    // ── Browser-direct BYOK path (OpenRouter) ────────────────────────────────
    if (provider === 'openrouter') {
      const key = getKey();
      if (!key) {
        throw new Error('Connect your OpenRouter account to start chatting — your key stays in your browser.');
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
      return;
    }

    // ── Owner-funded path (gemini / claude / openai) via server SSE ───────────
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, mode, learnerLevel, imageBase64, provider, modality, caseId }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      let eventType = 'chunk';
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          const data = line.slice(6);
          try {
            const parsed = JSON.parse(data);
            if (eventType === 'chunk') {
              onChunk(parsed.text || '', parsed.sources);
            } else if (eventType === 'replace') {
              onChunk('', undefined, undefined, undefined, parsed.text);
            } else if (eventType === 'suggestions') {
              onChunk('', undefined, undefined, parsed);
            } else if (eventType === 'pointers') {
              onChunk('', undefined, undefined, undefined, undefined, parsed);
            } else if (eventType === 'error') {
              throw new Error(parsed.message || 'AI service error');
            }
          } catch {
            // Ignore malformed JSON
          }
          eventType = 'chunk';
        }
      }
    }
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
 * subsequent messages. For OpenRouter this also goes browser-direct.
 */
export const preAnalyzeSlice = async (
  imageBase64: string,
  provider: AIProvider,
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

  // ── Browser-direct BYOK path ──────────────────────────────────────────────
  if (provider === 'openrouter') {
    const key = getKey();
    if (!key) return ''; // Not connected yet — skip grounding silently.
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
  }

  // ── Owner-funded path via server SSE ──────────────────────────────────────
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: analyzePrompt,
        mode: 'chat',
        learnerLevel: 'resident',
        imageBase64,
        provider,
        modality,
      }),
    });

    if (!response.ok || !response.body) return '';

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      let eventType = 'chunk';
      for (const line of lines) {
        if (line.startsWith('event: ')) eventType = line.slice(7).trim();
        else if (line.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(line.slice(6));
            if (eventType === 'chunk' && parsed.text) fullText += parsed.text;
            else if (eventType === 'replace' && parsed.text) fullText = parsed.text;
          } catch {}
          eventType = 'chunk';
        }
      }
    }
    return fullText;
  } catch {
    return '';
  }
};

// Stubs for functions that were in the old aiService.ts
export const transcribeAudio = async (_audioBlob: Blob): Promise<string> => {
  throw new Error('Audio transcription not yet available.');
};

export interface ReportPayload {
  dicom_metadata: {
    studyId: string;
    patientName: string;
    description: string;
    modality: string;
    measurements: any[];
  };
  free_text_notes?: string;
  full_draft_report?: string;
  slice_context?: string;
}

export const generateRadiologyReport = async (_payload: ReportPayload, _imageBase64?: string | null): Promise<string> => {
  return 'Report generation will be available soon.';
};
