# Create a visual teaching case

[← Documentation home](../README.md)

Case Studio turns one approved image—or an ordered set of images—into a reusable browser-local teaching case. You do not need to write code.

Saving a case also creates an unreviewed starter lesson. You can refine that lesson in Lesson Builder immediately afterward.

## Before you begin

Prepare these items:

- one or more JPEG, PNG, or WebP images;
- permission or usage terms that allow you to store, teach with, and export the images;
- the HTTPS page where the image came from;
- an HTTPS page for the license or usage terms;
- the wording required for attribution;
- a short learner-facing vignette with no direct identifiers;
- an answer-safe image description; and
- a person who can review every image and field for identifiers.

Use synthetic material when practical. If an image represents a real person, follow your institution's approved de-identification, consent, and data-handling workflow before bringing it into CaseAttend.

> Automated screening in Case Studio is only a warning tool. It does not establish HIPAA de-identification, consent, permission to publish, clinical suitability, or institutional approval.

## Open Case Studio

1. Open the CaseAttend home screen.
2. Select **Create a case from images**.

Case Studio has four steps: **Images**, **Describe**, **Rights and privacy**, and **Preview and save**.

## Step 1: Add and order images

Select **Select images**, then choose one or more JPEG, PNG, or WebP files.

CaseAttend checks the actual file contents, decodes the images, and creates prepared copies in the browser. It re-encodes the visible pixels so ordinary source metadata such as EXIF is not carried into the prepared copy. That process does not remove text or identifying features that are burned into the pixels.

For an image stack:

1. Use the up and down controls to put the frames in teaching order.
2. Choose which frame should appear on the home-screen case card.
3. Remove duplicates or irrelevant frames.

Changing the image list or order clears earlier privacy results. Run screening again after the final order is set.

Raw DICOM is not accepted. DICOM can contain identifying metadata and burned-in identifiers, so conversion and de-identification belong in an institution-managed clinical-data workflow. See [Supported files](../reference/supported-files.md) for the image limits.

## Step 2: Describe the teaching case

Start with the title, specialty, difficulty, and teaching text. Case Studio creates a case ID from your title. Open **Case identifier and image settings** only if you need to change that ID, the modality, or the series label. A custom ID is kept when you revise the title.

The table below explains what each field records and where it is used.

| Field | What to write | Example shape |
| --- | --- | --- |
| **Case ID** | Created from the title; a stable lowercase ID with words separated by hyphens | `chest-pattern-01` |
| **Case title** | A short, recognizable teaching title | `Unilateral pleural finding` |
| **Specialty** | The closest available subject area | `Radiology` |
| **Difficulty** | The intended challenge level | Choose the best available option |
| **Modality** | A familiar modality code or label | `CR`, `CT`, `MR`, `PATH`, `XC`, or `OT` |
| **Series label** | A plain-language label for this image or stack | `Frontal chest radiograph` |
| **Learner-facing vignette** | Context the learner needs, without direct identifiers | Age range, relevant symptoms, and timing |
| **Neutral case description** | What is present without revealing the finding or diagnosis | `Single frontal chest image` |
| **Accessible image description** | Answer-safe description stored with the image and announced for the current image or frame in the viewer | Describe layout, modality, and orientation |
| **Educator-only teaching note** | The important teaching answer or interpretation | Keep it focused and evidence-based |
| **Content warnings** | Warnings recorded in the Case Package for review and downstream use | `Includes graphic pathology image` |

### Keep the neutral fields truly neutral

The vignette, neutral description, and accessible description should let a learner enter the case without giving away the diagnosis. Put answer-revealing material in **Educator-only teaching note** instead.

The main viewer announces the authored **Accessible image description** for a single image and the current frame's authored description for an image stack. Make both that field and the **Neutral case description** meaningful and answer-safe. Content warnings appear as a persistent content note over the case viewer; they are not shown on the home card, so use your course's normal learner-notification process as well.

Bad neutral description:

> Right tension pneumothorax with mediastinal shift.

Better neutral description:

> Single frontal chest radiograph obtained for acute shortness of breath.

The exact wording depends on your teaching purpose; the point is to describe the setup without solving it.

## Step 3: Review rights and privacy

### Record provenance and usage terms

Enter the source name, the HTTPS URL for the actual image source, license or usage terms, the HTTPS URL for those terms, and the required attribution. An optional SPDX identifier such as `CC-BY-4.0` can help standardize a known license.

The image source and the license page serve different purposes. A license page may explain reuse rights, but it is not proof of where a particular image came from. Neither one proves a clinical teaching claim.

Check **Rights to use and export** only after you have verified that the recorded terms or authorization cover this use.

### Run browser-local screening

Select **Run screening**. Case Studio checks each prepared image for possible text and faces in the browser. Recognized text is discarded; the screen keeps warning counts and status rather than the recognized text itself.

Review every warning. A “no warning detected” result is not proof that an image is safe. Automated tools can miss small, faint, rotated, handwritten, unusual, or context-dependent identifiers.

### Complete human review and attestation

Choose the truthful option:

- **Synthetic case** if the images and vignette do not represent an identifiable real person; or
- **De-identification attested** only when a person has completed the applicable review and can be named.

Then confirm that a person reviewed every image and all authored text. CaseAttend records what you attest; it does not verify the attestation.

## Step 4: Preview, save, and export

Check the title, neutral description, accessible description, attribution, frame order, and card preview one more time.

Select **Save case**. CaseAttend saves the case in this browser and links it to an unreviewed starter lesson. Saving does not contact an AI model and does not make the content clinically reviewed.

After saving, you can:

- select **Build the lesson** to open Lesson Builder;
- select **Open case** to rehearse the learner experience; or
- select **Export a copy** to download a `.caseattend` backup.

### Optional: prepare a reviewed no-key opening

The saved case can have a separate intro cache: a reviewed opening and instant starter answers that learners can use without making a new model request.

1. In **Create starter questions**, select **Connect OpenRouter** if no key is connected.
2. Select **Generate draft answers**. This sends the case context, lesson objectives, teaching notes, and up to four representative case images to OpenRouter and the selected provider.
3. Review and edit the opening and every answer at every learner level.
4. Select **Save edits** after making changes.
5. Enter the reviewer name and credentials, then select **Approve starter answers** only after the review is complete.

Saving, importing, reconnecting an account, and status refreshes do not start generation. Only **Generate draft answers** or **Regenerate draft answers** starts the optional model request; provider charges may apply. The raw source image filenames are not sent, but the prepared representative images and the listed case and lesson content are. The cache is stored separately in this browser and is not included in a `.caseattend` backup, whether it is still a draft or already approved.

Save your edits before regenerating. During a save or approval, navigation is temporarily unavailable so the operation can finish. If stored answers change while you have unsaved edits, those edits remain visible; copy anything you need before selecting **Load latest answers**.

Export before closing the page if Case Studio warns that storage is memory-only. Even with persistent browser storage, keep a portable backup before clearing site data or deleting the case.

## Quality check before learners use the case

- [ ] The case contains no direct identifiers in pixels or text.
- [ ] The image order matches the intended reasoning sequence.
- [ ] The neutral and accessible image descriptions are useful but do not reveal the answer.
- [ ] The vignette contains only teaching-relevant context.
- [ ] The artifact source, usage terms, and attribution are verifiable.
- [ ] The synthetic or de-identification statement is truthful.
- [ ] A person reviewed every image and field.
- [ ] The exported `.caseattend` backup was tested in a separate approved browser profile or device.
- [ ] The linked lesson has been refined and reviewed separately.

## What is saved and shared

Browser storage and a portable `.caseattend` export contain the exact case metadata, its linked lesson, and the referenced re-encoded image copies. They do not include your OpenRouter key, chat, session records, or original filenames.

See [Share, back up, and restore](share-back-up-and-restore.md) before sending a case to someone else.

---

Next: [Build a lesson →](build-a-lesson.md)
