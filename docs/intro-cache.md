# Intro cache pipeline

The intro cache is the shipped artifact that lets a learner with **no OpenRouter key** open any lesson, see a tailored intro prompt for their learner level, and click at least one pre-cached question that renders its answer instantly. It is the delivery vehicle for issue [#68](https://github.com/JamesWeatherhead/CaseAttend/issues/68); companion issue #70 will make this happen automatically when a new lesson is authored.

**Runtime contract**

- No key → free-typing is disabled; every pre-cached suggested question is free and clickable.
- Clicking a pre-cached question renders `cachedAnswer` instantly, exact-match by `id`, no network.
- Only a **new** free-form question requires Connect with OpenRouter (SSO).
- The cache is a shipped, static JSON file at `/intro-cache/<caseId>.json`; the runtime loader validates the schema, refuses drafts, and refuses stale files (`lessonPlanSha256` drift).

## Canonical artifact

Owned by `src/core/introCache.ts` and imported byte-compatibly by issue #70.

```jsonc
{
  "schema": "caseattend.intro-cache",
  "schemaVersion": "1.0",
  "caseId": "cxr-pneumothorax",
  "lessonPlanSha256": "<64-hex>",
  "provenance": {
    "modelId": "anthropic/claude-opus-4",
    "systemPromptSha256": "<64-hex>",
    "requestTemplateVersion": "1.0",
    "mediaSha": "<64-hex>",
    "generatedAt": "2026-08-13T13:39:56.000Z"
  },
  "review": {
    "status": "approved",
    "reviewer": "...",
    "credentials": "...",
    "reviewedAt": "2026-08-13T13:43:29.000Z"
  },
  "levels": {
    "highschool":    { "introPrompt": "...", "introQuestions": [ { "id": "...", "label": "...", "prompt": "...", "cachedAnswer": "..." } ] },
    "undergrad":     { "introPrompt": "...", "introQuestions": [ ... ] },
    "ms_preclinical": { "introPrompt": "...", "introQuestions": [ ... ] },
    "ms_clinical":   { "introPrompt": "...", "introQuestions": [ ... ] },
    "resident":      { "introPrompt": "...", "introQuestions": [ ... ] }
  }
}
```

Every `cachedAnswer` must end with the exact `SAFETY_FOOTER` in `lib/prompts/shared.ts`.

## Two-step pipeline

### 1) Generate drafts

The batch generator reads every built-in lesson (`src/data/caseRegistry.ts` + `src/data/builtinContentPacks.ts`), samples up to four representative images per case, and calls a frontier multimodal model on OpenRouter with the frozen system prompt in `scripts/introCache/systemPrompt.mts`. It writes `intro-cache-drafts/<caseId>.json` with `review.status = "draft"`.

Idempotent per case: reruns skip any case whose existing draft matches both `lessonPlanSha256` and `mediaSha`. `--force` regenerates anyway. If a returned payload is missing any level, missing the safety footer, or otherwise breaks the per-level guarantee, the draft is **not written** and the run reports `skipped-error`.

**Enumerate the roster:**

```bash
npx tsx scripts/introCache/generate.mts --list
```

**Dry-run one case (no network, hand-written fixture, verifies wiring):**

```bash
npx tsx scripts/introCache/generate.mts --case=cxr-pneumothorax --dry-run
```

**Real batch (frontier model):**

```bash
export OPENROUTER_API_KEY=sk-or-...
# default model is anthropic/claude-opus-4; override with --model
npx tsx scripts/introCache/generate.mts --all
```

### 2) Human review + promote

The runtime refuses `review.status: "draft"`, so drafts do not ship. Promote them via the review gate, which prints every level and question for the reviewer and only writes `public/intro-cache/<caseId>.json` on explicit approval.

**Interactive review of every draft:**

```bash
REVIEWER_NAME="Full Name" REVIEWER_CREDS="MD; institution" \
  npx tsx scripts/introCache/review.mts
```

**Headless auto-approve (still requires reviewer credentials; still validates the schema):**

```bash
REVIEWER_NAME="Full Name" REVIEWER_CREDS="MD; institution" \
  npx tsx scripts/introCache/review.mts --auto-approve --case=cxr-pneumothorax
```

## What ships today (this branch)

- Canonical type + validator + hashing helpers: `src/core/introCache.ts`
- Client-side loader (`fetch` + validate + memoize): `src/services/introCacheStore.ts`
- Runtime wiring in `src/components/AiAssistantPanel.tsx`:
  - Loads `/intro-cache/<caseId>.json` when a lesson resolves outside research mode.
  - Uses `introPrompt[level]` for the opening.
  - Uses `introQuestions[level]` for the suggestion chips (labeled "Free · instant · no key").
  - Clicking an intro-cache chip renders its `cachedAnswer` synchronously as a bot message. No network, no key.
  - Free-typing without a key is disabled; focusing the input opens the Connect with OpenRouter modal.
- Batch generator: `scripts/introCache/generate.mts`
- Human-review gate: `scripts/introCache/review.mts`
- Sample committed cache (human-authored seed, pipeline-validated) for three lessons across three domains:
  - `public/intro-cache/cxr-pneumothorax.json` (radiology, chest)
  - `public/intro-cache/derm-melanoma.json` (dermatology)
  - `public/intro-cache/patho-study-breast.json` (pathology)
- Tests: `src/tests/introCache.test.ts`, `src/tests/introCacheStore.test.ts` (all passing).

## Running the full corpus

The current built-in roster is 48 lessons (`--list` prints them all). Given one call per case (all five levels in one JSON payload), rough cost expectations with Claude Opus 4 at the time of writing:

| Item                              | Estimate               |
|-----------------------------------|------------------------|
| Cases enumerated (`--list`)       | 48                     |
| Model calls (one per case)        | 48                     |
| Input tokens per call             | 3-6k (text + up to 4 base64 images) |
| Output tokens per call            | 3-6k (all 5 levels)    |
| Approx. total cost, Opus-class    | Low tens of USD        |

`scripts/introCache/generate.mts --all` is safe to leave running; it is idempotent, checkpoints per case, and skips already-current drafts on rerun. When the corpus grows past 100 (issue #70's auto-create path), the same command scales without changes.

## Fail-closed guarantees

- The batch generator refuses to write a draft if any of the five levels is missing, has zero questions, or has a `cachedAnswer` that does not end with `SAFETY_FOOTER`.
- The review gate refuses to run without `REVIEWER_NAME` and `REVIEWER_CREDS` and never writes to `public/intro-cache/` from a draft that fails schema validation.
- The runtime loader refuses any file whose `review.status` is not `approved` and any file whose `lessonPlanSha256` does not match the current lesson binding.
- Research-mode (`lockedTutor`) sessions bypass the intro cache entirely; the pinned live model remains authoritative for the study protocol.
