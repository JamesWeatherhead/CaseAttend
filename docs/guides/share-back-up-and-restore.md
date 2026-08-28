# Share, back up, and restore a case

[← Documentation home](../README.md)

CaseAttend does not provide an educator account or cloud library. Cases you create are stored in the current browser when persistent browser storage is available. A portable `.caseattend` file is the dependable way to move or back up that work.

## Know which download you have

| Download | What it contains | Can Case Studio restore it? |
| --- | --- | --- |
| `.caseattend` portable case | One exact browser-created case, its linked lesson, and its referenced re-encoded images | Yes |
| `.json` case-and-lesson bundle | Versioned case and lesson metadata for a built-in case; built-in image bytes are not included | No |
| Session-data `.jsonl` or `.csv` | Browser-local learning-event records | No |

Renaming a JSON or ZIP file to end in `.caseattend` does not convert it. CaseAttend validates the structure, hashes, links, image bytes, and allowed archive contents during import.

## What a portable case excludes

A `.caseattend` export does not include:

- your OpenRouter key;
- learner chat or session records;
- research records;
- original image filenames;
- a separately generated browser-local intro-cache draft or approval;
- unrelated browser data; or
- a raw PDF or PowerPoint file used to start a lesson draft.

The editable text you applied from a teaching document is lesson content, so that text can be included. The source document itself is not.

## Make a backup

For a saved browser-local case:

1. Immediately after saving in Case Studio, select **Export portable case**. If you already left Case Studio, open **Create a lesson from PDF or PowerPoint**, choose the browser-local case, and continue to **Review/export**. You do not need to import a document.
2. Select **Export portable case** in Case Studio or **Export bundle** in Lesson Builder.
3. Confirm that your browser downloaded a file ending in `.caseattend`.
4. Store the file in a location managed by your team, with access appropriate to the material.
5. Record the case ID, lesson ID, content version, review state, and release date beside the file.

Do this after every approved revision. Browser storage can disappear when site data is cleared, a private-browsing session closes, a device is replaced, or organizational browser policy removes local data.

If Case Studio says it is using memory-only storage, export before leaving the page. Memory-only work is lost when the page closes.

## Restore a `.caseattend` file

1. Open CaseAttend in the browser where you want the case stored.
2. From the home screen, select **Create a case from images**.
3. In the **Images** step, find **Import a portable case**.
4. Select **Import case** and choose one `.caseattend` file.
5. Wait while CaseAttend validates the archive and image bytes.
6. Read the import message and inspect the case before using it.

A successful import saves the exact case and linked lesson in that browser. Choose **Back to cases** to find it in the catalog, or use the final-step actions to build the lesson, open the viewer, or export another portable copy.

Imported rights and de-identification fields are package metadata, not proof that the current browser ran the current privacy screen. Review the package and your institutional requirements before teaching, editing, or redistributing it.

## If the case ID already exists

CaseAttend will not silently replace a browser-local case with the same ID.

If you are restoring a backup over a local version:

1. Export the current local version first.
2. Compare your release notes and decide which revision should remain.
3. On the home screen, use the delete control on the browser-local case card.
4. Confirm deletion only when you have a recoverable copy.
5. Return to Case Studio and import the desired `.caseattend` file.

Deleting a browser-local case removes it from that browser. CaseAttend cannot recover it unless you kept an exported copy.

If both versions should remain, give one a new Case ID through your reviewed authoring workflow rather than treating two different cases as the same version.

## Share with a colleague

Before sending a portable case:

- [ ] You are authorized to redistribute every included image.
- [ ] The required attribution and usage terms are complete.
- [ ] A person has checked the images and text for identifiers.
- [ ] The vignette and alt text do not reveal unintended information.
- [ ] The clinical-review state is truthful.
- [ ] The recipient knows that CaseAttend is for education, not diagnosis.
- [ ] The recipient knows whether further local or institutional review is required.
- [ ] You are using an approved transfer and storage method.

A technical hash is a digital fingerprint that shows whether the packaged bytes still match the recorded version. It does not prove permission, de-identification, accuracy, or clinical review.

## Use a simple release naming system

The downloaded filename is based on the Case ID. Keep a separate release folder or record so the meaning of each copy remains clear. For example:

```text
pleural-line-01/
  2026-08-28_release-notes.txt
  pleural-line-01.caseattend
```

In the release notes, record:

- case title and stable Case ID;
- lesson title, stable Lesson ID, and content version;
- case and lesson hashes shown during lesson review;
- source and license check date;
- reviewer and review scope;
- what changed; and
- who approved release to the intended audience.

Do not put identifiers in filenames or release notes.

## Test a backup without disturbing the original

Use a separate browser profile or another approved device:

1. Import the `.caseattend` file.
2. Open the case in the viewer.
3. Check the frame order, preview, descriptions, attribution, and lesson version.
4. Confirm that the expected lesson opens and validates.
5. Delete the test copy when your retention policy requires it.

This verifies that you have a usable artifact, not merely a downloaded filename.

## What is not synchronized

Moving a `.caseattend` file does not move your OpenRouter connection, chat, ordinary session records, research data, or other cases. Those are separate browser-local concerns with their own controls.

If an import fails, do not repeatedly rename or unpack the archive. Use [Troubleshooting](../help/troubleshooting.md), return to the exporting browser if available, and create a fresh export.

---

Next: [Adapt CaseAttend without code →](../adapt/no-code.md)
