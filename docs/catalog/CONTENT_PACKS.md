# Built-in content packs

Content Packs add many image cases without maintaining separate case, lesson,
objective, hint, rubric, and digest registries. One typed record produces one
Case Package v1 and one exactly bound Lesson Plan v1.

The builder always:

- uses the declared SHA-256 digest for the artifact and preview
- finalizes fresh case and lesson manifests through the v1 validators
- records case and lesson clinical review as `reviewed: false`
- records deidentification as `not-reviewed` with the supplied note
- requires neutral image alt text and three or more objectives
- creates stable objective IDs, allowed hints, and rubric criteria
- keeps artifact provenance separate from clinical teaching citations
- requires at least one clinical teaching citation for each case
- requires an item-level license evidence URL in addition to the license deed
- leaves the fixed public medical safety policy unchanged

## Add a pack

1. Put exact downloaded bytes under `public/images/<pack-id>/`.
2. Compute each digest with `sha256sum public/images/<pack-id>/<file>`.
3. Create a typed file next to `src/data/builtinContentPacks.ts`.
4. Import the definition and add it to `BUILTIN_CONTENT_PACKS`.
5. Run `npm test` and `npm run build`.

The registry test reads every registered local image and compares its bytes with
the digest declared in the pack. A missing file or stale digest fails CI.

```ts
import {
  CONTENT_PACK_SCHEMA,
  CONTENT_PACK_SCHEMA_VERSION,
  defineContentPack,
} from './contentPack';

export const examplePack = defineContentPack({
  schema: CONTENT_PACK_SCHEMA,
  schemaVersion: CONTENT_PACK_SCHEMA_VERSION,
  id: 'example-open-pack',
  title: 'Example open image lessons',
  contentVersion: '1.0.0',
  cases: [
    {
      id: 'example-chest-image',
      title: 'Adult with a fictional respiratory vignette',
      vignette: 'A fictional teaching vignette with no patient identifiers.',
      domain: 'radiology',
      difficulty: 'introductory',
      image: {
        src: '/images/example-open-pack/example.jpg',
        mimeType: 'image/jpeg',
        sha256: '<lowercase SHA-256 of exact bytes>',
        alt: 'Frontal grayscale chest radiograph showing the thorax.',
        modality: 'CR',
        seriesLabel: 'Frontal chest radiograph',
      },
      provenance: {
        sourceName: 'Exact source record name',
        sourceUrl: 'https://example.org/exact-item-record',
        licenseEvidenceUrl: 'https://example.org/exact-item-record#license',
        attribution: 'Attribution required by the item record',
        license: {
          name: 'CC0 1.0 Universal',
          spdxId: 'CC0-1.0',
          url: 'https://creativecommons.org/publicdomain/zero/1.0/',
        },
      },
      contentWarnings: ['Medical imaging'],
      neutralDescription: 'Frontal grayscale chest radiograph showing the thorax.',
      teachingNotes: ['Draft teaching note pending specialist review.'],
      deidentificationNotes: 'Public teaching asset. Independent review is not recorded.',
      presentation: {
        subtitle: 'Chest radiograph',
        category: 'xray',
        accentColor: 'rgba(34,197,94,1)',
        accentGlow: 'rgba(34,197,94,0.15)',
        accentBorder: 'rgba(34,197,94,0.3)',
        textClass: 'text-green-400',
      },
      lesson: {
        objectives: [
          'Describe the visible finding using neutral language.',
          'Compare the finding with the expected normal appearance.',
          'Connect visible evidence with the fictional vignette.',
        ],
        clinicalCitations: [
          {
            id: 'clinical-source',
            title: 'Clinical teaching reference',
            url: 'https://example.org/clinical-reference',
          },
        ],
      },
    },
  ],
});
```

Plain objective strings receive deterministic IDs such as `objective-1`.
Use an object with an explicit `id`, `hint`, or `observableEvidence` only when a
lesson needs a stable override. No second map keyed by case ID is required.
