# Supported files and limits

[← Documentation home](../README.md)

CaseAttend uses different file controls for different jobs. Choose the row that matches what you are trying to do.

## Quick reference

| Task | Accepted file | How it is used |
| --- | --- | --- |
| Create a coached lesson from slides and objectives | One `.pptx` plus one `.xlsx` or `.csv` | Imports visible slide media and instructor notes for review, then assembles selected images with the educator's level-specific objectives and answer keys. |
| Create a visual case in Case Studio | JPEG (`.jpg`, `.jpeg`), PNG (`.png`), or WebP (`.webp`) | One image becomes a single-image case; several become an ordered image stack. Prepared pixels are re-encoded locally. |
| Start a lesson draft in Lesson Builder | One PDF (`.pdf`) or modern PowerPoint (`.pptx`) | Selectable PDF text or text stored in non-hidden PowerPoint slides is extracted locally into an editable draft. Pages and slides do not become case images. |
| Restore a browser-created case | One `.caseattend` portable case | The strict archive is validated and saves its exact case, linked lesson, and referenced re-encoded images in the browser. |
| Export a lesson for a built-in case | JSON (`.json`) | Metadata bundle for versioning or technical use. Case Studio does not import it. |

## Case Studio image limits

These limits apply to the images selected for a portable browser-created case.

| Limit | Value |
| --- | ---: |
| Maximum images/frames | 256 |
| Maximum bytes for one image | 25 MiB (26,214,400 bytes) |
| Maximum total image bytes | 96 MiB (100,663,296 bytes) |
| Maximum width | 8,192 pixels |
| Maximum height | 8,192 pixels |
| Maximum pixels in one image | 16,000,000 |
| Maximum pixels in the full stack | 64,000,000 |

An image must satisfy **all** limits. For example, an image can be under 8,192 pixels in both directions but still exceed the 16-million-pixel area limit.

Case Studio checks the file signature rather than trusting the filename. The extension and actual image bytes must agree. If the browser reports a specific MIME type rather than an empty or generic `application/octet-stream` value, that reported type must agree too. The browser must also be able to decode the complete image.

### What re-encoding changes

Case Studio decodes a supported image and re-encodes its visible pixels through the browser. This removes ordinary embedded source metadata from the prepared copy.

Re-encoding does not remove:

- text burned into the pixels;
- a visible face;
- a distinctive tattoo, device label, or unique mark;
- a reflected screen or label; or
- identifying information typed into the vignette, descriptions, notes, or attribution.

Run the warning-only screen and complete human review. A valid file is not automatically a safe, licensed, accessible, or clinically accurate teaching artifact.

## Slides and objective workbooks

The streamlined **Create a lesson** workflow accepts a PowerPoint up to 25 MiB and 80 slide positions, with up to 256 embedded PNG, JPEG or WebP pictures within the extraction limits. Only selected, decoded and re-encoded media enter the saved case. PowerPoint overlays, crops, animations, audio and video are not reconstructed. Notes are instructor source material and are not automatically learner content.

The objective workbook can be `.xlsx` or `.csv`, up to 8 MiB and 200 objective rows. A guided lesson supports up to 24 selected objectives per learner level. Use a visible **Objectives** worksheet and the columns shown in the [slides and objectives guide](../guides/slides-and-objectives.md). Formula cells use saved values only. External links are not fetched and macros are not run.

## PDF and PowerPoint text-import limits

| Limit | Value |
| --- | ---: |
| Files per import | 1 |
| Accepted types | `.pdf` or `.pptx` |
| Maximum file size | 25 MiB (shown in the app as 25 MB; 26,214,400 bytes) |
| Maximum pages or slides | 80 |
| Maximum text from one page or slide | 12,000 characters |
| Maximum extracted text | 60,000 characters |

The importer reads selectable PDF text and text stored in non-hidden PowerPoint slides locally. The raw source file is not stored with the case or lesson and is not included in `.caseattend` or JSON exports.

Documents over the file-size or page/slide limit are rejected. A very dense page or slide is capped at 12,000 characters. Text after the 60,000-character overall cap is omitted from the draft and the preview shows a warning.

### Important document limitations

- A scanned or image-only PDF may have no selectable text.
- Password-protected or encrypted documents are not supported.
- Old binary PowerPoint (`.ppt`) is not supported.
- Renaming `.ppt` to `.pptx` does not convert it.
- Slide layouts, presenter notes, comments, embedded media, and images do not become CaseAttend artifacts.
- Shapes explicitly marked hidden are skipped, but a non-hidden slide can contain off-canvas or visually unobvious text. Review the preview before applying it.
- Text can arrive in an unexpected order when a slide uses multiple shapes, columns, groups, or diagrams.
- No imported claim or citation is automatically verified.
- Import does not perform clinical review.

See [Import PDF or PowerPoint text](../guides/import-pdf-powerpoint.md) for the review workflow.

## Portable `.caseattend` files

A portable case is a strict CaseAttend ZIP-based archive, not a general folder or editable office document.

| Limit or rule | Value |
| --- | --- |
| Maximum archive size | 128 MiB (134,217,728 bytes) |
| Cases per archive | 1 |
| Lessons per archive | 1 exact linked Lesson Plan |
| Image types inside | Re-encoded JPEG, PNG, or WebP only |
| Extra files | Rejected |

On import, CaseAttend checks the archive structure, allowed paths, case-to-lesson link, declared dimensions, image type, byte length, and SHA-256 hashes. A renamed ZIP, JSON file, or manually edited archive is not a valid portable case.

The portable archive excludes the OpenRouter key, chat, session logs, original filenames, separately generated browser-local intro-cache drafts or approvals, unrelated browser data, and raw PDF or PowerPoint source documents.

## Files these authoring screens do not accept

The no-code Case Studio and Lesson Builder controls do not accept these as visual case inputs:

- raw DICOM (`.dcm` or DICOM content);
- PDF pages or PowerPoint slides;
- SVG;
- GIF or animated images;
- HEIC/HEIF;
- TIFF;
- video or audio;
- Word documents; or
- arbitrary ZIP files.

Do not convert a file merely to bypass a restriction. Conversion does not establish de-identification, rights, accessibility, or educational suitability.

For raw DICOM, use an institution-managed clinical-data workflow to de-identify the material, choose approved teaching frames, remove burned-in identifiers, and export reviewed JPEG, PNG, or WebP copies.

For a new artifact type or a managed clinical-data integration, use the [SDK guide](../sdk/README.md) and obtain the appropriate technical, security, and institutional review.

## Browser and storage considerations

All of these operations need enough browser memory to read and validate the selected file. A file that is within a formal limit can still fail if the browser cannot decode it or the device is low on resources.

Persistent saved cases depend on browser storage. If it is unavailable, Case Studio warns that it is using memory-only storage. Export a portable copy immediately in that situation.

---

Need help with an error? See [Troubleshooting →](../help/troubleshooting.md)
