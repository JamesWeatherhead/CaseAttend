/**
 * /api/prompt  —  Cloudflare Pages Function
 *
 * Direct port of the former Vercel `api/prompt.ts`. Returns the assembled
 * CaseAttend teaching prompt for the browser-direct OpenRouter (BYOK) path:
 * the visitor's key never touches our servers, so the browser calls OpenRouter
 * itself — but it still needs the question-first teaching prompt to behave like
 * CaseAttend. This endpoint hands back that prompt and NOTHING ELSE. It never
 * reads, receives, or returns an API key.
 *
 * Exposes `onRequestPost` (the only method the SPA uses). Runs on the Workers
 * runtime (Web-standard Request/Response); `buildInstructions` is pure string
 * assembly over static prompt data — no Node APIs — so it ports unchanged from
 * lib/.
 */
import { buildInstructions } from '../../lib/prompts/select.js';

const json = (obj: unknown, status = 200, extra: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  });

export const onRequestPost = async (context: { request: Request }): Promise<Response> => {
  let body: any = {};
  try {
    body = await context.request.json();
  } catch {
    body = {};
  }

  const {
    modality = 'radiology',
    caseId,
    learnerLevel = 'ms_preclinical',
    mode = 'chat',
    hasImage = false,
  } = body || {};

  try {
    const systemPrompt = buildInstructions({
      modality,
      caseId,
      learnerLevel,
      mode,
      hasImage: !!hasImage,
    });
    return json({ systemPrompt }, 200, { 'Cache-Control': 'no-store' });
  } catch (err: any) {
    return json({ error: err?.message || 'Failed to build prompt' }, 500);
  }
};
