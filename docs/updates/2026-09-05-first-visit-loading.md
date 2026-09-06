# Download case tools when a case opens

The case library now defers the image viewer, tutor, and provider client until they are needed. The production tutor always supplies the browser teaching engine explicitly. Case Studio downloads the provider client only after an explicit answer-generation action; cancelling while that download is pending prevents a provider call.

Each case pane has its own accessible loading state and download-failure screen. A failed viewer download leaves the tutor mounted, and a failed tutor download leaves the viewer usable. Browsers can retain failed module downloads until a page reload, so the recovery action explicitly reloads the same case and explains that the workspace will restart. No automatic reload occurs.

Research sessions keep Participant Mode, task progress, and the recorder outside these boundaries. Required tool loading or failure blocks **Finish study activity** while **Exit study** remains available through its existing cancellation and terminal-record sequence. Research failure screens direct participants to exit safely before reloading. Tool readiness means the component is mounted; image decoding and lesson validation retain their existing checks.

Optional authoring download failures explain how to save/export and reload. They do not enable an ineffective regeneration retry. Local case use and export remain available.

## Initial JavaScript

The comparison follows the HTML's scripts and module preloads through all static ESM imports, deduplicating files and excluding dynamic imports. Compression is the sum of each file compressed with gzip level 6. Both builds use the local development revision marker.

| | Before | After | Reduction |
|---|---:|---:|---:|
| Raw JavaScript | 989,177 bytes | 896,371 bytes | 92,806 bytes (9.38%) |
| gzip level 6 | 299,393 bytes | 273,830 bytes | 25,563 bytes (8.54%) |

The new total includes the entry, runtime, and 10,121-byte shared case-package chunk. This is a download-size measurement, not a claimed page-load-time improvement. Catalog, research, and local storage code still account for much of the initial bundle.

## Validation

- 569 tests in 75 files pass, along with type checking and the production build.
- Existing integration tests retain explicit production-engine assertions, viewer capture and accessibility, research cancellation, and navigation coverage.
- New regressions cover isolated tool failure, retained sibling state, the latest case after a delayed download, forwarded viewer capture handles, late downloads after leaving, cancellation during provider-code loading, and safe authoring error guidance.
- A real Participant Mode/task-flow test completes its pre-task, encounters a download failure, keeps assignment and activity progress, blocks completion, and retries a failed exit record without starting a second session.
- Browser network checks show only the entry, runtime, and shared case-package JavaScript on a fresh library visit. No viewer, tutor, provider, or external request occurs during that visit.
- Browser checks block viewer and tutor downloads independently, then use each recovery button to reopen the same bookmarked case successfully. The healthy sibling remains usable while the other download is blocked.
- A paused tutor download, return to the library, selection of another case, and resumed download produce the newly selected case's tutor and image. Browser back and forward restore the selected case.
- Desktop at 1440 pixels and phone widths of 390 and 320 pixels were inspected. Both phone widths have no horizontal page overflow. Series selection, the sample's free reviewed answer, and image display were exercised without a live model request or clinical approval.
