# Direct case links and browser navigation

Ordinary teaching cases now have a `#case/<case-id>` address. Opening a card adds a browser history entry; Back and Forward restore the appropriate case or library. A direct link or refreshed page resolves the case from the built-in catalog or the verified local package store. Unknown and malformed links have recovery screens instead of opening a different lesson.

The case heading receives keyboard focus on entry. Copy link shares the case address without query parameters and announces success. When clipboard access fails, a keyboard-accessible dialog provides selectable text. Locally saved cases explain that sharing the material requires exporting the `.caseattend` file.

The ordinary case route is retained in session storage through OpenRouter sign-in. The provider receives a clean callback address. On return, the authorization code is removed and the saved case restored before awaiting the exchange, so a delayed response cannot replace a later navigation. This returns to the case, not its previous conversation or annotations.

Authoring and research workspaces suspend ordinary routing synchronously. Same-document Back, Forward, or hash changes keep the existing workspace mounted and clear the attempted case route. Research exit still requires the existing cancellation and recorder-finalization path to succeed. This does not provide draft or research-session restoration across full-page navigation, refresh, or tab closure.

Series loading uses the already selected package revision, keeping the image and lesson together even if browser-local storage changes. A failed series load has a visible retry action.

## Validation

- 535 tests in 73 files pass, including direct links, StrictMode, asynchronous races, history traversal, local-case errors, clipboard fallback, OAuth restoration, preserved authoring inputs, and research setup/session/failed-exit guards.
- Type checks and production build pass.
- Browser checks cover desktop, 390 px and 320 px phone layouts; direct case entry and refresh; native Back/Forward; copy confirmation; missing-case recovery; and retaining Case Studio during Forward navigation. Neither phone width has horizontal page overflow.
- OAuth exchanges are tested with mocked provider responses; these checks do not authorize or charge a live account.
