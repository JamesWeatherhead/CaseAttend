# Slides and curriculum to coached practice

## Requested outcome

An educator uploads a PowerPoint containing reusable teaching media and a spreadsheet of learning objectives by audience. CaseAttend assembles a lesson that uses the educator's supplied answers and image findings, coaches the learner through reasoning, and shows evidence of progress on each objective. The educator should not have to rebuild a curriculum through dozens of technical fields.

The workflow must be exercised with a real openly licensed university teaching deck, an actual Excel workbook, and Wikimedia media. The original site improvement goal remains active; this is the current user-directed priority. Initial-load optimization is parked with no source changes.

## Required behavior

1. Import slides, embedded media, and a spreadsheet locally. Preserve slide/row provenance, licensing, supported levels, educator answers, expected evidence, and hints. Never silently replace an established answer key with extracted document text.
2. Offer a short assembly review: select the teaching media, confirm the answer key, inspect objectives by level, then create and open the saved lesson. Technical identifiers and hashes belong in optional details.
3. Preserve distinct authored curricula for the requested levels. Existing five-level shared-objective semantics are insufficient for a spreadsheet with different objectives for each audience; do not silently collapse or ignore rows.
4. Keep educator answers separate from learner-visible descriptions and media. The tutor uses those answers to coach, asks for an attempt before hints, and does not turn starter buttons into answer reveals in coached mode.
5. Show objective evidence alongside the conversation. A separate small-model evaluator checks a learner response against the educator rubric. Its output is formative evidence, not proof of durable mastery, and must be attributed to the exact lesson, level, and turn.
6. Preserve ordinary-session continuity, cancellation, private browser credentials, immutable case/lesson references, and frozen research behavior. Any new evaluator requires its own explicit ordinary-learning integration; it must not enter frozen research collection implicitly.
7. Verify import, creation, reopening, level selection, coaching, and progress in the browser. Ship the completed workflow through the protected GitHub and Cloudflare pipeline.

## Baseline before this branch

- Baseline release: a38b93e, PR 116. All 606 tests passed before this work.
- PowerPoint import currently reads visible slide text only. It does not import embedded images or Excel objectives.
- The existing canonical answer key is `LessonPlan.teachingNotes`; Case Studio and Lesson Builder already pass it into the tutor's educator content.
- Applying a document outline currently replaces both objectives and answer notes.
- Lesson Plan v1 has one shared objectives/rubric/hints set, with optional audience-specific opening text. The visual builder rejects those optional openings.
- Ordinary tutoring currently offers unsupported levels; a focused correction is in progress.
- Progress currently counts turns. `objective_evidence_recorded` exists but is not produced by the live tutor, and is deliberately unsupported in frozen research v1.
- Wikimedia source inspected: Bonilla et al., *Chest X-ray of pneumothorax*, CC BY 4.0, https://commons.wikimedia.org/wiki/File:Chest_X-ray_of_pneumothorax.png. Source report DOI: 10.1186/s13256-019-2215-4. The documented right-sided finding and image arrows come from the source, not an automated diagnosis. Original downloaded for the authoring walkthrough; no clinician review has been claimed.

## Work in progress

- Verified the Wake Forest MedEdPORTAL package and the individual Wikimedia illustration credit. Downloaded original decks and images. The Lab slide-23 example and 12-row, six-level XLSX are in `public/teaching-examples/cranial-nerves` with rights and source notes.
- Documented primary literature and limits in `guided-practice-evidence.md`. No claim that CaseAttend prevents deskilling or certifies mastery.
- Implemented bounded local PPTX raster/notes and XLSX/CSV parsers. Real decks pass extraction. Notes are resolved through actual slide relationships: Lab slide 23 uses notesSlide21, and slide 24 uses notesSlide22. Matching numeric filenames would give incorrect teaching answers.
- Extended Lesson Plan with optional objective audiences, original slide references and guided mode. Added distinct ordinary Step 2 selection and session-event acceptance while preserving old shared lesson hashes, cached-answer schema, and frozen research constraints.
- Detailed builder now retains curriculum metadata/openings/turn budgets, exposes the educator answer key in Setup, and appends imported text without erasing the key.
- Added separate formative objective assessment with exact attribution, quote validation, paid-model disclosure, explicit opt-in, cancellation and safe failure states. Objective checks start off. Assisted evidence can complete guided practice while remaining explicitly assisted; it is not independent retention.
- Implemented the three-step assembly UI, including **Use MRI example** and **Use illustration example** actions. Nine component workflow tests and seven assembly tests pass, covering review, cancellation, selected media, curriculum limits, persistent versus memory-only storage, export failure and save retry. TypeScript passed after these changes. Broader release verification remains in progress.
- Added the original lecture and six-row Wikimedia illustration workbook in `public/teaching-examples/facial-branches`. The slide-48 image retains Patrick J. Lynch and C. Carl Jaffe's CC BY 2.5 credit; the course and new workbook have separate CC BY 4.0 terms.

## Browser and live-provider verification so far

- **Public site connection:** the user connected OpenRouter on the public site. Two actual free-model requests failed with HTTP 429. A paid Gemini 3.1 Flash Lite request returned an actual coaching reply through the baseline tutoring flow. This establishes connection and baseline inference, not the new guided evaluator's behavior.
- **Local MRI workflow:** actual PowerPoint and XLSX upload, lesson creation, browser save, reopening, and selection of all six learner levels have been verified. These were real source files, not parser mocks.
- **Wikimedia illustration:** the real lecture and workbook pass import. Completing creation is pending a JPEG canvas ICC-metadata fix and another browser walkthrough.
- **Still pending:** a live test of the new guided coaching/evaluation path, completion of the remaining browser and release checks, and deployment through the protected GitHub/Cloudflare pipeline.

## Local release verification

- Both real examples now save and export through the browser. Downloaded MRI and Wikimedia lesson archives were independently re-imported and validated: 12/6 objectives, all six levels, guided mode, correct CC BY 4.0/2.5 image licences, PNG assets, and clinical review false.
- Fixed a browser-added JPEG ICC profile by re-encoding the same canvas pixels as PNG once and revalidating, without weakening portable metadata checks.
- Verified the saved MRI reopens from the library and Step 2 selects the authored curriculum. Desktop shows parallel coaching/evidence columns; the 390-pixel mobile layout has no horizontal overflow and exposes the tutor through its navigation control.
- Fixed the OpenRouter dialog being obscured by the case header. A browser hit test now reaches its Close button, and clicking dismisses it.
- Local release checks: 738 tests in 86 files, full typecheck, and production build pass. Guided live inference and deployment verification remain pending.

This document records incomplete work. It is not evidence that the requested workflow has shipped.
