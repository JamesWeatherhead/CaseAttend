# Refine a saved lesson without losing your place or work

Lesson Builder previously saved a local revision but kept the original case hash as its editing baseline. An educator who returned to an earlier step and saved again could receive “changed in another view” for their own previous save. Switching to another case and back could load a blank form instead of the saved lesson.

After a successful local save, the builder now adopts that exact case revision and form as its baseline. Subsequent refinements save against that revision, while actual changes made in another view still produce a conflict. Built-in cases retain their original identity and continue to use standalone JSON exports.

The editor tracks unsaved changes and shows an accessible in-page exit prompt with Stay and Leave actions. Keyboard focus stays within the prompt and returns to its trigger on cancellation. Refresh/close protection remains active for unsaved work, in-progress operations, and unexported memory-only lessons. Save/export operations run one at a time; a successful local save remains saved if its later backup download fails.

## Verification

- Reproduced the original second-save rejection in the production browser using a synthetic local case, and in a regression test against the actual controller and store.
- Confirmed successive revisions save in one browser visit; switching away and reselecting the local case restores the newest title and lesson.
- Tested real external conflicts, failed standalone/portable downloads, delayed export overlap prevention, unsaved/reverted forms, explicit exit, and dialog keyboard focus.
- Simulated an IndexedDB write failure during saving: the new revision remains protected in memory and reopening durable storage returns the previous saved revision.
- Browser-tested desktop and 320/390px phone layouts. Stay and Escape preserve edits, controls are at least 44px high, and there is no horizontal overflow.
- All 606 tests across 78 files, type checks, and the production build passed. No browser errors or model requests were observed in the local editing workflow.

No built-in cases, lessons, starter answers, clinical-review records, credential behavior, or research execution rules were changed. This release does not add draft autosave or an in-app rehearsal path for adapted built-in bundles; those remain separate product work.
