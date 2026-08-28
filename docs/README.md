# CaseAttend educator guide

CaseAttend is a browser-based visual tutor for case-based education. You can use a built-in case, make a case from approved images, and shape how the tutor guides a learner—all without writing code.

**Educational use only.** CaseAttend does not diagnose patients, verify clinical claims, grant permission to use an image, confirm de-identification, or provide institutional or institutional review board (IRB) approval. A qualified person remains responsible for every case and lesson.

## Choose what you want to do

| I want to… | Start here |
| --- | --- |
| Try CaseAttend as a learner | [Complete your first case](getting-started/first-case.md) |
| Turn one or more approved images into a case | [Create a visual teaching case](guides/create-a-case.md) |
| Design the tutor's objectives, hints, and stopping rules | [Build a lesson](guides/build-a-lesson.md) |
| Start a lesson from a PDF or PowerPoint file | [Import PDF or PowerPoint text](guides/import-pdf-powerpoint.md) |
| Plan on paper before using the builder | [Lesson-planning worksheet](templates/lesson-planning-worksheet.md) |
| Reuse or adapt material without code | [No-code adaptation guide](adapt/no-code.md) |
| Give a case to a colleague or keep a backup | [Share, back up, and restore](guides/share-back-up-and-restore.md) |
| Check which files work | [Supported files](reference/supported-files.md) |
| Fix a problem | [Troubleshooting](help/troubleshooting.md) |

Open the public app at [caseattend.com](https://caseattend.com).

## From a winning prototype to an open teaching tool

CaseAttend grew from VibeRad, one of 50 winners selected from 4,096 entries in the Google DeepMind “Vibe Code with Gemini 3 Pro” Kaggle hackathon. Read [From a hackathon win to an open teaching tool](story/google-deepmind-win.md), see [How CaseAttend works](how-it-works.md), or visit the [Kaggle writeup](https://www.kaggle.com/competitions/gemini-3/writeups/new-writeup-1765065566929).

## The three things to know

### A Case Package is the material the learner sees

A case holds the teaching image or ordered image stack, vignette, accessible description, source and license information, privacy attestation, and a reference to one exact lesson.

Use **Create a case from images** on the home screen to make one. Case Studio accepts approved JPEG, PNG, and WebP images. It does not accept raw DICOM.

### A Lesson Plan is the route through the case

A lesson defines what learners should accomplish and how the tutor should help. It includes objectives, observable evidence, the opening question, hints, escalation rules, stopping conditions, educator notes, sources, and an explicit clinical-review state.

Use **Create a lesson from PDF or PowerPoint** on the home screen, or choose **Build the lesson** after saving a new case. You can build manually even when you do not import a document.

### A `.caseattend` file is a portable copy

For a case you create in the browser, **Export portable case** downloads one `.caseattend` file. It contains the exact case, its linked lesson, and the referenced re-encoded images. A colleague can restore it through Case Studio's **Import case** action.

The portable file does **not** contain your OpenRouter key, chat, session records, original filenames, an imported PDF or PowerPoint source file, or a separately generated browser-local intro-cache draft. See [Share, back up, and restore](guides/share-back-up-and-restore.md) before relying on browser storage.

## A dependable educator workflow

1. **Prepare approved material.** Use synthetic or properly de-identified images that you are authorized to store, teach with, and share.
2. **Create the case.** Add images in Case Studio, describe them without giving away the answer, record provenance and usage terms, run the warning-only privacy screen, and complete a human review.
3. **Design the lesson.** Write a small number of observable objectives, a focused opening question, a gradual hint path, and a clear stopping point.
4. **Check sources and review state.** Image provenance and clinical teaching evidence are different. Mark a lesson clinically reviewed only after a qualified reviewer has actually reviewed it.
5. **Rehearse as a learner.** Open the case, choose the intended learner level, inspect the image, and try likely learner responses—including wrong or incomplete answers.
6. **Export a portable copy.** Keep the exported file somewhere managed by your team before clearing browser data, changing browsers, or deleting a local case.

The [lesson-planning worksheet](templates/lesson-planning-worksheet.md) turns this workflow into a reusable checklist.

## What stays local, and what is sent

Case creation, lesson editing, validation, PDF/PowerPoint text extraction, and export happen in your browser. Dropping a teaching document into Lesson Builder does not upload that source document; CaseAttend extracts selectable PDF text or text stored in non-hidden PowerPoint slides into an editable draft and does not store or export the raw document. Review the preview because a slide can contain text that is not visually obvious.

The learner experience has a separate boundary: nothing is sent to an AI model until a learner submits a question. On submission, the current view, the learner's message, and relevant conversation context go to OpenRouter and the selected model provider. Do not use identifiable patient data.

For the full security boundary, see [the repository security policy](../SECURITY.md).

## Important limits

- Automated text and face checks are warnings, not proof of de-identification.
- A scanned PDF may contain no selectable text, so the lesson importer may find nothing useful.
- PDF and PowerPoint import extracts text only. It does not turn pages or slides into case images.
- Imported text is a draft. CaseAttend does not check its medical accuracy or perform clinical review.
- Clearing site data, using private browsing, or moving to another browser can remove or hide browser-local work. Export a backup.
- The `.caseattend` format is for portable cases created in Case Studio. A JSON lesson bundle exported for a built-in case is not a Case Studio restore file.

## More technical paths

These guides are written for educators and program staff. If you need to change application code, embed the tutor, build a research protocol, or add a new clinical domain, use the advanced documentation:

- [How CaseAttend works](how-it-works.md)
- [Host CaseAttend on Cloudflare Pages](adapt/self-host-cloudflare.md)
- [Adapt CaseAttend with the SDK](adapt/sdk.md)
- [SDK and integration guide](sdk/README.md)
- [Research guide](research/README.md)
- [Content catalog notes](catalog/CONTENT_PACKS.md)
- [Contributing guide](../CONTRIBUTING.md)

---

Next: [Complete your first case →](getting-started/first-case.md)
