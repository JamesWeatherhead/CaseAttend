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

Node 18+. No environment variables required.

## Architecture in one breath

- `src/` — the React SPA (image viewer, chat, model picker, BYOK connect flow).
- `lib/prompts/` — the teaching content, **one module per domain**
  (`radiology.ts`, `pathology.ts`, `cxr-cases.ts`). This is where cases live.
- `functions/api/prompt.ts` — the only backend; assembles the teaching prompt,
  key-free.

**A new specialty is just a new prompt module.** Want dermatology? Add
`lib/prompts/dermatology.ts`, wire it into `select.ts`, and bring cases.

## Contributing clinical content (cases, teaching prompts)

Clinical content is the highest-trust part of the project. A student *learns*
what a case says, so correctness is non-negotiable.

- **Clinician review is required.** Any PR touching `lib/prompts/` or case data
  must be reviewed and approved by a qualified clinician in the relevant
  specialty (enforced via CODEOWNERS). If that isn't you, expect us to route it
  for review before merge.
- **Cite clinical claims.** Teaching points that assert facts should reference a
  source (guideline, textbook, or primary literature).
- **Images must be de-identified and openly licensed.** By contributing an image
  you attest that it contains no PHI and that you have the right to share it
  under this project's license. Prefer open sources (e.g. TCGA open-access).

## Pull requests

- Open an issue first for anything non-trivial so we can agree on the approach.
- Keep PRs focused, and fill in the PR template (including the attestations).
- CI must pass: the build succeeds and the security guard confirms the no-keys
  invariant is intact.

## License

By contributing you agree your contributions are licensed under
[Apache-2.0](LICENSE) (see section 5 of the license). Your DCO sign-off records
that you have the right to make the contribution.
