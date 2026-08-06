## What does this PR do?

<!-- Brief description. Link the issue it addresses. -->

## Checklist

- [ ] My commits are signed off (`git commit -s`, DCO).
- [ ] The build passes (`npm run build`).
- [ ] I did **not** change how the user's key is handled — it still lives only in
      the browser and is sent only to `https://openrouter.ai` (see SECURITY.md).
- [ ] I did **not** loosen the CSP `connect-src` in `public/_headers`.

## If this PR adds or edits clinical content (cases, teaching prompts)

- [ ] Clinical claims are accurate and cite a source where appropriate.
- [ ] A qualified clinician has reviewed it, or I've flagged it for clinician review.
- [ ] Any images are **de-identified** and I have the right to share them under
      Apache-2.0 (prefer open sources, e.g. TCGA open-access).
