# Adapt CaseAttend without code

[← Documentation home](../README.md)

You can adapt CaseAttend's teaching content without changing the application. The two browser tools do different jobs:

- **Case Studio** changes the visual case, vignette, descriptions, provenance, privacy attestation, and image order.
- **Lesson Builder** changes the audience, objectives, evidence, tutoring path, answer notes, sources, review state, and lesson version.

This guide covers safe ways to reuse those tools while preserving a clear history.

## Choose the smallest adaptation that meets the need

| You want to change… | Use… | What should remain stable? |
| --- | --- | --- |
| Objectives, hints, audience, or teaching notes for the same visual | Lesson Builder | Case identity and artifact provenance |
| Image, vignette, image order, source, license, or privacy attestation | Case Studio | Nothing unless it is truly the same case |
| Starting text from an existing handout or deck | **Import PDF or PowerPoint** in Lesson Builder | Selected Case Package; source document stays outside the export |
| The public site's brand, deployment, or application behavior | A code or hosting workflow | Versioned teaching content and safety boundary |

When in doubt, make a new ID rather than silently changing what an existing ID means.

## Recipe 1: Teach the same case to a different audience

1. Export a backup of the current browser-local case, if applicable.
2. From the home screen, select **Create a lesson from PDF or PowerPoint**. Import is optional.
3. Choose the existing Case Package.
4. Give the adaptation a distinct Lesson ID if it has a different teaching purpose, or keep the ID and increase the version if it is the next revision of the same lesson.
5. Select the intended learner levels.
6. Rewrite prerequisites, objective language, hints, and tutor instructions for that audience.
7. Keep the neutral case description answer-safe.
8. Review sources and clinical-review state again.
9. Validate, rehearse at the target level, and export.

Changing a learner-level checkbox alone is not a complete adaptation. A resident lesson and a high-school lesson usually need different prerequisites, vocabulary, evidence expectations, and stopping behavior.

## Recipe 2: Use a built-in visual for a new objective

1. Select **Create a lesson from PDF or PowerPoint**. Build manually for this recipe.
2. Choose a built-in Case Package.
3. Create a new stable Lesson ID and title.
4. Replace the default objective with the new learning destination.
5. Write new evidence, hints, escalation, stopping conditions, and answer notes.
6. Add clinical-teaching sources for the new claims.
7. Leave clinical review off until the new lesson itself has been reviewed.
8. Export the JSON bundle and retain it with release notes.

The built-in image does not become yours to redistribute merely because you wrote a new lesson. Keep the recorded provenance and license distinctions intact.

## Recipe 3: Adapt a colleague's portable case

1. Receive the `.caseattend` file through an approved channel.
2. In **Create a case from images**, select **Import case**.
3. Export an unchanged backup immediately so you can return to the received revision.
4. Review the image, frame order, source, terms, attribution, and attestation. Imported metadata is not a fresh privacy determination.
5. Choose **Build the lesson**.
6. Decide whether this is:
   - a revision of the same lesson, which keeps the Lesson ID and increases its version; or
   - a different lesson, which gets a new Lesson ID.
7. Edit, validate, rehearse, and export a new portable copy.
8. Record what changed and who reviewed the adaptation.

A browser-local case links to one exact lesson revision at a time. Saving a new lesson revision updates that link. Keep the earlier `.caseattend` export if you need to reproduce the earlier teaching condition.

## Recipe 4: Make a true case variant

Use a new Case ID when the visual, answer, provenance, privacy statement, or learner-facing scenario changes in a way that could make the old identity misleading.

For an imported case:

1. Keep an unchanged export.
2. Move back through Case Studio and change the Case ID and title.
3. Make the intended image or description changes.
4. Recheck source and usage rights for the variant.
5. Run privacy screening again after image changes.
6. Complete a new human review and truthful attestation.
7. Save, build the lesson, and export under the new identity.

Do not call a changed image “version 2” solely to avoid redoing rights, privacy, provenance, accessibility, and clinical review. Those checks belong to the actual material.

## Recipe 5: Start from a faculty PDF or PowerPoint

1. Choose the visual Case Package in Lesson Builder.
2. Use **Import PDF or PowerPoint** with one `.pdf` or `.pptx` file.
3. Review the extracted text preview.
4. Select **Apply imported draft** only when the draft is useful.
5. Remove identifiers, logistics, repeated text, and unrelated material.
6. Rewrite headings as observable objectives and build a gradual hint path.
7. Verify URLs and DOIs yourself.
8. Complete the normal source and clinical-review steps.

The raw document is not stored or exported. The text you choose to apply becomes editable lesson content. Pages and slides do not become images. For scans and other limits, see [Import PDF or PowerPoint text](../guides/import-pdf-powerpoint.md).

## Recipe 6: Translate or localize a lesson

CaseAttend does not certify translations. Treat localization as a content revision:

1. Export the original revision.
2. Use a distinct Lesson ID or a clearly documented new version.
3. Translate all learner-facing and tutor-path fields consistently.
4. Check that examples, vocabulary, learner levels, and sources fit the audience.
5. Review accessible descriptions and content warnings.
6. Have appropriate subject-matter and language reviewers check the final lesson.
7. Rehearse realistic learner responses in the target language before release.

Do not assume a model will compensate for a partially translated plan.

## Preserve what CaseAttend fixes

Lesson Builder separates two kinds of prompt content:

- **Fixed by CaseAttend:** the public safety policy, which the visual builder does not let an educator rewrite.
- **Educator controlled:** your objectives, hints, instructions, answer notes, and related lesson content.

Read the prompt preview during validation. Educator fields should teach the case; they should not pretend to override the fixed policy or present themselves as system instructions.

## Keep an adaptation record

For every release, record:

- original case and lesson IDs;
- new case and lesson IDs, if any;
- previous and new lesson versions;
- exact case and lesson hashes;
- the reason for the adaptation;
- changed fields;
- source and rights checks;
- privacy review;
- clinical content review; and
- rehearsal results.

The [lesson-planning worksheet](../templates/lesson-planning-worksheet.md) includes space for this record.

## What requires a technical path

The no-code builders do not add new artifact formats, import raw DICOM, alter the fixed safety policy, change application branding, create a different storage service, or integrate CaseAttend into another product.

For those goals, use the appropriate path:

- [Host CaseAttend on Cloudflare Pages](self-host-cloudflare.md)
- [Adapt CaseAttend with the SDK](sdk.md)
- [SDK reference](../sdk/README.md)
- [Contributing guide](../../CONTRIBUTING.md)

If all you need is a new image case or teaching path, stay with Case Studio and Lesson Builder. The portable files and explicit versions make that route easier for colleagues to inspect and reproduce.

---

Next: [Share, back up, and restore →](../guides/share-back-up-and-restore.md)
