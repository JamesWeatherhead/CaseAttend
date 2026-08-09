# Contributing to CaseAttend

Thanks for helping build an open medical teaching tool. A few rules keep it safe
to *use* and safe to *contribute to*.

## Ground rules

1. **Educational use only.** CaseAttend teaches; it is not a diagnostic tool and
   must not be presented as one.
2. **No keys, ever.** The user's API key lives only in their browser and is sent
   only to OpenRouter. Do not add code that sends the key anywhere else, weakens
   the CSP `connect-src` (`'self' https://openrouter.ai`), or introduces a
   backend that receives keys. See [SECURITY.md](SECURITY.md).
3. **Sign your commits (DCO).** Every commit must carry a `Signed-off-by` line
   certifying the [Developer Certificate of Origin](https://developercertificate.org/).
   Just commit with `git commit -s`.

## Dev setup

```bash
npm install
npm run dev      # Vite dev server
npm run build    # production build -> dist/
```

Node 22+. No environment variables required.

## Branching and releases

- `main` is production. It is protected and deploys the live site, so never
  commit to it directly.
- Every change lands through a short-lived branch and a pull request. Name it by
  intent: `feat/...`, `fix/...`, `chore/...`, or `docs/...`.
- Open the PR, let CI pass (build plus the security invariant), then merge.
  Merged branches are deleted automatically.
- Dependency updates come from Dependabot. Minor and patch bumps are grouped and
  merge on their own once CI is green. Major bumps arrive as their own PR for a
  closer look.

## Architecture in one breath

- `src/`: the React SPA (image viewer, chat, model picker, BYOK connect flow).
- `src/lib/domains/`: client-side Domain plugins, one module per domain
  (`radiology.ts`, `pathology.ts`, `dermatology.ts`). Suggestions, welcome
  messages, artifact hints, and viewer labels.
- `src/core/casePackage.ts`: the Case Package v1 schema, validators, and
  manifest helpers.
- `src/data/caseRegistry.ts`: the canonical registry for case metadata,
  artifacts, provenance, review status, and presentation data.
- `lib/prompts/`: server-side teaching prompts, one module per domain plus
  `cxr-cases.ts` for radiology case-specific contexts.
- `functions/api/prompt.ts`: the only backend; assembles the teaching prompt,
  key-free.

A new visual-case domain is a plugin, not a fork. See "Adding a new
visual-case domain" below.

## Adding a new visual-case domain

CaseAttend's engine is a case-based Socratic tutor grounded in a real visual
artifact. To add a new domain (ophthalmology, ECG, dermoscopy, or something
non-medical) you touch six spots, none of which are the viewer.

1. **Client Domain plugin:** `src/lib/domains/<key>.ts` implementing the
   `Domain` interface from `src/lib/domains/types.ts`: `key`, `label`,
   `artifactHints`, `welcomeMessage`, `getInitialSuggestions`,
   `contextLabel`, and `captureLabel`. Model on
   `src/lib/domains/dermatology.ts`.
2. **Register the domain:** add to `DomainKey` in
   `src/lib/domains/types.ts` and to the `DOMAINS` map in
   `src/lib/domains/index.ts`.
3. **Server-side prompt module:** `lib/prompts/<key>.ts` exporting a system
   prompt built with the shared `SUGGESTIONS_INSTRUCTION`,
   `POINTER_INSTRUCTION`, and `STUCK_STUDENT_GUIDANCE` from
   `lib/prompts/shared.ts`. Wire it into `lib/prompts/select.ts`: add to the
   `Modality` union, route in `getSystemPrompt`, and update the label in
   `buildInstructions`. Also update `src/services/openrouterClient.ts`
   `fetchSystemPrompt` union.
4. **Case package:** define a valid Case Package v1 record with the domain,
   artifact shape, preview, artifact hints, provenance, review status, lesson
   reference, and presentation metadata.
5. **Register the case:** add the record to `src/data/caseRegistry.ts`, directly
   or through a domain data module imported there. Study cards, viewer studies,
   and attribution surfaces must derive from the registry. Do not add separate
   copies of case metadata to UI components or service fallbacks.
6. **Assets and integrity:** add redistributable assets under `public/images/`,
   record each asset's SHA-256 digest, and regenerate the package manifest. A
   single-frame case uses an `image` artifact. A multi-frame case uses an
   `image-stack` artifact.

You should not need to touch `ViewerCanvas.tsx`, `AiAssistantPanel.tsx`, or
`services/aiClient.ts`. If a change to those files is required for a new
domain, the `Domain` interface is missing something and should be extended
instead.

`artifactHints` (`showWindowLevel`, `showSeriesSelector`, `showSegmentation`)
lets a domain suppress viewer affordances that do not apply. For example
dermatology hides Window/Level and the series selector because clinical
photographs are single-frame; add new hints if a domain needs to control a
new affordance.

## Case Package v1 integrity and review status

Every built-in case has one canonical record in `src/data/caseRegistry.ts`.
Update that record when case text, artifact layout, viewer hints, source,
license, attribution, review status, or presentation metadata changes.

- Each artifact frame and preview records a lowercase SHA-256 digest for the
  exact asset bytes. If the file changes, update its digest and regenerate the
  package manifest.
- The package manifest covers the canonical metadata plus the ordered asset
  digests. Use the helpers in `src/core/casePackage.ts` to generate and verify
  it.
- A matching digest identifies the exact bytes and can bind later review to
  them. It does not prove that the asset is clinically correct, de-identified,
  properly licensed, or reviewed.
- If clinical review evidence is missing, use
  `clinicianReview: { reviewed: false }`. If de-identification evidence is
  missing, use `deidentification.status: 'not-reviewed'`. Never infer either
  status from a public source, filename, or legacy description.

## Contributing clinical content (cases, teaching prompts)

Clinical content is the highest-trust part of the project. A student *learns*
what a case says, so correctness is non-negotiable.

- **Clinician review must be recorded accurately.** Any PR touching
  `lib/prompts/` or case data must be reviewed and approved by a qualified
  clinician in the relevant specialty before it can claim reviewed status. A
  reviewed package includes the reviewer, credentials, and review date. Until
  then it remains explicitly unreviewed. CODEOWNERS routes these changes for
  review.
- **Cite clinical claims.** Teaching points that assert facts should reference a
  source (guideline, textbook, or primary literature).
- **Image terms must permit redistribution.** Record the canonical source,
  creator or required attribution, exact license or use terms, and a license URL
  when available. Suitable terms can include CC BY, CC BY-SA, CC0, public
  domain, or dataset terms that permit redistribution. Images keep their own
  license and are not relicensed under AGPL.
- **De-identification is a separate attestation.** Record who attested and when,
  or leave the package explicitly not reviewed. A public or redistributable
  image is not automatically de-identified.

## Pull requests

- Open an issue first for anything non-trivial so we can agree on the approach.
- Keep PRs focused, and fill in the PR template (including the attestations).
- CI must pass: the build succeeds and the security guard confirms the no-keys
  invariant is intact.

## License

By submitting a contribution, you agree that:

1. your contribution is licensed to the project and to all recipients under the
   [GNU AGPL v3.0](LICENSE); and
2. you grant James Weatherhead, the project maintainer, a perpetual, worldwide,
   non-exclusive, royalty-free, irrevocable license to also distribute your
   contribution under other terms, including commercial licenses. This keeps a
   dual-licensing option open for the project. You keep the copyright to your
   work.

Your DCO sign-off (`git commit -s`) certifies you have the right to make the
contribution under these terms.
