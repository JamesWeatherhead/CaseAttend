# Start with a reviewed question

The ordinary tutor now starts with the learner's level and available reviewed questions. The original case introduction remains available in a disclosure and in the conversation history. An explicit **Connect to ask your own question** button explains how to begin a live conversation.

Selecting a reviewed question reveals the beginning of its answer and moves keyboard focus to that answer without requesting focus scrolling. Reading or touching the conversation pauses automatic following. **Jump to latest** explicitly resumes following, including when a paused response grows beyond the visible pane. Clearing the conversation or changing cases resets the starting view.

Starter loading has a visible status. Missing, rejected, or unavailable caches show a clear explanation without presenting a live question as free. The existing case, lesson-hash, schema, and review validation remains authoritative. Changing levels before the first question updates the available questions and introduction; after a conversation starts, its original messages remain intact.

Connection dialogs restore focus to the original action or, after disconnecting removes that action, the new Connect button. Tutor tours distinguish reviewed starter answers from live questions that share the current view.

## Validation

- All 579 tests in 75 files pass. Type checks for the app, SDK, and examples, the production build, and whitespace checks pass.
- New regression coverage includes pointer, touch, and keyboard answer selection; exact cached content with no capture or inference; clear/reset behavior; level changes and preserved prompt history; missing and rejected caches; delayed responses after a case switch; manual scrolling and pausing near the bottom during streaming; explicit resume; and focus after disconnecting.
- Frozen research controls and transcript/inference settings remain covered by the existing integration tests. The ordinary starter card, editable level, and introduction disclosure do not appear in locked research sessions.
- Browser inspection at 320, 390, and 1440 pixels found no horizontal page overflow. At 390 × 844, all three sample questions are visible immediately. At 320 × 740, the smaller conversation pane requires vertical scrolling for the third question.
- Browser keyboard selection placed the reviewed answer 12 pixels below the conversation pane's top and focused it. Clear returned the pane to its starting position. Level changes, connection dialog open/Escape/return focus, and the tutor tour were exercised.
- Blocking the sample's starter JSON produced the unavailable state. Pausing that request produced the loading state; resuming restored all three reviewed questions. Browser request interception and cache overrides were removed afterward.

Browser checks used existing reviewed sample answers. No live model request, new clinical content, or clinical approval was performed. This change does not measure learning outcomes or claim a traffic increase.
