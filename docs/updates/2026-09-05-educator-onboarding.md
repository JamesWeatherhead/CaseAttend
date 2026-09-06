# Easier educator onboarding

Case Studio now starts with a single image-selection card and a smaller import action. The introduction explains the three tasks in plain language: add images, describe the case, then review and save. All four steps fit across a small phone screen. Image-format details are available in an expandable section.

The description step starts with the title, specialty, difficulty, and teaching text. New case identifiers follow the title until the educator chooses a custom identifier. Existing identifiers are preserved. Identifier, modality, and series controls are grouped under **Case identifier and image settings**, which opens automatically when validation finds an error there.

After saving, **Open case**, **Build the lesson**, and **Export a copy** appear before optional AI assistance. Saving, importing, reconnecting an account, and status refreshes do not start generation. **Generate draft answers** is an explicit action with a nearby explanation of transmitted text and images, possible provider charges, and required review. Named reviewer credentials and the five-level approval gate remain in place.

Draft generation ignores late results from cancelled, superseded, or replaced cases. The controller rechecks cancellation, operation ownership, and the saved case revision before entering cache persistence. These checks do not provide a transaction across tabs or rollback after persistence has begun.

Navigation is temporarily disabled while edits are saved or approved. Unmounting during a save prevents the subsequent approval call. Equivalent storage refreshes preserve unsaved edits; a changed stored artifact keeps the edits visible and offers **Load latest answers** before further saving or approval. Regeneration requires saving current edits first.

Lesson Builder also has a shorter introduction that explains how the chosen case supplies images and an imported document supplies teaching text.

## Validation

- 553 tests in 73 files pass, including explicit generation, cancellation and supersession, revision changes, review-operation navigation, unmounting, and conflicting or equivalent cache refreshes.
- Type checks and the production build pass.
- Browser checks cover the upload screen at 1440, 390, and 320 pixels. The 320-pixel layout has no horizontal page overflow, and the icon-only Back button retains its accessible name.
- A synthetic one-pixel test case completed image selection, description, local screening, save, the export action, and opening in the viewer. The saved case remained usable without an AI connection.
- Provider generation and approval are tested with synthetic fixtures and mocked responses. No live model call or clinical approval was made during this validation.
