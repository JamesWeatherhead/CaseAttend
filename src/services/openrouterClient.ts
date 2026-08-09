/**
 * Browser-direct OpenRouter inference (BYOK).
 *
 * SECURITY MODEL: the visitor's OpenRouter key travels ONLY from this browser to
 * https://openrouter.ai. It never touches CaseAttend servers — there is no server
 * code path that reads it — so we are structurally incapable of logging, storing,
 * or leaking it, and can never run up someone's bill. The key is minted into the
 * browser by OpenRouter's OAuth PKCE flow (see openrouterAuth.ts) and lives only
 * in this browser's localStorage (see byokStore.ts).
 *
 * Versioned teaching prompts are composed locally from the exact Case Package
 * and Lesson Plan manifests. CaseAttend has no prompt API or inference backend.
 */

import type { LearnerLevel } from '../constants';
import { composeLessonPrompt } from '../core/lessonPlan';
import { requireCasePackage } from '../data/caseRegistry';
import { requireLessonPlanForCase } from '../data/lessonRegistry';
import type { DomainKey } from '../lib/domains';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface ORChunk {
  text?: string;
  done?: boolean;
}

export type ORMode = 'chat' | 'deep_think' | 'search';

/**
 * Call OpenRouter directly with the visitor's key. Non-streaming request, then
 * split the reply into word chunks for a typing feel — mirrors the server
 * adapters so downstream structured-block parsing is identical.
 */
export async function getOpenRouterResponse(opts: {
  message: string;
  systemPrompt: string;
  imageBase64: string | null;
  mode: ORMode;
  model: string;
  apiKey: string;
}): Promise<ORChunk[]> {
  const { message, systemPrompt, imageBase64, mode, model, apiKey } = opts;
  const hasImage = !!imageBase64;

  const userContent: any = hasImage && imageBase64
    ? [
        { type: 'text', text: message },
        {
          type: 'image_url',
          image_url: {
            url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`,
          },
        },
      ]
    : message;

  const messages: any[] = [];
  if (systemPrompt && systemPrompt.trim()) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: userContent });

  const body = {
    model,
    messages,
    max_tokens: mode === 'deep_think' ? 8192 : 4096,
    stream: false,
  };

  // Fail with a clean message instead of hanging on a slow model.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  let res: Response;
  try {
    res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // OpenRouter attribution headers (custom, not the forbidden `Referer`).
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://caseattend.com',
        'X-Title': 'CaseAttend',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') throw new Error('OpenRouter request timed out. Try again or pick a faster model.');
    throw new Error('Could not reach OpenRouter. Check your connection and try again.');
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    // Surface OpenRouter's own message (it never contains the key). Map common ones.
    const raw = await res.text().catch(() => '');
    let detail = raw.slice(0, 300);
    try {
      const parsed = JSON.parse(raw);
      detail = parsed?.error?.message || detail;
    } catch {
      /* keep raw snippet */
    }
    if (res.status === 401) throw new Error('OpenRouter rejected the key (401). Reconnect your OpenRouter account.');
    if (res.status === 402) throw new Error('Your OpenRouter account is out of credit (402). Switch to a Free model in Connect, or add credit at openrouter.ai.');
    if (res.status === 403) throw new Error(`This model is not available to your key (403). Try a Free model in Connect. ${detail}`.trim());
    if (res.status === 429) throw new Error('OpenRouter rate limit hit (429). Wait a moment and try again.');
    throw new Error(`OpenRouter error ${res.status}: ${detail}`);
  }

  const data: any = await res.json().catch(() => null);
  if (!data) throw new Error('OpenRouter returned an unreadable response.');
  if (data.error) throw new Error(`OpenRouter error: ${data.error.message || 'unknown error'}`);

  const rawContent = data?.choices?.[0]?.message?.content;
  let text = '';
  if (typeof rawContent === 'string') {
    text = rawContent;
  } else if (Array.isArray(rawContent)) {
    text = rawContent.map((p: any) => (typeof p === 'string' ? p : p?.text || '')).join('');
  }

  if (!text) throw new Error('OpenRouter returned an empty message. Try a different model.');

  const chunks: ORChunk[] = [];
  const words = text.split(' ');
  const chunkSize = 8;
  for (let i = 0; i < words.length; i += chunkSize) {
    const piece = words.slice(i, i + chunkSize).join(' ');
    chunks.push({ text: (i > 0 ? ' ' : '') + piece });
  }
  chunks.push({ done: true });
  return chunks;
}

// Cache assembled prompts by the exact versioned lesson manifest and runtime
// context so a changed lesson can never reuse stale teaching instructions.
const promptCache = new Map<string, string>();

/**
 * Resolve and compose the exact teaching prompt in this browser. Any unknown
 * case, domain mismatch, invalid lesson, or manifest mismatch fails closed
 * before OpenRouter is called.
 */
export async function fetchSystemPrompt(opts: {
  modality: DomainKey;
  caseId: string;
  learnerLevel: LearnerLevel;
  mode: ORMode;
  hasImage: boolean;
}): Promise<string> {
  const casePackage = await requireCasePackage(opts.caseId);
  if (casePackage.domain !== opts.modality) {
    throw new Error(
      `Case '${casePackage.id}' belongs to '${casePackage.domain}', not '${opts.modality}'. Refusing to compose the wrong lesson.`,
    );
  }
  const lessonPlan = await requireLessonPlanForCase(casePackage);
  const cacheKey = [
    lessonPlan.id,
    lessonPlan.version,
    lessonPlan.manifest.sha256,
    opts.learnerLevel,
    opts.mode,
    opts.hasImage ? '1' : '0',
  ].join('|');
  const cached = promptCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const prompt = (await composeLessonPrompt(lessonPlan, {
    learnerLevel: opts.learnerLevel,
    mode: opts.mode,
    hasImage: opts.hasImage,
    caseContext: {
      id: casePackage.id,
      title: casePackage.title,
      vignette: casePackage.vignette,
      neutralDescription: casePackage.neutralDescription,
      domain: casePackage.domain,
    },
  })).providerPrompt;
  if (!prompt.trim()) throw new Error('Lesson prompt composition returned no fixed safety policy.');
  promptCache.set(cacheKey, prompt);
  return prompt;
}
