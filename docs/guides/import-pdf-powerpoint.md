# Start a lesson from a PDF or PowerPoint file

[← Documentation home](../README.md)

Lesson Builder can extract text from one PDF or modern PowerPoint file and use it to prepare an editable lesson draft. This is useful when your objectives, discussion prompts, or teaching notes already exist in a handout or slide deck.

The import is deliberately limited: it helps you move text into Lesson Builder. It does not turn a document into a finished, reviewed lesson.

## What the importer does

- accepts one `.pdf` or `.pptx` file at a time;
- reads the file locally in your browser;
- extracts selectable text from a PDF or text stored in non-hidden slides in a PowerPoint presentation;
- presents the extracted material as an **Imported draft, educator review required**;
- lets you apply that draft to editable Lesson Builder fields; and
- keeps the selected Case Package as the visual case for the lesson.

## What it does not do

- It does not upload the source document for extraction.
- It does not store or export the raw PDF or PowerPoint file.
- It does not convert PDF pages or PowerPoint slides into case images.
- It does not import embedded images, video, audio, or slide layouts as teaching artifacts.
- It does not make a scanned PDF searchable.
- It does not verify citations, medical claims, licensing, permissions, or de-identification.
- It does not mark the lesson clinically reviewed.

If you need images from a document to become the learner's visual artifact, first obtain and review authorized image files through your normal workflow, then add supported JPEG, PNG, or WebP copies in [Case Studio](create-a-case.md). The text importer is not an image-conversion shortcut.

## Limits

| Limit | Current value |
| --- | --- |
| Files per import | 1 |
| Accepted document types | PDF (`.pdf`) or PowerPoint (`.pptx`) |
| Maximum file size | 25 MiB (shown in the app as 25 MB; 26,214,400 bytes) |
| Maximum document length | 80 pages or slides |
| Maximum text from one page or slide | 12,000 characters |
| Maximum extracted text | 60,000 characters |

Older `.ppt` presentations are not supported. See [Supported files](../reference/supported-files.md) for the complete authoring-file table.

Files over 25 MiB or documents over 80 pages/slides are rejected. Text from a very dense page or slide is capped at 12,000 characters. If readable text runs past 60,000 characters overall, the draft includes the first 60,000 and shows a warning; later text is not applied.

## Import step by step

1. From the CaseAttend home screen, select **Create a lesson from PDF or PowerPoint**.
2. In **Setup**, choose the **Teaching case** this lesson will teach.
3. Expand **Import teaching text**, below the lesson title and learner levels.
4. Drag one `.pdf` or `.pptx` file into the import area. You can also use its file-picker button, which is the better option for keyboard and assistive-technology users.
5. Wait while CaseAttend extracts text locally.
6. Read the import preview and every warning. Check that the material belongs to the selected case.
7. Select **Apply imported draft** when the preview is useful.
8. Review and edit every populated field before moving through the rest of Lesson Builder.

Collapsing **Import teaching text** keeps the current preview and any ongoing parse. Reopening it lets you continue reviewing. Changing the teaching case clears that import preview and cancels its pending parse, keeping material for different cases separate.

If the current lesson already contains work, CaseAttend asks before replacing editable material. Read that confirmation carefully. A failed or cancelled parse should not become a reason to discard the lesson you already wrote.

## What **Apply imported draft** changes

The importer suggests structure; it does not simply paste a document into one box.

| Draft area | What happens |
| --- | --- |
| Lesson title | Uses a detected title when one is available |
| Objectives | Creates editable objective candidates with placeholder criteria and evidence |
| Tutor path | Creates an editable opening, one starting hint, an escalation condition, a stopping condition, and tutor instructions |
| Answer-revealing teaching notes | Adds the extracted text under page or slide headings |
| Clinical review | Resets to **not reviewed** and clears reviewer details |

The selected Case Package, stable Lesson ID, content version, learner settings, prerequisites, neutral description, and existing citation fields remain under your control. Links detected in the document appear only as **not verified** preview information; CaseAttend does not add them as sources for you.

All generated criteria, evidence, hints, and conditions are placeholders. Rewrite them for the actual case and learner audience.

## Review the imported draft

Treat imported wording as source notes, not as learner-ready design. Work through this checklist:

### Remove material that should not enter the lesson

- names, dates, record numbers, contact details, and other identifiers;
- presenter logistics, course administration, or unrelated sections;
- duplicated headers and footers;
- answer text that was placed in a learner-facing description; and
- claims you are not prepared to teach or source.

Do not use identifiable patient documents, even though extraction is local.

### Rewrite objectives as observable actions

A heading such as “Pneumothorax” is a topic, not an objective. Rewrite it as something the learner can demonstrate:

> Compare the pleural margins on both sides and explain which visible feature is most important.

Then write an assessment criterion and one or more observable statements or behaviors.

### Build a real hint path

Slides often reveal information all at once. Split that information into gradual hints: orient, compare, interpret, then explain. Keep the answer in educator-only teaching notes until the learner has attempted the reasoning.

### Verify every source

A URL or DOI found in a document is not automatically a verified citation. Open it, confirm that it supports the intended claim, and assign the correct source role:

- **Artifact provenance** for the case image; or
- **Clinical teaching** for a clinical claim.

### Keep review status truthful

Import always produces a draft. Leave **Reviewed by a qualified clinician** off until a qualified clinician has actually reviewed the resulting CaseAttend lesson. Importing a previously reviewed slide deck does not automatically review the newly structured lesson.

## If a PDF produces little or no text

Many scanned PDFs contain photographs of pages rather than selectable text. The importer does not promise OCR, so a scan may produce no useful draft.

To check, open the PDF and try to select and copy a sentence. If you cannot select text, use one of these options:

1. Type the essential lesson material into Lesson Builder.
2. Ask the document owner for an accessible, searchable PDF.
3. Use an institution-approved OCR process, review the result, and export a searchable PDF before importing.

Do not send sensitive material to a public conversion website. Local extraction inside CaseAttend does not make an unsafe upstream conversion safe.

## If slide text arrives in an odd order

PowerPoint stores text in separate shapes, so extracted text may not read in the same order as the visual slide. Columns, diagrams, grouped objects, repeated labels, decorative text, and text placed off the visible canvas are especially likely to need cleanup. The importer skips a whole slide marked hidden and shapes explicitly marked hidden, but the preview can still include off-canvas or visually unobvious text from a non-hidden slide.

Use the preview to decide whether the draft saves time. After applying it, reorder and rewrite the editable fields around the lesson's learning objectives rather than the deck's visual layout.

## What happens to the source file

The browser reads the selected document for the current import. The raw document is not stored in the saved case, the lesson, browser-local Case Package storage, a JSON lesson bundle, or a `.caseattend` export.

The editable text you choose to apply **does** become lesson content and can be saved or exported. During a later live tutor turn, active Lesson Plan content—including imported text placed in teaching notes or other fields—can be sent to OpenRouter and the selected model provider. It can also be included in educator-triggered intro-cache generation. Review that text for privacy, rights, and accuracy just as you would review text typed by hand.

---

Next: [Use the lesson-planning worksheet →](../templates/lesson-planning-worksheet.md)
