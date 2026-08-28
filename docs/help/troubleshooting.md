# Troubleshooting

[← Documentation home](../README.md)

Start with the message shown on screen. CaseAttend tries to leave existing work unchanged when a file fails validation, but browser-local work should still be backed up before destructive steps.

## I cannot type or send a new tutor question

Typing new questions requires an OpenRouter connection.

1. In the **AI Tutor** panel, select **Connect**.
2. Select **Continue with OpenRouter**.
3. Complete OpenRouter sign-in and authorization.
4. Return to CaseAttend and choose a model.

Some built-in suggested items may have a pre-cached, free answer. That does not connect a model for new typed questions.

If you were connected before, choose **Change**, disconnect, and reconnect. Also check whether the selected model is available to your OpenRouter account and whether that account has reached a limit. Never paste a key into a case, chat, screenshot, or support request.

## The AI request failed

Your typed question should remain visible. Try the on-screen retry action after checking:

- the browser has a network connection;
- OpenRouter is still connected;
- the selected model is available;
- a paid model has sufficient OpenRouter credit;
- a free model has not reached its provider limit; and
- the request did not time out.

Retry captures the **current** view, so return to the intended frame and annotations first.

## My image is rejected in Case Studio

Case Studio accepts files whose contents and extension match JPEG, PNG, or WebP. Renaming an unsupported file does not convert it.

Check that:

- the file is not empty or damaged;
- the extension matches the actual image type;
- each image is no larger than the documented byte and pixel limits;
- the whole stack is within the total limits; and
- the browser can decode the image.

Use an approved image editor to export a fresh JPEG, PNG, or WebP copy, resize or downsample it if necessary, then try again. See [Supported files](../reference/supported-files.md) for exact limits.

## Raw DICOM is rejected

This is expected. Raw DICOM can contain identifying metadata and burned-in identifiers. Case Studio intentionally does not provide a DICOM de-identification workflow.

Use your institution's approved clinical-data process to de-identify the study, choose appropriate teaching frames, remove burned-in identifiers, and export approved JPEG, PNG, or WebP copies. A format conversion by itself is not de-identification.

## The image order is wrong

In Case Studio's **Images** step, use the up and down controls in **Frame order**. Choose the intended case-card preview separately.

Any image-list or order change clears earlier privacy results. Continue to **Rights and privacy** and run screening again, then repeat human review.

## Privacy screening shows a warning

A warning is a reason to inspect the exact image, not an automatic finding that it is safe or unsafe.

1. Review the image at full useful size.
2. Check text-like regions, faces, burned-in labels, distinctive marks, and the authored text.
3. Replace or remediate the source through your approved workflow if needed.
4. Re-add the prepared image and run screening again.
5. Complete the required human review.

A “no warning detected” result is also not proof of de-identification. Automated checks can miss identifiers.

## Privacy screening is unavailable

Your browser may not support a required local capability or an asset may not have loaded. Try a current version of a supported desktop browser, reload CaseAttend, re-add the images, and run screening again.

Do not treat “unavailable” as “no identifiers.” A person must review the material under the applicable workflow regardless of automated status.

## Case Studio will not move to the next step

Read every item under **Review these items**. Common causes include:

- no supported image was added;
- the Case ID is not lowercase kebab-case;
- a required description or teaching note is empty;
- the source or license URL is missing, is not HTTPS, or contains embedded credentials;
- rights to store, use, and export were not confirmed;
- screening was not run after the latest image change;
- neither **Synthetic case** nor **De-identification attested** was chosen;
- an attester name is missing; or
- human review was not confirmed.

Correct the underlying item rather than entering placeholder review, rights, or source information.

## A local Case ID is already in use

Case IDs are unique in one browser. Choose a new lowercase ID when you are creating a genuinely different case.

For a restore, first export the current case. Delete it only if you have confirmed which version should remain and have a recoverable copy. Then import the desired backup. See [Share, back up, and restore](../guides/share-back-up-and-restore.md).

## My browser-local case disappeared

Cases do not automatically follow you between browsers, profiles, devices, domains, or private-browsing sessions. Clearing site data may remove them.

1. Return to the same browser profile and exact CaseAttend site address used for authoring.
2. Check whether private browsing or an organizational cleanup policy removed local data.
3. Restore the most recent `.caseattend` backup through **Create a case from images** → **Import case**.

Without a portable export, deleted or cleared browser data may not be recoverable.

## A `.caseattend` file will not import

Common reasons include:

- the file is not actually a CaseAttend portable archive;
- it was renamed from JSON or another ZIP;
- bytes or hashes changed after export;
- the archive is incomplete, damaged, too large, or contains unexpected files;
- an included image cannot be decoded; or
- the same browser-local Case ID already exists.

Return to the source browser and create a fresh **Export portable case** download if possible. Do not manually add, remove, rename, or recompress files inside the archive.

## My exported JSON will not restore in Case Studio

This is expected for a lesson built on a built-in case. **Export bundle** downloads a JSON case-and-lesson bundle because the built-in image is part of the deployed application. Case Studio's **Import case** accepts portable `.caseattend` archives, not those JSON bundles.

Keep the JSON with your version and release records. If you need a restorable browser-local case with image bytes, create the authorized visual case in Case Studio and export a `.caseattend` file.

## Lesson Builder reports validation errors

Common causes include:

- the Lesson ID or another row ID is not lowercase kebab-case;
- the content version is not a valid three-part semantic version such as `1.0.0`;
- no learner level is selected;
- an objective has no criterion or observable evidence;
- a hint points to an objective ID that was renamed or removed;
- an escalation or stopping row is incomplete;
- answer-revealing teaching notes are empty;
- a source lacks both an HTTPS URL and a DOI; or
- the lesson is marked reviewed but reviewer details or a clinical-teaching source are missing.

Fix the first errors, validate again, and then inspect the exact prompt preview. Validation checks structure and hashes; it is not a medical accuracy check.

## My PDF produces no useful draft

Try selecting and copying a sentence in a normal PDF reader. If you cannot select the text, the PDF is probably a scan. CaseAttend does not promise OCR for lesson imports.

Ask for an accessible searchable PDF, type the essential material manually, or use an institution-approved OCR process before importing. Never upload sensitive material to an unapproved public converter.

## My PDF or PowerPoint is rejected

The lesson importer accepts one `.pdf` or `.pptx` at a time. Files over 25 MiB (26,214,400 bytes, shown in the app as 25 MB) or documents over 80 pages/slides are rejected. Extracted text is capped at 60,000 characters; later text is omitted with a warning rather than applied.

Check that the file:

- uses `.pdf` or modern `.pptx`, not older `.ppt`;
- is within the file-size and page/slide limits;
- is not empty, damaged, encrypted, or password protected; and
- matches its extension.

If the material is longer, make a smaller teaching-focused copy under your approved workflow. Do not split a document merely to bypass the intended lesson-size boundary; remove content that does not belong in the lesson.

## PowerPoint text appears out of order

The importer extracts text stored in non-hidden slides, not the presentation's visual layout. Text in multiple shapes, columns, diagrams, and groups may arrive in an unexpected order. Shapes explicitly marked hidden are skipped, but off-canvas or visually unobvious text can still appear in the preview, so remove anything unexpected before applying the draft.

Reorder and rewrite the editable draft around your objectives. The importer does not convert slide screenshots or embedded images into case artifacts.

## Importing a document changed the draft fields

Before **Apply imported draft**, read the preview and any replacement confirmation. If you apply a useful but imperfect draft, edit the fields normally in Lesson Builder.

The raw document is not stored or exported, but applied text becomes lesson content. Remove identifiers, logistics, duplicated text, unsupported claims, and answer-revealing text in learner-facing fields.

## I expected PDF pages or slides to appear in the viewer

Document import is text-only by design. It does not turn pages, slides, diagrams, or embedded media into case images.

To create a visual case, use authorized, reviewed JPEG, PNG, or WebP images in Case Studio. Do not take screenshots as a shortcut around licensing, accessibility, or privacy review.

## Export or download does nothing

Check whether the browser blocked automatic downloads. Allow the single requested download for the CaseAttend site, then try the export again. Also confirm there is sufficient local disk space.

If you are editing a browser-local case, make sure the exact case revision still exists in browser storage. A change in another tab can make the open revision stale; reload and verify before saving or exporting.

## Still stuck?

Before opening an issue, record non-sensitive details:

- the screen and step;
- the exact error message;
- browser name and version;
- operating system;
- file type and approximate size, without attaching sensitive content;
- whether the case is built-in, browser-local, or imported; and
- the smallest safe sequence that reproduces the problem.

Then use the repository's [bug-report form](https://github.com/JamesWeatherhead/CaseAttend/issues/new/choose). Never attach patient material, API keys, private institutional documents, or screenshots containing identifiers.

---

Reference: [Supported files →](../reference/supported-files.md)
