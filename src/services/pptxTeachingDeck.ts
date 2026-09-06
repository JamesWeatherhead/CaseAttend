/** Instructor-only source material. Candidate media must pass caseAssetPipeline before saving. */
import { inspectCaseImageBytes } from './caseAssetPipeline';
import { LESSON_SOURCE_LIMITS, LessonSourceImportError, type LessonSourceImportOptions } from './lessonSourceImport';
import { extractSelectedXml, hiddenShape, preflightArchive, slideOrder, slideText, xmlDocument } from './pptxLessonSource';

const DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const PRESENTATION_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const CONTENT_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';
const PRESENTATION_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml';
const MANIFEST_PATHS = ['[Content_Types].xml', 'ppt/presentation.xml', 'ppt/_rels/presentation.xml.rels'];

export const POWERPOINT_TEACHING_DECK_LIMITS = Object.freeze({
  maxFileBytes: LESSON_SOURCE_LIMITS.maxFileBytes,
  maxSlides: LESSON_SOURCE_LIMITS.maxUnits,
  maxImages: 256,
  maxImageBytes: LESSON_SOURCE_LIMITS.maxArchiveEntryBytes,
  maxImageOutputBytes: 64 * 1024 * 1024,
  maxImagePixels: 16_000_000,
  maxTotalImagePixels: 64_000_000,
  maxCharacters: LESSON_SOURCE_LIMITS.maxCharacters,
});

export interface PowerPointTeachingImage {
  /** Stable per-slide identifier containing the original image relationship ID. */
  id: string;
  /** Original archive part path for source attribution; not a URL. */
  path: string;
  bytes: Uint8Array;
  mimeType: string;
}

export interface PowerPointTeachingSlide {
  /** One-based position in the presentation, including gaps where hidden slides were omitted. */
  index: number;
  text: string;
  notes: string;
  images: readonly PowerPointTeachingImage[];
}

export interface PowerPointTeachingDeck {
  slides: readonly PowerPointTeachingSlide[];
  warnings: readonly string[];
}

interface Relationship { id: string; path: string | null; type: string; external: boolean }
interface SlidePlan {
  index: number;
  path: string;
  notesPath?: string;
  images: Array<{ id: string; path: string }>;
}

function checkCancellation(signal?: AbortSignal): void {
  if (signal?.aborted) throw new LessonSourceImportError('cancelled', 'Document import was cancelled.');
}

function fail(message: string, code: 'malformed-file' | 'archive-limit' = 'malformed-file'): never {
  throw new LessonSourceImportError(code, message);
}

function resolvePartPath(ownerPath: string, target: string): string | null {
  if (!target || /[\\?#\u0000-\u001f]/.test(target) || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//')) return null;
  // OPC targets are URI references. Decode before resolving, and keep all reads inside this archive.
  let decoded: string;
  try { decoded = decodeURIComponent(target); } catch { return null; }
  if (/[\\?#\u0000-\u001f]/.test(decoded) || /^[a-z][a-z0-9+.-]*:/i.test(decoded) || decoded.startsWith('//')) return null;
  const parts = decoded.startsWith('/') ? [] : ownerPath.split('/').slice(0, -1);
  for (const part of decoded.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(part);
  }
  return parts.join('/');
}

function relationshipsPath(part: string): string {
  const pieces = part.split('/');
  const leaf = pieces.pop()!;
  return [...pieces, '_rels', `${leaf}.rels`].join('/');
}

function readRelationships(bytes: Uint8Array | undefined, ownerPath: string): Relationship[] {
  if (!bytes) return [];
  const doc = xmlDocument(bytes, `${ownerPath} relationships`, LESSON_SOURCE_LIMITS.maxArchiveEntries);
  const result: Relationship[] = [];
  const ids = new Set<string>();
  for (const node of Array.from(doc.getElementsByTagNameNS('*', 'Relationship'))) {
    const id = node.getAttribute('Id') ?? '';
    if (!id || ids.has(id)) fail('A slide has a missing or repeated relationship identifier.');
    ids.add(id);
    const external = node.getAttribute('TargetMode')?.toLowerCase() === 'external';
    result.push({
      id,
      path: external ? null : resolvePartPath(ownerPath, node.getAttribute('Target') ?? ''),
      type: node.getAttribute('Type') ?? '',
      external,
    });
  }
  return result;
}

function visible(element: Element): boolean {
  for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
    if (hiddenShape(ancestor)) return false;
  }
  return true;
}

function isSlideXmlOrRelationship(name: string): boolean {
  return MANIFEST_PATHS.includes(name)
    || /^ppt\/slides\/slide\d+\.xml$/i.test(name)
    || /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/i.test(name);
}

/**
 * Extract actual slide embeds and author notes without requesting linked resources.
 * This does not render a slide or certify an image: cropping/overlays are omitted,
 * and pixels must be decoded and re-encoded by caseAssetPipeline before publication.
 */
export async function extractPowerPointTeachingDeck(
  file: File,
  options: LessonSourceImportOptions = {},
): Promise<PowerPointTeachingDeck> {
  checkCancellation(options.signal);
  if (!file.size) throw new LessonSourceImportError('empty-file', 'Choose a non-empty PowerPoint presentation.');
  if (file.size > POWERPOINT_TEACHING_DECK_LIMITS.maxFileBytes) {
    throw new LessonSourceImportError('file-too-large', 'Use a PowerPoint teaching excerpt of 25 MB or less.');
  }
  if (!/\.pptx$/i.test(file.name)) {
    throw new LessonSourceImportError('unsupported-format', 'Choose a macro-free PowerPoint presentation (.pptx).');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  checkCancellation(options.signal);
  if (bytes.byteLength > POWERPOINT_TEACHING_DECK_LIMITS.maxFileBytes) {
    throw new LessonSourceImportError('file-too-large', 'Use a PowerPoint teaching excerpt of 25 MB or less.');
  }
  try {
    const initial = preflightArchive(bytes, isSlideXmlOrRelationship);
    const budget = { inflated: 0 };
    const manifests = await extractSelectedXml(bytes, initial, new Set(MANIFEST_PATHS), budget, options.signal);
    const contentTypes = xmlDocument(manifests['[Content_Types].xml'], 'the content-type manifest');
    const presentationType = Array.from(contentTypes.getElementsByTagNameNS(CONTENT_NS, 'Override'))
      .find((node) => node.getAttribute('PartName') === '/ppt/presentation.xml')?.getAttribute('ContentType');
    if (presentationType !== PRESENTATION_TYPE || [...initial.names].some((name) => /(?:^|\/)vbaProject\.bin$/i.test(name))) {
      throw new LessonSourceImportError('unsupported-format', 'Choose a macro-free PowerPoint presentation (.pptx).');
    }
    const ordered = slideOrder(manifests);
    const presentationRelations = new Map(readRelationships(manifests['ppt/_rels/presentation.xml.rels'], 'ppt/presentation.xml').map((relation) => [relation.id, relation]));
    const presentation = xmlDocument(manifests['ppt/presentation.xml'], 'the presentation manifest', LESSON_SOURCE_LIMITS.maxArchiveEntries);
    const slideIds = Array.from(presentation.getElementsByTagNameNS(PRESENTATION_NS, 'sldId'));
    if (slideIds.length !== ordered.length || slideIds.some((slideId, index) => {
      const relation = presentationRelations.get(slideId.getAttributeNS(REL_NS, 'id') ?? '');
      return !relation || relation.external || relation.type !== `${REL_NS}/slide` || relation.path !== ordered[index];
    })) fail('The presentation contains an unavailable or invalid slide relationship.');
    const slideFiles = await extractSelectedXml(bytes, initial, new Set(ordered), budget, options.signal);
    const warnings = new Set<string>();
    const visibleSlides: Array<{ index: number; path: string; doc: XMLDocument }> = [];
    const relationPaths = new Set<string>();
    for (let index = 0; index < ordered.length; index += 1) {
      if (index > 0) await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
      checkCancellation(options.signal);
      const path = ordered[index];
      const doc = xmlDocument(slideFiles[path], `slide ${index + 1}`);
      const show = doc.documentElement.getAttribute('show')?.toLowerCase();
      if (show === '0' || show === 'false') continue;
      visibleSlides.push({ index: index + 1, path, doc });
      const relPath = relationshipsPath(path);
      if (initial.names.has(relPath)) relationPaths.add(relPath);
    }
    if (visibleSlides.length < ordered.length) warnings.add(`${ordered.length - visibleSlides.length} hidden slide(s) were omitted.`);
    const relationshipFiles = await extractSelectedXml(bytes, initial, relationPaths, budget, options.signal);
    const plans: SlidePlan[] = [];
    const assetPaths = new Set<string>();
    const notePaths = new Set<string>();
    let imageCount = 0;
    for (const { index, path, doc } of visibleSlides) {
      await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
      checkCancellation(options.signal);
      const relationships = readRelationships(relationshipFiles[relationshipsPath(path)], path);
      const byId = new Map(relationships.map((relation) => [relation.id, relation]));
      const plan: SlidePlan = { index, path, images: [] };
      const notes = relationships.filter((relation) => relation.type === `${REL_NS}/notesSlide`);
      if (notes.length > 1) fail(`Slide ${index} references more than one speaker-note part.`);
      if (notes.length) {
        const note = notes[0];
        if (note.external || !note.path || !/^ppt\/notesSlides\/[^/]+\.xml$/i.test(note.path) || !initial.names.has(note.path)) {
          warnings.add(`Slide ${index}: linked or missing speaker notes were omitted.`);
        } else {
          plan.notesPath = note.path;
          notePaths.add(note.path);
        }
      }
      const embeddedIds = new Set<string>();
      for (const blip of Array.from(doc.getElementsByTagNameNS(DRAWING_NS, 'blip'))) {
        if (!visible(blip)) continue;
        const id = blip.getAttributeNS(REL_NS, 'embed');
        if (!id) {
          if (blip.getAttributeNS(REL_NS, 'link')) warnings.add(`Slide ${index}: linked images were omitted; no linked files were downloaded.`);
          continue;
        }
        if (embeddedIds.has(id)) continue;
        embeddedIds.add(id);
        const relation = byId.get(id);
        if (!relation || relation.type !== `${REL_NS}/image` || relation.external || !relation.path || !initial.names.has(relation.path)) {
          warnings.add(`Slide ${index}: an unavailable image was omitted; no linked files were downloaded.`);
          continue;
        }
        if (!/\.(?:png|jpe?g|webp)$/i.test(relation.path)) {
          warnings.add(`Slide ${index}: an unsupported image was omitted. Only PNG, JPEG, and WebP images can be imported.`);
          continue;
        }
        imageCount += 1;
        if (imageCount > POWERPOINT_TEACHING_DECK_LIMITS.maxImages) fail('The presentation contains more than 256 image placements. Use a smaller teaching excerpt.', 'archive-limit');
        assetPaths.add(relation.path);
        plan.images.push({ id: `slide-${index}-${id}`, path: relation.path });
      }
      const unsupportedVisual = [
        ...['graphicFrame', 'oleObj'].flatMap((name) => Array.from(doc.getElementsByTagNameNS(PRESENTATION_NS, name))),
        ...['videoFile', 'audioFile', 'quickTimeFile', 'svgBlip'].flatMap((name) => Array.from(doc.getElementsByTagNameNS('*', name))),
      ].some(visible);
      if (unsupportedVisual) warnings.add(`Slide ${index}: charts, diagrams, embedded objects, audio, video, or vector graphics are not rendered; any available raster preview is only a candidate image.`);
      plans.push(plan);
    }
    const referenced = new Set([...assetPaths, ...notePaths]);
    // Include the first-stage parts in the second preflight to keep overlap and
    // declared total checks consistent across XML, notes, and selected images.
    const complete = preflightArchive(bytes, (name) => isSlideXmlOrRelationship(name) || referenced.has(name));
    const sourceFiles = await extractSelectedXml(bytes, complete, referenced, budget, options.signal);
    const inspected = new Map<string, { bytes: Uint8Array; mimeType: string }>();
    let imageBytes = 0;
    let imagePixels = 0;
    for (const path of assetPaths) {
      await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
      checkCancellation(options.signal);
      const imageBytesForPath = sourceFiles[path];
      if (!imageBytesForPath) fail('A referenced PowerPoint image is missing.');
      const inspection = inspectCaseImageBytes(imageBytesForPath, { fileName: path, limits: { maxAssetBytes: POWERPOINT_TEACHING_DECK_LIMITS.maxImageBytes } });
      imageBytes += imageBytesForPath.byteLength;
      imagePixels += inspection.width * inspection.height;
      if (imageBytes > POWERPOINT_TEACHING_DECK_LIMITS.maxImageOutputBytes || imagePixels > POWERPOINT_TEACHING_DECK_LIMITS.maxTotalImagePixels) {
        fail('The selected images exceed the presentation image budget. Use a smaller teaching excerpt.', 'archive-limit');
      }
      // Copy stored ZIP entries so returned media does not retain the entire source archive.
      inspected.set(path, { bytes: imageBytesForPath.slice(), mimeType: inspection.mimeType });
    }
    let remainingCharacters = POWERPOINT_TEACHING_DECK_LIMITS.maxCharacters;
    let shortened = false;
    const slides: PowerPointTeachingSlide[] = [];
    for (const plan of plans) {
      await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
      checkCancellation(options.signal);
      const read = (source: Uint8Array, label: string, notes = false): string => {
        const result = slideText(source, label, Math.min(remainingCharacters, LESSON_SOURCE_LIMITS.maxCharactersPerUnit), options.signal, notes);
        remainingCharacters -= result.text.length;
        shortened ||= result.truncated;
        return result.text;
      };
      slides.push({
        index: plan.index,
        text: read(slideFiles[plan.path], `slide ${plan.index}`),
        notes: plan.notesPath ? read(sourceFiles[plan.notesPath], `slide ${plan.index} notes`, true) : '',
        images: plan.images.map(({ id, path }) => ({ id, path, ...inspected.get(path)! })),
      });
    }
    checkCancellation(options.signal);
    if (shortened) warnings.add('Slide text or speaker notes reached the extraction limit and were shortened. Review the original presentation for omitted material.');
    if (imageCount) warnings.add('Extracted images omit PowerPoint overlays, arrows, crops, and slide layout. Review each image against its original slide before using it.');
    warnings.add('Slide text and speaker notes are instructor-only source material and may contain answers. Select learner media and review the lesson before sharing it.');
    return { slides, warnings: [...warnings] };
  } catch (error) {
    if (error instanceof LessonSourceImportError) throw error;
    checkCancellation(options.signal);
    throw new LessonSourceImportError('malformed-file', 'The presentation or one of its selected images could not be read safely.', { cause: error });
  }
}
