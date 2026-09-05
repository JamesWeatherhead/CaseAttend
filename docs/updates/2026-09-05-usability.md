# September 5, 2026 usability update

The homepage now opens with the case library, one sample-case action, readable image cards, and search. It initially renders 12 of the 48 cases; search and topic filters always cover the entire library. Loading another batch moves keyboard focus to the first newly available case.

Educator and research entry points remain available through the navigation and their dedicated section. Session data is in the header, and research data is beside the research tools. OpenRouter connection is optional and has one entry point on the homepage.

The tutor uses a labelled learner-level selector. Focusing its question field no longer opens account setup. Tours remain available on demand. Connection and safety dialogs support keyboard focus containment, Escape dismissal, and focus return. The connection dialog scrolls on short screens and keeps its close control available.

## Verified sample and existing content drift

The sample shortcut opens `fundus-normal`. Its shipped cache is schema-valid, approved, and bound to the current lesson for all five learner levels. A regression test checks that binding and the presence of starter answers. Browser testing confirmed an answer renders without connecting OpenRouter.

The audit found that the first 15 legacy cases already had shipped caches bound to older lesson hashes. The remaining 33 shipped caches matched their current lessons. The stale caches remain rejected by the existing loader. Their review attestations and hashes have not been rewritten; they need a separate content review before they can be used again. This update repairs the default sample path without bypassing that review boundary.

## Publishing

The existing `caseattend` Cloudflare Pages project uses direct uploads. The CI workflow now uploads the exact production build as an artifact, then deploys that artifact only after the build/test and security-invariant jobs succeed on a push to `main`. Pull requests do not deploy or receive deployment credentials. `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are GitHub Actions secrets; no credential belongs in source or browser assets.

The workflow embeds the GitHub commit SHA in the build. Existing content-security and cache headers are preserved.

## Validation

Local type checks and production build were completed. Browser checks covered desktop and phone layouts, search and clearing, case pagination and focus, learner levels, account-free starter answers, explicit connection and Escape dismissal, and opening the lesson workspace. The full CI test suite and security checks gate publication.

Live OpenRouter inference was not exercised; the browser sample check used shipped reviewed answers and made no model request.
