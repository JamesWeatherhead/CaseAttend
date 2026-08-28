/**
 * The intro-cache generator's frozen system prompt.
 *
 * The prompt body is defined once in `src/core/introCacheSystemPrompt.ts` so
 * the browser-side author-time generator (`src/services/introCacheAuthoring.ts`)
 * and this Node batch generator hash the exact same bytes. Both stamp the
 * result as `provenance.systemPromptSha256`, and matching stamps are what let
 * the runtime treat backfilled and author-generated caches as one artifact.
 */

export { INTRO_CACHE_SYSTEM_PROMPT } from '../../src/core/introCacheSystemPrompt';
