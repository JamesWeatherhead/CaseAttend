# Library image performance

Case cards now use small display thumbnails instead of downloading full teaching images. The first 12 images total **171,362 bytes**, down from **8,918,184 bytes** (98.1% smaller). Across all 48 cases, the corresponding totals are **1,110,078 bytes** and **31,485,948 bytes** (96.5% smaller). These are image-byte measurements, not claims about total page-load time or JavaScript size.

The layout and case-opening behavior are unchanged. Cards retain the complete image framing and accessible descriptions. A matching canonical source path and SHA-256 are required to use a thumbnail; a failed request falls back once to the original, then a readable placeholder. Browser-local images continue through the existing verified asset store.

## Reproduce and extend

Run `npm ci` and `npm run thumbnails:generate` after adding or updating built-in cases. The generator uses `listBuiltinCasePackages()` as the inventory and checks source bytes against each package's declared digest. It writes `src/data/libraryThumbnails.generated.ts`, the dedicated `public/thumbnails/library/` directory, and `public/image-credits.html`.

The pinned Sharp encoder creates WebP previews within 960 × 400 pixels, preserving aspect ratio without enlargement or cropping. It normalizes orientation and converts to sRGB before stripping metadata. The resize and color behavior follow [Sharp's resize documentation](https://sharp.pixelplumbing.com/api-resize/) and [ICC profile documentation](https://sharp.pixelplumbing.com/api-output/#withiccprofile). Canonical teaching images, CasePackage hashes, lesson references, and reviewed starter-answer caches are not rewritten. Viewer rendering, tutor capture, and export continue to use the canonical assets.

`NOTICE.json` records full source/output hashes, sizes, dimensions, encoder versions, attribution, and licenses. The human-readable **Image credits** page links from the site footer. Content hashes in thumbnail filenames prevent mixing different generations; Cloudflare caches the derivatives for a week.

## Validation

All 48 originals matched their declared hashes. Repeated generation produced identical thumbnail bytes. Asset checks verify coverage, decoding, single-frame WebP output, framing, no enlargement, metadata removal, attribution, and transfer budgets. Component checks cover mismatched hashes, missing thumbnails, failed original fallback, local resolution failure, stale local results, and changed-source resets.

Browser checks covered desktop and phone cards, all 12 initial thumbnail references, case opening, and the credits page at phone width. The full suite passed 510 tests across 71 files, with type checking and a production build also required before publication.

Further work toward the platform goal includes deferring the learner/research code until needed, durable case links and sign-in return context, clearer educator setup with draft preservation, and expanding the reviewed open teaching catalog. This update reduces image transfer; it does not claim those broader requirements are complete.
