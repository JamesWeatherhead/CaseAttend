# Find free starter answers from the case library

The first 12 cards previously contained no usable shipped starter answers, even though 33 of the 48 built-in cases had them. Learners could use the sample button, but browsing offered no way to identify another ready sample.

**Free starter samples only** now filters the entire library before pagination. It combines with search, case type, and curriculum; eligible cards say **Free starter answers**. The default includes all cases, including browser-local material. An absent badge makes no claim about locally authored answers. The hero counts verified samples and its shortcut prefers the designated sample, then another verified sample, then truthfully offers **Open first case** if none are available.

## Availability and content boundaries

- `npm run starters:generate` creates a compact metadata index from the built-in registry and actual shipped cache files. No answer text is included in the library bundle.
- An entry requires a valid cache, approved answer review, exact case ID, and a match with the resolved current lesson. Each entry records the case package and lesson hashes; changed identities lose their badge.
- `npm run starters:check` is part of the production build. It fails if the committed index omits eligible entries or retains stale ones. Regenerate and review the index when changing cases, lessons, or approved caches.
- The existing tutor cache loader remains authoritative. A previously loaded page or network failure can still make an advertised answer unavailable; existing recovery behavior remains in place.
- No case, lesson, answer, review record, or clinical approval was changed. Answer-review badges do not claim clinician review of a case. The 15 caches whose lesson hashes no longer match remain unavailable.

## Verification

| Check | Result |
| --- | --- |
| Complete test suite | 598 tests across 77 files passed |
| Type checks and production build | Passed; 33 of 48 built-in entries verified |
| Real shipped-file comparison | Every advertised cache validates and matches its current lesson; no eligible entries omitted |
| Negative eligibility | Missing, invalid, incomplete, empty, draft, wrong-ID, and stale answers excluded; changed case/lesson hashes rejected |
| Production browser, default desktop | 12 of 33 starters immediately discoverable; badges visible; original order retained |
| Phone widths 320 and 390 | No horizontal overflow; readable wrapping; 44px checkbox label; keyboard Space toggles and retains focus |
| Combined controls | Starter shortcut plus CT yields a clear empty state; X-ray yields six; searching “smoker cough” yields one |
| Clear controls | Clear search preserves filters; Clear all resets search, both selects, shortcut, and batch |
| Return from case | 24-result expanded batch, shortcut, originating card focus, and exact position restored through site Back and browser Back/Forward |
| Network | Reloading and filtering the library made zero starter-cache or OpenRouter requests; displaying an already loaded starter answer made zero network requests |
| Browser errors | None during production-preview verification |

The generator does not generate or approve medical content. Eligibility is a small discovery aid, with final cache validation still performed when a learner opens a case.
