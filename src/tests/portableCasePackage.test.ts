import { describe, expect, it } from 'vitest';
import { createCasePackageV1, finalizeCasePackageV1 } from '../core/casePackage';
import { getLessonPlanRef } from '../core/lessonPlan';
import {
  PORTABLE_CASE_ASSET_LIMITS,
  createPortableCaseAssetV1,
  createPortableCasePackageV1,
  decodePortableAssetBytes,
  findPortableImageMetadata,
  parsePortableAssetUri,
  validatePortableCasePackageV1,
  type PortableCaseAssetV1,
} from '../core/portableCasePackage';
import { createStarterLessonPlanV1 } from '../core/starterLesson';

const ONE_PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function onePixelPng(): Uint8Array {
  return Uint8Array.from(atob(ONE_PIXEL_PNG_BASE64), (character) => character.charCodeAt(0));
}

function pngWithChunk(type: string, content = 'patient=example'): Uint8Array {
  const png = onePixelPng();
  const iendOffset = png.length - 12;
  const text = new TextEncoder().encode(content);
  const chunk = new Uint8Array(12 + text.length);
  chunk[3] = text.length;
  chunk.set(new TextEncoder().encode(type), 4);
  chunk.set(text, 8);
  const output = new Uint8Array(png.length + chunk.length);
  output.set(png.subarray(0, iendOffset));
  output.set(chunk, iendOffset);
  output.set(png.subarray(iendOffset), iendOffset + chunk.length);
  return output;
}

function appendBytes(bytes: Uint8Array, suffix: Uint8Array): Uint8Array {
  const output = new Uint8Array(bytes.length + suffix.length);
  output.set(bytes);
  output.set(suffix, bytes.length);
  return output;
}

async function fixture() {
  const asset = await createPortableCaseAssetV1(onePixelPng());
  const teachingNotes = ['Ask for a visible description before an interpretation.'];
  const neutralDescription = 'A one-pixel synthetic teaching image used to test portability.';
  const lessonPlan = await createStarterLessonPlanV1({
    caseId: 'portable-test',
    neutralDescription,
    teachingNotes,
    sourceName: 'Example synthetic image generator',
    sourceUrl: 'https://example.edu/synthetic-image',
  });
  const casePackage = await createCasePackageV1({
    id: 'portable-test',
    title: 'Portable synthetic image',
    vignette: 'Inspect the supplied synthetic teaching image.',
    domain: 'dermatology',
    difficulty: 'introductory',
    artifact: {
      kind: 'image',
      modality: 'OT',
      seriesId: 'teaching-image',
      seriesLabel: 'Teaching image',
      src: asset.uri,
      mimeType: asset.mimeType,
      sha256: asset.sha256,
      alt: 'A one-pixel synthetic test image.',
      width: asset.width,
      height: asset.height,
    },
    preview: {
      src: asset.uri,
      mimeType: asset.mimeType,
      sha256: asset.sha256,
      alt: 'Preview of a one-pixel synthetic test image.',
      width: asset.width,
      height: asset.height,
    },
    artifactHints: {
      showWindowLevel: false,
      showSeriesSelector: false,
      showSegmentation: false,
    },
    provenance: {
      sourceName: 'Example synthetic image generator',
      sourceUrl: 'https://example.edu/synthetic-image',
      license: { name: 'CC0 1.0', spdxId: 'CC0-1.0' },
      attribution: 'Synthetic image generated for CaseAttend tests.',
      clinicianReview: { reviewed: false },
    },
    deidentification: { status: 'synthetic' },
    contentWarnings: [],
    neutralDescription,
    teachingNotes,
    lessonPlanRef: getLessonPlanRef(lessonPlan),
    presentation: {
      subtitle: 'Synthetic',
      category: 'teaching-image',
      accentColor: 'rgba(34,197,94,1)',
      accentGlow: 'rgba(34,197,94,0.15)',
      accentBorder: 'rgba(34,197,94,0.3)',
      textClass: 'text-green-400',
    },
  });
  return { asset, casePackage, lessonPlan };
}

describe('Portable Case Package v1', () => {
  it('round-trips one allowlisted, content-addressed image with exact lesson references', async () => {
    const { asset, casePackage, lessonPlan } = await fixture();
    const portablePackage = await createPortableCasePackageV1(casePackage, lessonPlan, [asset]);

    await expect(validatePortableCasePackageV1(portablePackage)).resolves.toEqual({
      valid: true,
      errors: [],
    });
    expect(portablePackage.assets[0].bytesBase64).toBe(ONE_PIXEL_PNG_BASE64);
    expect(decodePortableAssetBytes(portablePackage.assets[0])).toEqual(onePixelPng());
    expect(parsePortableAssetUri(asset.uri)).toEqual({
      sha256: asset.sha256,
      extension: 'png',
      mimeType: 'image/png',
    });
  });

  it('rejects unknown envelope and asset fields rather than exporting unrelated data', async () => {
    const { asset, casePackage, lessonPlan } = await fixture();
    const invalid = {
      schema: 'caseattend.portable-case-package',
      schemaVersion: '1.0',
      casePackage,
      lessonPlan,
      apiKey: 'must-not-export',
      assets: [{ ...asset, chatHistory: ['must-not-export'] }],
    };

    const result = await validatePortableCasePackageV1(invalid);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'portablePackage.apiKey is not valid in Portable Case Package v1.',
    );
    expect(result.errors).toContain(
      'portablePackage.assets[0].chatHistory is not valid in Portable Case Package v1.',
    );
  });

  it('rejects noncanonical URIs, malformed base64, and byte-integrity mismatches', async () => {
    const { asset, casePackage, lessonPlan } = await fixture();
    const invalidAsset: PortableCaseAssetV1 = {
      ...asset,
      uri: `${asset.uri}?download=1`,
      bytesBase64: `${asset.bytesBase64}\n`,
    };
    const invalid = {
      schema: 'caseattend.portable-case-package',
      schemaVersion: '1.0',
      casePackage,
      lessonPlan,
      assets: [invalidAsset],
    };

    const result = await validatePortableCasePackageV1(invalid);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'portablePackage.assets[0].uri must exactly match case://assets/<sha256>.<jpg|png|webp>.',
    );
    expect(result.errors).toContain(
      'portablePackage.assets[0].bytesBase64 must be standard padded base64 without whitespace.',
    );
    expect(result.errors).toContain(
      'casePackage.artifact.src has no matching entry in portablePackage.assets.',
    );
  });

  it('requires preview metadata and asset metadata to match the referenced artifact exactly', async () => {
    const { asset, casePackage, lessonPlan } = await fixture();
    const { manifest: _manifest, ...draft } = casePackage;
    const mismatchedCase = await finalizeCasePackageV1({
      ...draft,
      preview: { ...draft.preview, width: 2 },
    });
    const invalid = {
      schema: 'caseattend.portable-case-package',
      schemaVersion: '1.0',
      casePackage: mismatchedCase,
      lessonPlan,
      assets: [asset],
    };

    const result = await validatePortableCasePackageV1(invalid);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      `casePackage.preview must exactly match the other Case Package reference to ${asset.uri}.`,
    );
    expect(result.errors).toContain(
      'casePackage.preview must exactly match its portablePackage.assets entry.',
    );
  });

  it('rejects a stale exact Lesson Plan reference even when both documents are otherwise valid', async () => {
    const { asset, casePackage, lessonPlan } = await fixture();
    const changedLesson = await createStarterLessonPlanV1({
      caseId: 'portable-test',
      neutralDescription: lessonPlan.neutralDescription,
      teachingNotes: ['A changed teaching note makes a new exact lesson revision.'],
      sourceName: 'Example synthetic image generator',
      sourceUrl: 'https://example.edu/synthetic-image',
    });
    const invalid = {
      schema: 'caseattend.portable-case-package',
      schemaVersion: '1.0',
      casePackage,
      lessonPlan: changedLesson,
      assets: [asset],
    };

    const result = await validatePortableCasePackageV1(invalid);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'portablePackage: bundle.casePackage.lessonPlanRef must match the exact bundled Lesson Plan manifest.',
    );
  });

  it('rejects presentation strings that could inject classes or CSS through an archive', async () => {
    const { asset, casePackage, lessonPlan } = await fixture();
    const portable = await createPortableCasePackageV1(casePackage, lessonPlan, [asset]);
    const hostile = structuredClone(portable);
    hostile.casePackage.presentation.textClass = 'text-green-400 hidden fixed inset-0';
    hostile.casePackage.presentation.accentGlow = 'rgba(0,0,0,0.2);background:url(https://example.test)';
    hostile.casePackage.presentation.accentBorder = 'rgba(999,0,0,1)';

    const result = await validatePortableCasePackageV1(hostile);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'portablePackage.casePackage.presentation.textClass must be one approved CaseAttend color class.',
    );
    expect(result.errors).toContain(
      'portablePackage.casePackage.presentation.accentGlow must be one strict rgba(r,g,b,a) color with RGB values from 0 to 255 and alpha from 0 to 1.',
    );
    expect(result.errors).toContain(
      'portablePackage.casePackage.presentation.accentBorder must be one strict rgba(r,g,b,a) color with RGB values from 0 to 255 and alpha from 0 to 1.',
    );
  });

  it('rejects embedded identifier-bearing metadata containers before packaging', async () => {
    const png = pngWithChunk('tEXt');
    expect(findPortableImageMetadata(png, 'image/png')).toEqual(['PNG text (tEXt)']);
    await expect(createPortableCaseAssetV1(png)).rejects.toThrow(
      'Asset contains embedded metadata that must be removed before packaging: PNG text (tEXt)',
    );

    const jpeg = Uint8Array.from([
      0xff, 0xd8,
      0xff, 0xe1, 0x00, 0x08,
      0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
      0xff, 0xed, 0x00, 0x04, 0x50, 0x48,
      0xff, 0xfe, 0x00, 0x04, 0x50, 0x48,
      0xff, 0xd9,
    ]);
    expect(findPortableImageMetadata(jpeg, 'image/jpeg')).toEqual([
      'JPEG EXIF or XMP (APP1)',
      'JPEG IPTC (APP13)',
      'JPEG comment',
    ]);

    const webp = Uint8Array.from([
      0x52, 0x49, 0x46, 0x46, 0x16, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50,
      0x45, 0x58, 0x49, 0x46, 0x00, 0x00, 0x00, 0x00,
      0x58, 0x4d, 0x50, 0x20, 0x01, 0x00, 0x00, 0x00,
      0x78, 0x00,
    ]);
    expect(findPortableImageMetadata(webp, 'image/webp')).toEqual(['WebP EXIF', 'WebP XMP']);

    expect(findPortableImageMetadata(pngWithChunk('iTXt'), 'image/png'))
      .toEqual(['PNG international text (iTXt)']);
    expect(findPortableImageMetadata(pngWithChunk('zTXt'), 'image/png'))
      .toEqual(['PNG compressed text (zTXt)']);
    expect(findPortableImageMetadata(pngWithChunk('eXIf'), 'image/png'))
      .toEqual(['PNG EXIF (eXIf)']);
    expect(findPortableImageMetadata(pngWithChunk('rNDm'), 'image/png'))
      .toEqual(['PNG unsupported ancillary or container chunk (rNDm)']);
  });

  it('rejects ICC hidden-data containers across JPEG, PNG, and WebP', () => {
    const jpeg = Uint8Array.from([
      0xff, 0xd8,
      0xff, 0xe2, 0x00, 0x10,
      0x49, 0x43, 0x43, 0x5f, 0x50, 0x52, 0x4f, 0x46, 0x49, 0x4c, 0x45, 0x00,
      0x01, 0x01,
      0xff, 0xd9,
    ]);
    const png = pngWithChunk('iCCP', 'profile\0\0identifier');
    const webp = Uint8Array.from([
      0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50,
      0x49, 0x43, 0x43, 0x50, 0x04, 0x00, 0x00, 0x00,
      0x50, 0x48, 0x49, 0x00,
    ]);

    expect(findPortableImageMetadata(jpeg, 'image/jpeg')).toEqual(['JPEG ICC profile (APP2)']);
    expect(findPortableImageMetadata(png, 'image/png')).toEqual(['PNG ICC profile (iCCP)']);
    expect(findPortableImageMetadata(webp, 'image/webp')).toEqual(['WebP ICC profile']);
  });

  it('rejects bytes trailing the exact JPEG, PNG, and WebP container ends', async () => {
    const hiddenText = new TextEncoder().encode('patient=example');
    const jpeg = appendBytes(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]), hiddenText);
    const png = appendBytes(onePixelPng(), hiddenText);
    const webp = appendBytes(Uint8Array.from([
      0x52, 0x49, 0x46, 0x46, 0x0c, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50,
      0x56, 0x50, 0x38, 0x20, 0x00, 0x00, 0x00, 0x00,
    ]), hiddenText);

    expect(findPortableImageMetadata(jpeg, 'image/jpeg')).toContain('JPEG trailing bytes after EOI');
    expect(findPortableImageMetadata(png, 'image/png')).toContain('PNG trailing bytes after IEND');
    expect(findPortableImageMetadata(webp, 'image/webp'))
      .toContain('WebP RIFF size does not match the file length');
    await expect(createPortableCaseAssetV1(jpeg)).rejects.toThrow('JPEG trailing bytes after EOI');
    await expect(createPortableCaseAssetV1(png)).rejects.toThrow('PNG trailing bytes after IEND');
    await expect(createPortableCaseAssetV1(webp)).rejects.toThrow(
      'WebP RIFF size does not match the file length',
    );
  });

  it('uses mobile-safe per-image limits and caps total referenced stack pixels', async () => {
    expect(PORTABLE_CASE_ASSET_LIMITS).toMatchObject({
      maxTotalBytes: 96 * 1024 * 1024,
      maxWidth: 8_192,
      maxHeight: 8_192,
      maxPixels: 16_000_000,
      maxTotalPixels: 64_000_000,
    });
    const { asset, casePackage, lessonPlan } = await fixture();
    const { manifest: _manifest, ...draft } = casePackage;
    const oversizedStack = await finalizeCasePackageV1({
      ...draft,
      artifact: {
        kind: 'image-stack',
        series: [{
          id: 'oversized-stack',
          label: 'Oversized stack',
          modality: 'OT',
          frames: Array.from({ length: 8 }, (_, index) => ({
            id: `frame-${index + 1}`,
            src: asset.uri,
            mimeType: asset.mimeType,
            sha256: asset.sha256,
            alt: `Neutral frame ${index + 1}.`,
            width: 3_000,
            height: 3_000,
          })),
        }],
      },
    });

    const result = await validatePortableCasePackageV1({
      schema: 'caseattend.portable-case-package',
      schemaVersion: '1.0',
      casePackage: oversizedStack,
      lessonPlan,
      assets: [asset],
    });

    expect(result.errors).toContain(
      'casePackage.artifact exceeds the 64000000-pixel total stack limit. Resize images or use a smaller stack.',
    );
  });
});
