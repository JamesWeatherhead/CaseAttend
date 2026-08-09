## What does this PR do?

<!-- Brief description. Link the issue it addresses. -->

## Checklist

- [ ] My commits are signed off (`git commit -s`, DCO).
- [ ] The build passes (`npm run build`).
- [ ] I did **not** change how the user's key is handled. It still lives only in
      the browser and is sent only to `https://openrouter.ai` (see SECURITY.md).
- [ ] I did **not** loosen the CSP `connect-src` in `public/_headers`.

## If this PR adds or edits clinical content (cases, teaching prompts)

- [ ] Clinical claims are accurate and cite a source where appropriate.
- [ ] Case metadata, artifacts, provenance, and review status are recorded in
      the canonical Case Package v1 registry.
- [ ] Objectives, hints, rubric evidence, citations, review status, and the
      exact content version are recorded in Lesson Plan v1.
- [ ] Each citation is scoped accurately. Artifact provenance and license links
      are not presented as evidence for clinical teaching claims.
- [ ] The Case Package references the exact Lesson Plan `{id, version, sha256}`
      manifest and bundle validation passes.
- [ ] Every added or changed asset has its exact SHA-256 digest recorded, and
      package manifest generation and verification pass.
- [ ] Clinician review and de-identification status are accurate. Missing
      evidence remains explicitly unreviewed or `not-reviewed`.
- [ ] Each image records its source, required attribution, and exact license or
      use terms, which permit redistribution. Images are not relicensed under
      AGPL-3.0.
