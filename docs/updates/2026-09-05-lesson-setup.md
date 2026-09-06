# Start a lesson with the teaching case

Lesson Builder now starts with **Teaching case**, followed by a compact image preview and the case's review status. The vignette, specialty, and case version remain available under **Case details**. The lesson title and learner levels come next.

**Import teaching text** is optional and initially collapsed. The existing PDF and PowerPoint importer stays mounted when this section closes, preserving its preview and any pending parse. Parsing does not apply the draft. Applying remains explicit, keeps the existing replacement confirmation, and leaves the lesson unreviewed. Switching cases cancels the previous parse and resets its preview. A result completed while collapsed does not move focus into hidden content.

The stable lesson ID and content version are under **Lesson settings**. Title edits and disclosure toggles preserve those values, including values loaded from the exact saved local lesson. Invalid settings expand automatically; errors found during review provide a route back to those fields.

On phones, a compact current-step control opens all five step buttons. Selecting a step closes the list and leaves focus on visible content, including when selecting the current step. Desktop navigation continues to show all steps.

Jumping directly to review now runs the same field checks as the sequential flow, followed by core schema validation. Errors use familiar field wording where available and provide links back to incomplete sections. Core checks still reject invalid references and duplicate identifiers before persistence.

## Validation

- 563 tests in 73 files pass, along with type checking and the production build.
- Browser checks covered 1440-pixel desktop, 390-pixel phone, and 320-pixel phone layouts. Neither phone width had horizontal page overflow.
- At 390 × 844, the teaching-case selector moved from about 1,099 pixels below the top to 506 pixels, making it visible without scrolling. At 320 × 740 it starts at 523 pixels.
- A synthetic PDF was selected and parsed in the browser, preserved through collapse/reopen, and applied explicitly. No model connection or clinical approval was used.
- Browser checks also verified hidden version-error recovery, the compact step list, current-step focus, and returning from review to the relevant learning-goal errors.
- Automated regressions cover import completion while collapsed, cancelled results after case switching, declined case changes, saved ID/version preservation, direct-review validation, and retained core validation.
