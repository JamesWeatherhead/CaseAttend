# Open case source policy

This policy governs candidate sources for the CaseAttend teaching catalog. It
applies to images, waveforms, diagrams, tables, video frames, source text, and
datasets. It does not replace clinical review, de-identification review, or the
Case Package v1 integrity checks.

The central rule is simple:

> A source must grant the rights CaseAttend needs at the level of the exact
> artifact being distributed.

Publicly visible, free to download, open access, educational, or hosted by a
trusted institution are not licenses.

## Scope

Issue [#53](https://github.com/JamesWeatherhead/CaseAttend/issues/53) targets
120 original case lessons across foundational science, clerkships, ECG, POCUS,
visual diagnosis, and allied health. This policy defines which source materials
can enter that catalog.

The original lesson vignettes, objectives, hints, and rubrics will be written
for CaseAttend. They must not reproduce commercial question-bank stems or
proprietary teaching material.

## Two independent gates

A candidate has to pass both gates before it becomes selectable.

### 1. Source eligibility

The exact artifact has a stable source record and explicit terms that permit
CaseAttend to copy, modify when needed, redistribute, and display it.

A source record must include:

- canonical source page
- direct asset or dataset file reference
- creator or content provider
- exact license name
- license or rights-evidence URL
- required attribution
- source version or retrieval date
- any use restrictions, notices, or sensitive-use requirements
- source eligibility decision and decision date

### 2. Educational approval

The lesson is clinically accurate, appropriately scoped, accessible, and safe
to teach. Source eligibility does not establish any of these.

The lesson must separately record:

- clinician review status
- reviewer and credentials when reviewed
- review date
- de-identification status
- neutral accessible description
- answer-revealing teaching notes
- authoritative clinical citations
- content warnings

A public-domain clinical image remains unreviewed and not de-identified until
those claims are supported by recorded evidence.

## License classes

### Core catalog

The preferred core uses:

- CC0 1.0 Universal
- works explicitly marked with the Public Domain Mark
- U.S. federal works whose exact source record says public domain,
  copyright-free, or free of copyright restrictions

Public domain and CC0 are not identical legal mechanisms. CaseAttend records
the exact label supplied by the source instead of rewriting both as CC0.

### Open with obligations

These licenses can be eligible when their item-level obligations are captured:

- CC BY 3.0 or 4.0
- CC BY-SA 3.0 or 4.0
- another license that clearly permits copying, modification, redistribution,
  and commercial use

These works are not counted as CC0 or public domain. Attribution and
ShareAlike obligations remain attached to the artifact and must be surfaced in
the Case Package.

### Excluded from the distributable catalog

Do not bundle material under:

- any NonCommercial license
- any NoDerivatives license
- all-rights-reserved terms
- educational-use-only terms
- fair-use-only reasoning
- permission that applies only to a specific person or institution
- a source with no explicit rights statement
- a repository or journal license that does not cover the exact artifact
- terms that prohibit the project's commercial dual-license path

A link may still be cited as a clinical reference if its text is not copied and
the citation is otherwise appropriate.

## Source profiles

These profiles are starting rules. The item-level record always wins.

| Source | Default decision | Evidence and cautions |
| --- | --- | --- |
| [CDC Public Health Image Library](https://wwwn.cdc.gov/phil/) | Eligible only when the item says public domain | The [PHIL FAQ](https://wwwn.cdc.gov/PHIL/FAQ.aspx) says records identify Public Domain or Copyright Protected status. Save the exact item page. Credit CDC and the named contributor. Follow any sensitive-use notice. |
| [CDC agency materials](https://www.cdc.gov/other/agencymaterials.html) | Item review required | The policy describes PHIL reuse but warns that other CDC images may be licensed from third parties. |
| [CDC Emerging Infectious Diseases](https://wwwnc.cdc.gov/eid/page/copyright-and-disclaimers) | Generally public domain, with figure-level review | The journal states that its text, figures, tables, and photographs are public domain. Still inspect credits and notices attached to the exact figure. |
| [National Cancer Institute](https://www.cancer.gov/policies/copyright-reuse) | Eligible when the exact graphic is credited to NCI or marked copyright-free | NCI text is generally reusable. NCI graphics are a mix of copyright-free and third-party works. Record the individual asset page and credit. |
| [NCI Visuals Online](https://visualsonline.cancer.gov/) | Item review required | Use the exact asset record. Do not infer rights from the collection landing page. |
| [OpenNeuro](https://openneuro.org/) | Versioned published datasets can be CC0 | Save the exact dataset version and its license statement. Track the exact file used and any transformation. A CC0 dataset still needs separate privacy and clinical review. |
| [National Library of Medicine historical collections](https://www.nlm.nih.gov/hmd/collections/photos.html) | Item review required | Many U.S. government and historical works are public domain, but the collection contains mixed rights. Record the item-level rights statement and bibliographic source. |
| [Wikimedia Commons](https://commons.wikimedia.org/) | Eligible only from the individual file page | Record the file revision, creator, source, exact license template, and attribution. The category or host does not establish rights. Avoid files with disputed, incomplete, or country-dependent status. |
| [PubMed Central](https://pmc.ncbi.nlm.nih.gov/about/copyright/) | No collection-wide approval | PMC warns that open-access and even public-domain articles may contain third-party figures. Review the article license and the exact figure credit. |
| [Open-i](https://openi.nlm.nih.gov/faq) | No collection-wide approval | Open-i says copyright remains with the authors or journal. Use only when the exact source license independently permits redistribution. |
| [NCBI Bookshelf](https://www.ncbi.nlm.nih.gov/sites/books/NBK45610/) | Item and figure review required | Bookshelf says each book and figure may have different rights. A U.S. government book can still contain third-party figures. |
| [PhysioNet](https://physionet.org/) | Dataset-specific review required | Licenses vary by dataset. Record the dataset version and license. Credentialed, NonCommercial, or no-redistribution datasets are not eligible for bundling. |
| [NIGMS Image and Video Gallery](https://www.nigms.nih.gov/image-gallery) | Excluded from the distributable catalog | The gallery is licensed CC BY-NC-SA 3.0. The NonCommercial restriction conflicts with unrestricted redistribution and CaseAttend's commercial-license path. |
| [NIMH](https://www.nimh.nih.gov/site-info/policies) | Text can support original lessons; website images are excluded | NIMH says its information is public domain but its website images may not be reused. |
| Radiopaedia, DermNet, NEJM, commercial atlases, and question banks | Excluded unless a specific artifact has a separate qualifying license | Access for reading or education does not grant redistribution rights. Do not copy cases, questions, answer explanations, or images. |

## Item-level evidence record

Candidate manifests should use a record equivalent to:

```json
{
  "sourceUrl": "https://example.gov/item/123",
  "assetUrl": "https://example.gov/item/123/download",
  "creator": "Named creator or agency",
  "license": {
    "name": "Public domain",
    "evidenceUrl": "https://example.gov/item/123",
    "spdxId": null
  },
  "attribution": "Source and creator credit",
  "sourceVersion": "item revision or dataset version",
  "retrievedAt": "YYYY-MM-DD",
  "eligibility": {
    "status": "eligible",
    "basis": "Item record explicitly states public domain",
    "reviewedBy": "source auditor",
    "reviewedAt": "YYYY-MM-DD"
  },
  "restrictions": [],
  "transforms": []
}
```

Allowed eligibility states are:

- `candidate`
- `eligible`
- `excluded`
- `needs-rights-review`
- `withdrawn`

A candidate or ambiguous record cannot enter the built-in asset registry.

## Promotion workflow

1. Write an original lesson seed and assign a stable ID.
2. Save the authoritative clinical references.
3. Identify the exact artifact and its item-level rights evidence.
4. Record the source eligibility decision.
5. Download the exact bytes and verify MIME type and image decoding.
6. Remove ordinary raster metadata when permitted and record the transform.
7. Review privacy, burned-in text, faces, and other identifying content.
8. Write neutral accessibility text without revealing the diagnosis.
9. Obtain specialty review before marking clinical content reviewed.
10. Record the asset SHA-256 and generate deterministic Case Package and Lesson
    Plan hashes.
11. Run registry, reference, accessibility, and build checks.
12. Publish through a focused content-pack PR.

## Human subjects and sensitive images

Do not use recognizable people merely because a photograph is public domain.
Record model-release or source-context evidence when relevant. Avoid using an
identifiable person to imply a diagnosis or sensitive condition that the source
does not establish. Follow PHIL sensitive-use requirements.

Public-domain status does not establish HIPAA de-identification, consent,
ethical suitability, or freedom from publicity and privacy concerns.

## Derivatives and provenance

Every transform must remain traceable to the original bytes. Record operations
such as:

- crop
- rotation
- color or contrast adjustment
- annotation removal
- raster re-encoding
- conversion from waveform data to an image
- extraction of a frame from a video or volumetric dataset
- creation of a teaching overlay

Hash both the distributable artifact and, when retained, the original source
artifact. Do not use a transform to hide uncertain provenance.

## Revalidation and withdrawal

Source pages, licenses, or upstream files can change. A release audit should
check that:

- the rights-evidence URL still resolves
- the item still carries the recorded license
- attribution remains complete
- the upstream asset has not been withdrawn or corrected
- CaseAttend's stored bytes still match the recorded digest

If rights become uncertain, mark the source `withdrawn`, remove it from the
published catalog, and keep the decision history. Do not silently substitute a
different image under the same case or manifest identity.
