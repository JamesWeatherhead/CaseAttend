// @vitest-environment jsdom
import { strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractPowerPointTeachingDeck, POWERPOINT_TEACHING_DECK_LIMITS } from '../services/pptxTeachingDeck';

const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aAzQAAAAASUVORK5CYII='), (character) => character.charCodeAt(0));
const MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

function textShape(text: string, placeholder = ''): string {
  return `<p:sp><p:nvSpPr><p:cNvPr id="1" name="Text"/><p:nvPr>${placeholder ? `<p:ph type="${placeholder}"/>` : ''}</p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;
}
function picture(id: string, hidden = false, linked = false): string {
  return `<p:pic><p:nvPicPr><p:cNvPr id="2" name="Picture"${hidden ? ' hidden="1"' : ''}/></p:nvPicPr><p:blipFill><a:blip r:${linked ? 'link' : 'embed'}="${id}"/></p:blipFill></p:pic>`;
}
function slide(content: string, hidden = false): string {
  return `<p:sld xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${R}"${hidden ? ' show="0"' : ''}><p:cSld><p:spTree>${content}</p:spTree></p:cSld></p:sld>`;
}
function rels(content: string): string {
  return `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${content}</Relationships>`;
}
function relation(id: string, type: string, target: string, external = false): string {
  return `<Relationship Id="${id}" Type="${R}/${type}" Target="${target}"${external ? ' TargetMode="External"' : ''}/>`;
}
function fixture(overrides: Record<string, string | Uint8Array> = {}): File {
  const files: Record<string, string | Uint8Array> = {
    '[Content_Types].xml': `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/ppt/presentation.xml" ContentType="${MIME}.main+xml"/></Types>`,
    'ppt/presentation.xml': `<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst><p:sldId id="12" r:id="second"/><p:sldId id="13" r:id="hidden"/><p:sldId id="14" r:id="first"/></p:sldIdLst></p:presentation>`,
    'ppt/_rels/presentation.xml.rels': rels(relation('first', 'slide', 'slides/slide1.xml') + relation('second', 'slide', 'slides/slide2.xml') + relation('hidden', 'slide', 'slides/slide3.xml')),
    'ppt/slides/slide1.xml': slide(textShape('Second visible slide')),
    'ppt/slides/slide2.xml': slide(textShape('First visible slide') + picture('imageA') + picture('imageA') + picture('hiddenPicture', true)),
    'ppt/slides/slide3.xml': slide(textShape('Hidden answer') + picture('hiddenPicture'), true),
    'ppt/slides/_rels/slide2.xml.rels': rels(relation('imageA', 'image', '../media/teaching.png') + relation('hiddenPicture', 'image', '../media/not-used.png') + relation('speaker', 'notesSlide', '../notesSlides/notesSlide7.xml')),
    'ppt/notesSlides/notesSlide7.xml': `<p:notes xmlns:p="${P}" xmlns:a="${A}"><p:cSld><p:spTree>${textShape('Teacher knows the supplied finding.', 'body')}${textShape('7', 'sldNum')}${textShape('Private footer', 'ftr')}${textShape('Header', 'hdr')}${textShape('Date', 'dt')}</p:spTree></p:cSld></p:notes>`,
    'ppt/media/teaching.png': PNG,
    // Orphan media is not decoded or exported, and hidden content stays out.
    'ppt/media/not-used.png': strToU8('unused picture data'),
    ...overrides,
  };
  const bytes = zipSync(Object.fromEntries(Object.entries(files).map(([path, value]) => [path, typeof value === 'string' ? strToU8(value) : value])), { level: 6 });
  return new File([new Uint8Array(bytes).buffer], 'university-lesson.pptx', { type: MIME });
}

afterEach(() => vi.restoreAllMocks());

describe('PowerPoint teaching deck extraction', () => {
  it('follows presentation order, extracts referenced image bytes and author notes, and omits hidden content and note placeholders', async () => {
    const network = vi.spyOn(globalThis, 'fetch');
    const result = await extractPowerPointTeachingDeck(fixture());
    expect(result.slides.map((entry) => [entry.index, entry.text])).toEqual([[1, 'First visible slide'], [3, 'Second visible slide']]);
    expect(result.slides[0].notes).toBe('Teacher knows the supplied finding.');
    expect(result.slides[0].images).toEqual([{ id: 'slide-1-imageA', path: 'ppt/media/teaching.png', bytes: PNG, mimeType: 'image/png' }]);
    expect(result.slides[1].images).toEqual([]);
    expect(network).not.toHaveBeenCalled();
    expect(result.warnings.join(' ')).toMatch(/hidden slide.*overlays.*instructor-only/);
  });

  it('omits external image and note relationships without fetching them', async () => {
    const network = vi.spyOn(globalThis, 'fetch');
    const result = await extractPowerPointTeachingDeck(fixture({
      'ppt/slides/slide2.xml': slide(picture('online', false, true) + picture('embeddedExternal')),
      'ppt/slides/_rels/slide2.xml.rels': rels(relation('online', 'image', 'https://example.org/teaching.png', true) + relation('embeddedExternal', 'image', 'https://example.org/other.png', true) + relation('note', 'notesSlide', 'https://example.org/notes.xml', true)),
    }));
    expect(result.slides[0].notes).toBe('');
    expect(result.slides[0].images).toEqual([]);
    expect(result.warnings.join(' ')).toMatch(/linked.*omitted/);
    expect(network).not.toHaveBeenCalled();
  });

  it('supports image-only slides and warns about unsupported images, diagrams, and video', async () => {
    const result = await extractPowerPointTeachingDeck(fixture({
      'ppt/slides/slide2.xml': slide(picture('imageA') + picture('vector') + '<p:graphicFrame/><p:pic><a:videoFile r:link="video"/></p:pic>'),
      'ppt/slides/_rels/slide2.xml.rels': rels(relation('imageA', 'image', '../media/teaching.png') + relation('vector', 'image', '../media/figure.svg') + relation('video', 'video', '../media/movie.mp4')),
      'ppt/media/figure.svg': '<svg/>',
      'ppt/media/movie.mp4': 'video omitted',
    }));
    expect(result.slides[0].text).toBe('');
    expect(result.slides[0].images).toHaveLength(1);
    expect(result.warnings.join(' ')).toMatch(/unsupported image.*charts, diagrams.*video/);
  });

  it('reads notes through their own relationship, resolves package paths, and preserves ordinary number text', async () => {
    const result = await extractPowerPointTeachingDeck(fixture({
      'ppt/slides/_rels/slide2.xml.rels': rels(relation('imageA', 'image', '/ppt/media/teaching.png') + relation('speaker', 'notesSlide', '../notesSlides/author%20notes.xml')),
      'ppt/notesSlides/author notes.xml': `<p:notes xmlns:p="${P}" xmlns:a="${A}"><p:cSld><p:spTree>${textShape('12', 'body')}${textShape('Instructor annotation')}</p:spTree></p:cSld></p:notes>`,
    }));
    expect(result.slides[0].notes).toBe('12\nInstructor annotation');
    expect(result.slides[0].images[0].path).toBe('ppt/media/teaching.png');
  });

  it('rejects unreadable referenced image content and unsupported presentation formats', async () => {
    await expect(extractPowerPointTeachingDeck(fixture({ 'ppt/media/teaching.png': 'Not an image' }))).rejects.toMatchObject({ code: 'malformed-file' });
    await expect(extractPowerPointTeachingDeck(new File(['text'], 'notes.txt'))).rejects.toMatchObject({ code: 'unsupported-format' });
    await expect(extractPowerPointTeachingDeck(fixture({ '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>' }))).rejects.toMatchObject({ code: 'unsupported-format' });
  });

  it('enforces the file limit before reading and allows cancellation before and after the file read', async () => {
    const large = fixture();
    Object.defineProperty(large, 'size', { value: POWERPOINT_TEACHING_DECK_LIMITS.maxFileBytes + 1 });
    const read = vi.spyOn(large, 'arrayBuffer');
    await expect(extractPowerPointTeachingDeck(large)).rejects.toMatchObject({ code: 'file-too-large' });
    expect(read).not.toHaveBeenCalled();
    const before = new AbortController();
    before.abort();
    await expect(extractPowerPointTeachingDeck(fixture(), { signal: before.signal })).rejects.toMatchObject({ code: 'cancelled' });
    const after = new AbortController();
    const file = fixture();
    const original = file.arrayBuffer.bind(file);
    vi.spyOn(file, 'arrayBuffer').mockImplementation(async () => { const bytes = await original(); after.abort(); return bytes; });
    await expect(extractPowerPointTeachingDeck(file, { signal: after.signal })).rejects.toMatchObject({ code: 'cancelled' });
  });

  it('cancels while processing the archive without returning partial material', async () => {
    const controller = new AbortController();
    const pending = extractPowerPointTeachingDeck(fixture(), { signal: controller.signal });
    setTimeout(() => controller.abort(), 0);
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
  });
});
