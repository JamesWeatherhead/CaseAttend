// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { listBuiltinCasePackages } from '../data/caseRegistry';
import { LIBRARY_THUMBNAILS } from '../data/libraryThumbnails.generated';

const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const publicFile = (src: string) => new URL(`../../public${src}`, import.meta.url);

describe('shipped library display thumbnails', () => {
  it('binds every display image to the current source, preserves framing and attribution, and meets the transfer budget', async () => {
    const cases = await listBuiltinCasePackages();
    const notice = JSON.parse(await readFile(publicFile('/thumbnails/library/NOTICE.json'), 'utf8'));
    const credits = await readFile(publicFile('/image-credits.html'), 'utf8');
    expect(Object.keys(LIBRARY_THUMBNAILS).sort()).toEqual(cases.map(c => c.preview.src).sort());
    expect(notice.records).toHaveLength(cases.length);
    expect(credits.match(/<li id=/g)).toHaveLength(cases.length);
    let firstBatchSource = 0;
    let firstBatchThumbnails = 0;
    let allSource = 0;
    let allThumbnails = 0;

    for (const [index, casePackage] of cases.entries()) {
      const thumbnail = LIBRARY_THUMBNAILS[casePackage.preview.src as keyof typeof LIBRARY_THUMBNAILS];
      const record = notice.records.find((entry: { caseId: string }) => entry.caseId === casePackage.id);
      const [source, image] = await Promise.all([
        readFile(publicFile(casePackage.preview.src)), readFile(publicFile(thumbnail.src)),
      ]);
      expect(digest(source), casePackage.id).toBe(casePackage.preview.sha256);
      expect(thumbnail.sourceSha256).toBe(casePackage.preview.sha256);
      expect(record.source).toEqual({ src: casePackage.preview.src, sha256: digest(source), bytes: source.length });
      expect(record.thumbnail).toEqual({ src: thumbnail.src, sha256: digest(image), bytes: image.length, width: thumbnail.width, height: thumbnail.height });
      expect(thumbnail.src).toContain(digest(image).slice(0, 16));
      expect(record.attribution).toBe(casePackage.provenance.attribution);
      expect(record.title).toBe(casePackage.title);
      expect(credits).toContain(`id="${casePackage.id}"`);
      expect(record.license).toEqual(casePackage.provenance.license);
      expect(record.sourceUrl).toBe(casePackage.provenance.sourceUrl);

      const [original, result] = await Promise.all([sharp(source).metadata(), sharp(image).metadata()]);
      const oriented = original.autoOrient;
      expect(result.format).toBe('webp');
      expect(result.pages ?? 1).toBe(1);
      expect(result.width).toBe(thumbnail.width);
      expect(result.height).toBe(thumbnail.height);
      expect(result.width).toBeLessThanOrEqual(Math.min(960, oriented.width));
      expect(result.height).toBeLessThanOrEqual(Math.min(400, oriented.height));
      const scale = Math.min(960 / oriented.width, 400 / oriented.height, 1);
      expect(Math.abs(result.width - oriented.width * scale)).toBeLessThanOrEqual(1);
      expect(Math.abs(result.height - oriented.height * scale)).toBeLessThanOrEqual(1);
      expect(result.exif).toBeUndefined();
      expect(result.xmp).toBeUndefined();
      expect(result.icc).toBeUndefined();
      allSource += source.length;
      allThumbnails += image.length;
      if (index < 12) { firstBatchSource += source.length; firstBatchThumbnails += image.length; }
    }
    const files = await readdir(publicFile('/thumbnails/library/'));
    expect(files.filter(name => name.endsWith('.webp'))).toHaveLength(cases.length);
    expect(firstBatchThumbnails).toBeLessThan(250_000);
    expect(firstBatchThumbnails / firstBatchSource).toBeLessThan(0.1);
    expect(allThumbnails / allSource).toBeLessThan(0.1);
  });
});
