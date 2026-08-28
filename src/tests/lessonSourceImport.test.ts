// @vitest-environment jsdom

import { strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  importLessonSource,
  LESSON_SOURCE_LIMITS,
  LessonSourceImportError,
} from '../services/lessonSourceImport';

const POWERPOINT_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const PRESENTATION_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml';

function bytesBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function slideXml(lines: readonly string[], hidden: boolean | 'false' = false, hiddenShapeText?: string): string {
  const paragraphs = lines.map((line) => `<a:p><a:r><a:t>${line}</a:t></a:r></a:p>`).join('');
  const hiddenShape = hiddenShapeText
    ? `<p:sp><p:nvSpPr><p:cNvPr id="99" name="hidden" hidden="1"/></p:nvSpPr><p:txBody><a:p><a:r><a:t>${hiddenShapeText}</a:t></a:r></a:p></p:txBody></p:sp>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
    <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
      xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"${hidden ? ` show="${hidden === 'false' ? 'false' : '0'}"` : ''}>
      <p:cSld><p:spTree><p:sp><p:txBody>${paragraphs}</p:txBody></p:sp>${hiddenShape}</p:spTree></p:cSld>
    </p:sld>`;
}

function pptxFixture(options: {
  slideOne?: readonly string[];
  slideTwo?: readonly string[];
  includeUnsafePath?: boolean;
  hiddenSecondSlide?: boolean | 'false';
  hiddenShapeText?: string;
  slideTwoXml?: string;
  presentationXml?: string;
  compressionLevel?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
} = {}): Uint8Array {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Override PartName="/ppt/presentation.xml" ContentType="${PRESENTATION_CONTENT_TYPE}" />
      </Types>`),
    'ppt/presentation.xml': strToU8(options.presentationXml ?? `<?xml version="1.0" encoding="UTF-8"?>
      <p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
        xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <p:sldIdLst><p:sldId id="257" r:id="rId2"/><p:sldId id="258" r:id="rId1"/></p:sldIdLst>
      </p:presentation>`),
    'ppt/_rels/presentation.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="slide" Target="slides/slide1.xml" />
        <Relationship Id="rId2" Type="slide" Target="slides/slide2.xml" />
        <Relationship Id="rIdExternal" Type="link" TargetMode="External" Target="https://tracker.example/private" />
      </Relationships>`),
    'ppt/slides/slide1.xml': strToU8(slideXml(options.slideOne ?? [
      'Second teaching section',
      'Compare the visible findings with the earlier example.',
    ])),
    'ppt/slides/slide2.xml': strToU8(options.slideTwoXml ?? slideXml(options.slideTwo ?? [
      'Chest image reasoning',
      'Objectives',
      'Students will identify a focal visible finding using neutral language.',
      'Explain how the finding changes the working interpretation.',
      'Reference: https://example.org/teaching-source',
    ], options.hiddenSecondSlide, options.hiddenShapeText)),
    'ppt/notesSlides/notesSlide1.xml': strToU8('<notes><text>PRIVATE SPEAKER NOTE</text></notes>'),
    'docProps/core.xml': strToU8('<author>Patient Name Should Not Escape</author>'),
  };
  if (options.includeUnsafePath) files['../private.xml'] = strToU8('<secret />');
  return zipSync(files, { level: options.compressionLevel ?? 0 });
}

function powerpointFile(bytes: Uint8Array, name = 'teaching-material.pptx'): File {
  return new File([bytesBuffer(bytes)], name, { type: POWERPOINT_MIME });
}

function readU16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]
    | (bytes[offset + 1] << 8)
    | (bytes[offset + 2] << 16)
    | (bytes[offset + 3] << 24)) >>> 0;
}

function writeU16(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
}

function writeU32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function writeU64(bytes: Uint8Array, offset: number, value: number): void {
  writeU32(bytes, offset, value >>> 0);
  writeU32(bytes, offset + 4, Math.floor(value / 0x1_0000_0000));
}

function findEocd(bytes: Uint8Array): number {
  for (let offset = bytes.length - 22; offset >= 0; offset -= 1) {
    if (readU32(bytes, offset) === 0x06054b50) return offset;
  }
  throw new Error('Fixture has no ZIP EOCD.');
}

function centralEndAfter(bytes: Uint8Array, centralOffset: number, entries: number): number {
  let offset = centralOffset;
  for (let index = 0; index < entries; index += 1) {
    if (readU32(bytes, offset) !== 0x02014b50) throw new Error('Fixture central directory is malformed.');
    offset += 46 + readU16(bytes, offset + 28) + readU16(bytes, offset + 30) + readU16(bytes, offset + 32);
  }
  return offset;
}

function findCentralEntry(bytes: Uint8Array, targetName: string): number {
  const eocd = findEocd(bytes);
  const entryCount = readU16(bytes, eocd + 10);
  let offset = readU32(bytes, eocd + 16);
  for (let index = 0; index < entryCount; index += 1) {
    const nameLength = readU16(bytes, offset + 28);
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if (name === targetName) return offset;
    offset += 46 + nameLength + readU16(bytes, offset + 30) + readU16(bytes, offset + 32);
  }
  throw new Error(`Fixture has no central entry named ${targetName}.`);
}

function storedSizeMismatchFixture(): Uint8Array {
  const bytes = pptxFixture().slice();
  const entry = findCentralEntry(bytes, '[Content_Types].xml');
  writeU32(bytes, entry + 24, 1);
  return bytes;
}

function deflatedSizeMismatchFixture(): Uint8Array {
  const bytes = pptxFixture({ compressionLevel: 9 }).slice();
  const entry = findCentralEntry(bytes, '[Content_Types].xml');
  const localOffset = readU32(bytes, entry + 42);
  writeU32(bytes, entry + 24, 1);
  writeU32(bytes, localOffset + 22, 1);
  return bytes;
}

function splitDirectoryFixture(): Uint8Array {
  const bytes = pptxFixture().slice();
  const eocd = findEocd(bytes);
  const centralOffset = readU32(bytes, eocd + 16);
  const safeEnd = centralEndAfter(bytes, centralOffset, 3);
  // Lie only in the total-count field. Older preflight code audited three
  // entries while fflate followed the untouched disk-count field and inflated all.
  writeU16(bytes, eocd + 10, 3);
  writeU32(bytes, eocd + 12, safeEnd - centralOffset);
  return bytes;
}

function zip64OverrideFixture(): Uint8Array {
  const original = pptxFixture();
  const oldEocd = findEocd(original);
  const centralOffset = readU32(original, oldEocd + 16);
  const centralSize = readU32(original, oldEocd + 12);
  const entryCount = readU16(original, oldEocd + 10);
  const safeEnd = centralEndAfter(original, centralOffset, 3);
  const bytes = new Uint8Array(original.length + 76);
  bytes.set(original.subarray(0, oldEocd), 0);

  const zip64Eocd = oldEocd;
  writeU32(bytes, zip64Eocd, 0x06064b50);
  writeU64(bytes, zip64Eocd + 4, 44);
  writeU16(bytes, zip64Eocd + 12, 45);
  writeU16(bytes, zip64Eocd + 14, 45);
  writeU64(bytes, zip64Eocd + 24, entryCount);
  writeU64(bytes, zip64Eocd + 32, entryCount);
  writeU64(bytes, zip64Eocd + 40, centralSize);
  writeU64(bytes, zip64Eocd + 48, centralOffset);

  const locator = zip64Eocd + 56;
  writeU32(bytes, locator, 0x07064b50);
  writeU64(bytes, locator + 8, zip64Eocd);
  writeU32(bytes, locator + 16, 1);

  const newEocd = locator + 20;
  bytes.set(original.subarray(oldEocd), newEocd);
  writeU16(bytes, newEocd + 8, 3);
  writeU16(bytes, newEocd + 10, 3);
  writeU32(bytes, newEocd + 12, safeEnd - centralOffset);
  return bytes;
}

function textPdf(lines: readonly string[]): Uint8Array {
  const escaped = lines.map((line) => line.replace(/([\\()])/g, '\\$1'));
  const operations = escaped
    .map((line, index) => `${index === 0 ? '' : '0 -24 Td '}(${line}) Tj`)
    .join(' ');
  const content = `BT /F1 16 Tf 72 720 Td ${operations} ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let source = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(source.length);
    source += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = source.length;
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  source += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return strToU8(source);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('browser-local lesson source import', () => {
  it('extracts visible PowerPoint text in presentation order without uploading or retaining metadata', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    const outline = await importLessonSource(powerpointFile(pptxFixture({
      hiddenShapeText: 'HIDDEN SHAPE PRIVATE TEXT',
    }), 'patient-name-lecture.pptx'));

    expect(outline.format).toBe('pptx');
    expect(outline.unitCount).toBe(2);
    expect(outline.sections.map((section) => section.text.split('\n')[0]))
      .toEqual(['Chest image reasoning', 'Second teaching section']);
    expect(outline.titleCandidate).toBe('Chest image reasoning');
    expect(outline.objectiveCandidates).toContain(
      'identify a focal visible finding using neutral language',
    );
    expect(outline.detectedLinks).toEqual(['https://example.org/teaching-source']);
    expect(outline.teachingNoteDraft).toContain('## Slide 1');
    const serialized = JSON.stringify(outline);
    expect(serialized).not.toContain('patient-name-lecture');
    expect(serialized).not.toContain('PRIVATE SPEAKER NOTE');
    expect(serialized).not.toContain('Patient Name Should Not Escape');
    expect(serialized).not.toContain('tracker.example');
    expect(serialized).not.toContain('HIDDEN SHAPE PRIVATE TEXT');
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([true, 'false'] as const)('ignores hidden slides using show=%s', async (hiddenSecondSlide) => {
    const outline = await importLessonSource(powerpointFile(pptxFixture({ hiddenSecondSlide })));

    expect(outline.unitCount).toBe(2);
    expect(outline.sections).toHaveLength(1);
    expect(outline.sections[0].text).toContain('Second teaching section');
    expect(outline.warnings.join(' ')).toMatch(/1 slide.*no imported text/i);
  });

  it('extracts selectable PDF text into the same bounded outline contract', async () => {
    class TestDOMMatrix {
      a = 1;
      b = 0;
      c = 0;
      d = 1;
      e = 0;
      f = 0;
    }
    vi.stubGlobal('DOMMatrix', TestDOMMatrix);
    // PDF.js documents Node consumers on its legacy build. Importing that
    // worker also supplies the standard Promise helpers missing from Node 22,
    // while production continues to exercise the modern browser bundle.
    const { WorkerMessageHandler } = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs');
    vi.stubGlobal('pdfjsWorker', { WorkerMessageHandler });
    const bytes = textPdf([
      'Focused chest image lesson',
      'Objectives',
      'Students will describe the visible opacity using neutral language.',
    ]);
    const outline = await importLessonSource(
      new File([bytesBuffer(bytes)], 'lesson.pdf', { type: 'application/pdf' }),
    );

    expect(outline.format).toBe('pdf');
    expect(outline.unitCount).toBe(1);
    expect(outline.titleCandidate).toBe('Focused chest image lesson');
    expect(outline.teachingNoteDraft).toContain('Students will describe the visible opacity');
  }, 15_000);

  it('cancels the PDF text stream as soon as the character bound is reached', async () => {
    class TestDOMMatrix {
      a = 1;
      b = 0;
      c = 0;
      d = 1;
      e = 0;
      f = 0;
    }
    vi.stubGlobal('DOMMatrix', TestDOMMatrix);
    const { readBoundedPdfTextStream } = await import('../services/pdfLessonSource');
    const read = vi.fn()
      .mockResolvedValueOnce({
        done: false,
        value: { items: [{ str: 'A'.repeat(LESSON_SOURCE_LIMITS.maxCharactersPerUnit + 1_000), hasEOL: false }] },
      })
      .mockResolvedValueOnce({ done: false, value: { items: [{ str: 'SHOULD NOT BE READ', hasEOL: false }] } });
    const cancel = vi.fn(async () => undefined);
    const releaseLock = vi.fn();
    const stream = {
      getReader: () => ({ read, cancel, releaseLock }),
    } as unknown as Parameters<typeof readBoundedPdfTextStream>[0];

    const result = await readBoundedPdfTextStream(
      stream,
      LESSON_SOURCE_LIMITS.maxCharactersPerUnit,
    );

    expect(result.text).toHaveLength(LESSON_SOURCE_LIMITS.maxCharactersPerUnit);
    expect(result.truncated).toBe(true);
    expect(read).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(releaseLock).toHaveBeenCalledTimes(1);
  });

  it('rejects mismatched extensions, unsafe ZIP paths, and slides without readable text', async () => {
    await expect(importLessonSource(powerpointFile(pptxFixture(), 'renamed.pdf')))
      .rejects.toMatchObject({ code: 'signature-mismatch' });
    await expect(importLessonSource(powerpointFile(pptxFixture({ includeUnsafePath: true }))))
      .rejects.toMatchObject({ code: 'archive-limit' });
    await expect(importLessonSource(powerpointFile(pptxFixture({
      slideOne: [' '],
      slideTwo: [' '],
    }))))
      .rejects.toMatchObject({ code: 'no-readable-text' });
  });

  it('rejects ZIP metadata that would make preflight and decompression inspect different entries', async () => {
    await expect(importLessonSource(powerpointFile(splitDirectoryFixture())))
      .rejects.toMatchObject({ code: 'archive-limit' });
    await expect(importLessonSource(powerpointFile(zip64OverrideFixture())))
      .rejects.toMatchObject({ code: 'archive-limit' });
    await expect(importLessonSource(powerpointFile(storedSizeMismatchFixture())))
      .rejects.toMatchObject({ code: 'archive-limit' });
    await expect(importLessonSource(powerpointFile(deflatedSizeMismatchFixture())))
      .rejects.toMatchObject({ code: 'archive-limit' });
  });

  it('rejects pathologically nested PowerPoint text without quadratic traversal', async () => {
    const depth = LESSON_SOURCE_LIMITS.maxXmlDepth + 2;
    const nested = `${'<a:p>'.repeat(depth)}<a:r><a:t>Nested text</a:t></a:r>${'</a:p>'.repeat(depth)}`;
    const slideTwoXml = `<?xml version="1.0" encoding="UTF-8"?>
      <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
        xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <p:cSld><p:spTree><p:sp><p:txBody>${nested}</p:txBody></p:sp></p:spTree></p:cSld>
      </p:sld>`;
    await expect(importLessonSource(powerpointFile(pptxFixture({ slideTwoXml }))))
      .rejects.toMatchObject({ code: 'archive-limit' });
  });

  it('rejects excessive slide XML before handing it to DOMParser', async () => {
    const repeatedShapes = '<p:sp/>'.repeat(LESSON_SOURCE_LIMITS.maxXmlNodesPerUnit + 1);
    const slideTwoXml = `<?xml version="1.0" encoding="UTF-8"?>
      <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
        xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <!--OVER_BUDGET--><p:cSld>${repeatedShapes}</p:cSld>
      </p:sld>`;
    const parse = vi.spyOn(DOMParser.prototype, 'parseFromString');
    await expect(importLessonSource(powerpointFile(pptxFixture({ slideTwoXml }))))
      .rejects.toMatchObject({ code: 'archive-limit' });
    expect(parse.mock.calls.some(([source]) => String(source).includes('OVER_BUDGET'))).toBe(false);
  });

  it('rejects attribute-heavy slide XML before handing it to DOMParser', async () => {
    const attributes = Array.from(
      { length: LESSON_SOURCE_LIMITS.maxXmlNodesPerUnit + 1 },
      (_, index) => `data-${index}="x"`,
    ).join(' ');
    const slideTwoXml = `<?xml version="1.0" encoding="UTF-8"?>
      <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
        data-marker="ATTRIBUTE_OVER_BUDGET" ${attributes}/>`;
    const parse = vi.spyOn(DOMParser.prototype, 'parseFromString');

    await expect(importLessonSource(powerpointFile(pptxFixture({ slideTwoXml }))))
      .rejects.toMatchObject({ code: 'archive-limit' });
    expect(parse.mock.calls.some(([source]) => String(source).includes('ATTRIBUTE_OVER_BUDGET'))).toBe(false);
  });

  it('rejects repeated slide references before reparsing the same XML', async () => {
    const repeatedIds = Array.from({ length: LESSON_SOURCE_LIMITS.maxUnits }, (_, index) => (
      `<p:sldId id="${300 + index}" r:id="rId1"/>`
    )).join('');
    const presentationXml = `<?xml version="1.0" encoding="UTF-8"?>
      <p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
        xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <p:sldIdLst>${repeatedIds}</p:sldIdLst>
      </p:presentation>`;
    await expect(importLessonSource(powerpointFile(pptxFixture({ presentationXml }))))
      .rejects.toMatchObject({ code: 'malformed-file' });
  });

  it('checks byte and cancellation limits before parsing', async () => {
    const oversized = powerpointFile(pptxFixture());
    Object.defineProperty(oversized, 'size', {
      configurable: true,
      value: LESSON_SOURCE_LIMITS.maxFileBytes + 1,
    });
    const arrayBuffer = vi.spyOn(oversized, 'arrayBuffer');
    await expect(importLessonSource(oversized)).rejects.toMatchObject({ code: 'file-too-large' });
    expect(arrayBuffer).not.toHaveBeenCalled();

    const controller = new AbortController();
    controller.abort();
    await expect(importLessonSource(powerpointFile(pptxFixture()), { signal: controller.signal }))
      .rejects.toEqual(expect.objectContaining<Partial<LessonSourceImportError>>({ code: 'cancelled' }));

    const duringRead = new AbortController();
    const cancelledAfterRead = powerpointFile(pptxFixture());
    vi.spyOn(cancelledAfterRead, 'arrayBuffer').mockImplementation(async () => {
      duringRead.abort();
      return bytesBuffer(pptxFixture());
    });
    await expect(importLessonSource(cancelledAfterRead, { signal: duringRead.signal }))
      .rejects.toMatchObject({ code: 'cancelled' });

    const duringExtraction = new AbortController();
    const pending = importLessonSource(powerpointFile(pptxFixture()), {
      signal: duringExtraction.signal,
    });
    setTimeout(() => duringExtraction.abort(), 0);
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
  });
});
