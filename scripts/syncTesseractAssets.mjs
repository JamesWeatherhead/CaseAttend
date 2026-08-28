import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(repositoryRoot, 'public', 'vendor');

const copies = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'tesseract/worker.min.js'],
  ['node_modules/tesseract.js/LICENSE.md', 'tesseract/LICENSE.md'],
  ['node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'tessdata/eng.traineddata.gz'],
  ['node_modules/tesseract.js-core/LICENSE', 'tessdata/UPSTREAM-LICENSE-APACHE-2.0'],
  ['node_modules/tesseract.js-core/tesseract-core.wasm.js', 'tesseract-core/tesseract-core.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core/tesseract-core-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd.wasm.js', 'tesseract-core/tesseract-core-simd.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core/tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-relaxedsimd.wasm.js', 'tesseract-core/tesseract-core-relaxedsimd.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js', 'tesseract-core/tesseract-core-relaxedsimd-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/LICENSE', 'tesseract-core/LICENSE'],
  ['node_modules/fflate/LICENSE', 'fflate/LICENSE'],
  ['node_modules/pdfjs-dist/LICENSE', 'pdfjs/LICENSE'],
];

// public/vendor is generated only from the pinned allowlist above. Recreate it
// from nothing so stale executables, root-level files, or old model data cannot
// hitchhike into a later production build.
await rm(publicRoot, { recursive: true, force: true });

for (const [source, target] of copies) {
  const sourcePath = path.join(repositoryRoot, source);
  const targetPath = path.join(publicRoot, target);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await copyFile(sourcePath, targetPath);
}

await writeFile(
  path.join(publicRoot, 'NOTICE.txt'),
  [
    'CaseAttend browser-local document and OCR assets',
    '',
    'Tesseract.js and tesseract.js-core are licensed under Apache-2.0.',
    'The English trained-data npm package declares MIT; its upstream tessdata repository publishes under Apache-2.0.',
    'The upstream Apache-2.0 text is included beside the trained data.',
    'fflate is licensed under the MIT license; its license text is included under vendor/fflate.',
    'PDF.js is licensed under Apache-2.0; its license text is included under vendor/pdfjs.',
    'Source and package details are recorded in THIRD_PARTY_NOTICES.md.',
    '',
  ].join('\n'),
  'utf8',
);
