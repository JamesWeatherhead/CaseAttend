import { Inflate, strFromU8 } from 'fflate';

import {
  LESSON_SOURCE_LIMITS,
  LessonSourceImportError,
  type LessonSourceExtraction,
  type LessonSourceImportOptions,
} from './lessonSourceImport';

const PRESENTATION_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml';
const RELATIONSHIPS_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const PRESENTATION_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main';

function u16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function u32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]
    | (bytes[offset + 1] << 8)
    | (bytes[offset + 2] << 16)
    | (bytes[offset + 3] << 24)) >>> 0;
}

function archiveError(message: string): LessonSourceImportError {
  return new LessonSourceImportError('archive-limit', message);
}

function cancelled(): LessonSourceImportError {
  return new LessonSourceImportError('cancelled', 'Document import was cancelled.');
}

function selectedXmlPath(name: string): boolean {
  return (
    name === '[Content_Types].xml'
    || name === 'ppt/presentation.xml'
    || name === 'ppt/_rels/presentation.xml.rels'
    || /^ppt\/slides\/slide\d+\.xml$/i.test(name)
  );
}

interface SelectedArchiveEntry {
  compression: 0 | 8;
  compressed: number;
  inflated: number;
  dataStart: number;
  dataEnd: number;
}

interface ArchivePreflight {
  names: Set<string>;
  selectedEntries: Map<string, SelectedArchiveEntry>;
}

/** Read the ZIP central directory before inflating attacker-controlled data. */
export function preflightArchive(
  bytes: Uint8Array,
  selectPath: (name: string) => boolean = selectedXmlPath,
): ArchivePreflight {
  const minimumEocd = 22;
  if (bytes.length < minimumEocd) throw archiveError('The PowerPoint archive is incomplete.');
  const floor = Math.max(0, bytes.length - 65_557);
  let eocd = -1;
  for (let offset = bytes.length - minimumEocd; offset >= floor; offset -= 1) {
    if (u32(bytes, offset) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw archiveError('The PowerPoint ZIP directory is missing.');
  if (u16(bytes, eocd + 4) !== 0 || u16(bytes, eocd + 6) !== 0) {
    throw archiveError('Multi-disk PowerPoint archives are not supported.');
  }
  const diskEntryCount = u16(bytes, eocd + 8);
  const entryCount = u16(bytes, eocd + 10);
  const centralSize = u32(bytes, eocd + 12);
  const centralOffset = u32(bytes, eocd + 16);
  const commentLength = u16(bytes, eocd + 20);
  if (eocd + minimumEocd + commentLength !== bytes.length) {
    throw archiveError('The PowerPoint ZIP ending is inconsistent.');
  }
  if (diskEntryCount !== entryCount) {
    throw archiveError('The PowerPoint ZIP entry counts are inconsistent.');
  }
  if (eocd >= 20 && u32(bytes, eocd - 20) === 0x07064b50) {
    throw archiveError('ZIP64 PowerPoint archives are not supported.');
  }
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw archiveError('ZIP64 PowerPoint archives are not supported.');
  }
  if (entryCount > LESSON_SOURCE_LIMITS.maxArchiveEntries) {
    throw archiveError(`The presentation contains more than ${LESSON_SOURCE_LIMITS.maxArchiveEntries} archive entries.`);
  }
  if (centralOffset + centralSize !== eocd || centralOffset + centralSize > bytes.length) {
    throw archiveError('The PowerPoint ZIP directory does not match the file ending.');
  }

  const names = new Set<string>();
  const selectedEntries = new Map<string, SelectedArchiveEntry>();
  let offset = centralOffset;
  let inflatedTotal = 0;
  let compressedTotal = 0;
  const selectedLocalRanges: Array<readonly [number, number]> = [];
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > bytes.length || u32(bytes, offset) !== 0x02014b50) {
      throw archiveError('The PowerPoint ZIP directory is malformed.');
    }
    const flags = u16(bytes, offset + 8);
    const compression = u16(bytes, offset + 10);
    const compressed = u32(bytes, offset + 20);
    const inflated = u32(bytes, offset + 24);
    const nameLength = u16(bytes, offset + 28);
    const extraLength = u16(bytes, offset + 30);
    const commentLength = u16(bytes, offset + 32);
    const localOffset = u32(bytes, offset + 42);
    const end = offset + 46 + nameLength + extraLength + commentLength;
    if (end > bytes.length) throw archiveError('A PowerPoint ZIP entry is truncated.');
    if ((flags & 0x1) !== 0) {
      throw new LessonSourceImportError(
        'encrypted-file',
        'Encrypted or password-protected PowerPoint files are not supported.',
      );
    }
    if (compression !== 0 && compression !== 8) {
      throw archiveError('The presentation uses an unsupported ZIP compression method.');
    }
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    const directory = name.endsWith('/');
    const pathParts = (directory ? name.slice(0, -1) : name).split('/');
    if (
      !name
      || name.includes('\\')
      || name.startsWith('/')
      || pathParts.some((part) => part === '' || part === '..' || part === '.')
    ) {
      throw archiveError('The presentation contains an unsafe ZIP path.');
    }
    if (names.has(name)) throw archiveError('The presentation contains a duplicated ZIP path.');
    const selectedXml = selectPath(name);
    if (selectedXml) {
      const manifestXml = (
        name === '[Content_Types].xml'
        || name === 'ppt/presentation.xml'
        || name === 'ppt/_rels/presentation.xml.rels'
      );
      if (
        inflated > LESSON_SOURCE_LIMITS.maxArchiveEntryBytes
        || compressed > LESSON_SOURCE_LIMITS.maxArchiveEntryBytes
      ) {
        throw archiveError('A PowerPoint XML entry is too large to import safely.');
      }
      if (manifestXml && inflated > LESSON_SOURCE_LIMITS.maxManifestXmlBytes) {
        throw archiveError('A PowerPoint manifest is too large to import safely.');
      }
      inflatedTotal += inflated;
      compressedTotal += compressed;
      if (inflatedTotal > LESSON_SOURCE_LIMITS.maxArchiveInflatedBytes) {
        throw archiveError('The expanded PowerPoint XML is too large to import safely.');
      }
      if (compressedTotal > LESSON_SOURCE_LIMITS.maxFileBytes) {
        throw archiveError('The selected PowerPoint XML uses too much compressed data to import safely.');
      }
      if (compression === 0 && compressed !== inflated) {
        throw archiveError('A stored PowerPoint XML entry has inconsistent sizes.');
      }
      if (
        inflated > 0
        && (compressed === 0 || inflated / compressed > LESSON_SOURCE_LIMITS.maxCompressionRatio)
      ) {
        throw archiveError('A PowerPoint XML entry has an unsafe compression ratio.');
      }
      if (localOffset + 30 > centralOffset || u32(bytes, localOffset) !== 0x04034b50) {
        throw archiveError('A PowerPoint XML entry has an invalid local header.');
      }
      const localFlags = u16(bytes, localOffset + 6);
      const localCompression = u16(bytes, localOffset + 8);
      const localNameLength = u16(bytes, localOffset + 26);
      const localExtraLength = u16(bytes, localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const dataEnd = dataStart + compressed;
      if (
        (localFlags & 0x1) !== 0
        || localCompression !== compression
        || dataStart > centralOffset
        || dataEnd > centralOffset
      ) {
        throw archiveError('A PowerPoint XML entry has inconsistent local metadata.');
      }
      const localName = new TextDecoder().decode(
        bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength),
      );
      if (localName !== name) {
        throw archiveError('A PowerPoint XML entry has mismatched local and directory paths.');
      }
      if (selectedLocalRanges.some(([start, end]) => localOffset < end && dataEnd > start)) {
        throw archiveError('PowerPoint XML entries overlap inside the archive.');
      }
      selectedLocalRanges.push([localOffset, dataEnd]);
      selectedEntries.set(name, {
        compression: compression as 0 | 8,
        compressed,
        inflated,
        dataStart,
        dataEnd,
      });
    }
    names.add(name);
    offset = end;
  }
  if (offset !== centralOffset + centralSize) {
    throw archiveError('The PowerPoint ZIP directory size is inconsistent.');
  }
  return { names, selectedEntries };
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, 0); });
}

export async function extractSelectedXml(
  bytes: Uint8Array,
  preflight: ArchivePreflight,
  selectedNames: ReadonlySet<string>,
  actualBudget: { inflated: number },
  signal?: AbortSignal,
): Promise<Record<string, Uint8Array>> {
  const files: Record<string, Uint8Array> = {};
  let entryIndex = 0;
  for (const name of selectedNames) {
    if (entryIndex > 0) await yieldToBrowser();
    entryIndex += 1;
    if (signal?.aborted) throw cancelled();
    const entry = preflight.selectedEntries.get(name);
    if (!entry) continue;
    if (entry.compression === 0) {
      actualBudget.inflated += entry.inflated;
      if (actualBudget.inflated > LESSON_SOURCE_LIMITS.maxArchiveInflatedBytes) {
        throw archiveError('The expanded PowerPoint XML is too large to import safely.');
      }
      files[name] = bytes.subarray(entry.dataStart, entry.dataEnd);
      continue;
    }

    const output = new Uint8Array(entry.inflated);
    let written = 0;
    const inflator = new Inflate((chunk) => {
      if (written + chunk.length > entry.inflated) {
        throw archiveError(`PowerPoint XML entry '${name}' expands beyond its declared size.`);
      }
      if (actualBudget.inflated + chunk.length > LESSON_SOURCE_LIMITS.maxArchiveInflatedBytes) {
        throw archiveError('The expanded PowerPoint XML is too large to import safely.');
      }
      output.set(chunk, written);
      written += chunk.length;
      actualBudget.inflated += chunk.length;
    });
    let bytesSinceYield = 0;
    for (let offset = entry.dataStart; offset < entry.dataEnd; offset += 4_096) {
      if (signal?.aborted) throw cancelled();
      const end = Math.min(offset + 4_096, entry.dataEnd);
      inflator.push(bytes.subarray(offset, end), end === entry.dataEnd);
      bytesSinceYield += end - offset;
      if (bytesSinceYield >= 65_536) {
        bytesSinceYield = 0;
        await yieldToBrowser();
      }
    }
    if (written !== entry.inflated) {
      throw archiveError(`PowerPoint XML entry '${name}' does not match its declared size.`);
    }
    files[name] = output;
  }
  return files;
}

function assertXmlLexicalBudget(source: string, label: string, maxElements: number): void {
  let markupCount = 0;
  let depth = 0;
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf('<', cursor);
    if (start < 0) break;
    markupCount += 1;
    if (markupCount > maxElements) {
      throw archiveError(`${label} contains too many XML elements to import safely.`);
    }
    if (source.startsWith('<!--', start)) {
      const end = source.indexOf('-->', start + 4);
      cursor = end < 0 ? source.length : end + 3;
      continue;
    }
    if (source.startsWith('<![CDATA[', start)) {
      const end = source.indexOf(']]>', start + 9);
      cursor = end < 0 ? source.length : end + 3;
      continue;
    }
    if (source.startsWith('<?', start)) {
      const end = source.indexOf('?>', start + 2);
      cursor = end < 0 ? source.length : end + 2;
      continue;
    }

    let quote = '';
    let end = start + 1;
    for (; end < source.length; end += 1) {
      if (end - start > LESSON_SOURCE_LIMITS.maxXmlTagCharacters) {
        throw archiveError(`${label} contains an XML tag that is too large to import safely.`);
      }
      const character = source[end];
      if (quote) {
        if (character === quote) quote = '';
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === '=') {
        markupCount += 1;
        if (markupCount > maxElements) {
          throw archiveError(`${label} contains too much XML markup to import safely.`);
        }
      } else if (character === '>') {
        break;
      }
    }
    if (end >= source.length) break;
    let first = start + 1;
    while (/\s/.test(source[first] ?? '')) first += 1;
    const closing = source[first] === '/';
    const declaration = source[first] === '!';
    let last = end - 1;
    while (/\s/.test(source[last] ?? '')) last -= 1;
    const selfClosing = source[last] === '/';
    if (closing) {
      depth = Math.max(0, depth - 1);
    } else if (!declaration && !selfClosing) {
      depth += 1;
      if (depth > LESSON_SOURCE_LIMITS.maxXmlDepth) {
        throw archiveError(`${label} is nested too deeply to import safely.`);
      }
    }
    cursor = end + 1;
  }
}

export function xmlDocument(
  bytes: Uint8Array | undefined,
  label: string,
  maxElements: number = LESSON_SOURCE_LIMITS.maxXmlNodesPerUnit,
): XMLDocument {
  if (!bytes) {
    throw new LessonSourceImportError('malformed-file', `The PowerPoint file is missing ${label}.`);
  }
  const source = strFromU8(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) {
    throw new LessonSourceImportError('malformed-file', `${label} contains a prohibited XML declaration.`);
  }
  assertXmlLexicalBudget(source, label, maxElements);
  const parsed = new DOMParser().parseFromString(source, 'application/xml');
  if (parsed.getElementsByTagName('parsererror').length > 0) {
    throw new LessonSourceImportError('malformed-file', `${label} is not valid XML.`);
  }
  return parsed;
}

function normalizeSlideTarget(target: string): string | null {
  if (!target || target.includes('\\') || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//')) return null;
  const parts = (target.startsWith('/') ? target.slice(1) : `ppt/${target}`).split('/');
  const normalized: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (normalized.length === 0) return null;
      normalized.pop();
    } else {
      normalized.push(part);
    }
  }
  const path = normalized.join('/');
  return /^ppt\/slides\/slide\d+\.xml$/i.test(path) ? path : null;
}

export function slideOrder(files: Record<string, Uint8Array>): string[] {
  const presentation = xmlDocument(
    files['ppt/presentation.xml'],
    'the presentation manifest',
    LESSON_SOURCE_LIMITS.maxArchiveEntries,
  );
  const relationships = xmlDocument(
    files['ppt/_rels/presentation.xml.rels'],
    'the presentation relationships',
    LESSON_SOURCE_LIMITS.maxArchiveEntries,
  );
  const targets = new Map<string, string>();
  const relationshipNodes = relationships.getElementsByTagNameNS('*', 'Relationship');
  if (relationshipNodes.length > LESSON_SOURCE_LIMITS.maxArchiveEntries) {
    throw archiveError('The presentation has too many relationships to import safely.');
  }
  for (let index = 0; index < relationshipNodes.length; index += 1) {
    const relationship = relationshipNodes[index];
    if (relationship.getAttribute('TargetMode') === 'External') continue;
    const id = relationship.getAttribute('Id') ?? '';
    const target = normalizeSlideTarget(relationship.getAttribute('Target') ?? '');
    if (id && target) targets.set(id, target);
  }
  const ordered: string[] = [];
  const seenTargets = new Set<string>();
  const slideIds = presentation.getElementsByTagNameNS('*', 'sldId');
  if (slideIds.length > LESSON_SOURCE_LIMITS.maxUnits) {
    throw new LessonSourceImportError(
      'too-many-units',
      `This presentation has ${slideIds.length} slides. Use a teaching excerpt with at most ${LESSON_SOURCE_LIMITS.maxUnits} slides.`,
    );
  }
  for (let index = 0; index < slideIds.length; index += 1) {
    const slideId = slideIds[index];
    const relationshipId = slideId.getAttributeNS(RELATIONSHIPS_NS, 'id')
      ?? slideId.getAttribute('r:id')
      ?? '';
    const target = targets.get(relationshipId);
    if (target) {
      if (seenTargets.has(target)) {
        throw new LessonSourceImportError(
          'malformed-file',
          'The PowerPoint presentation references the same slide more than once.',
        );
      }
      seenTargets.add(target);
      ordered.push(target);
    }
  }
  if (ordered.length === 0) {
    throw new LessonSourceImportError('malformed-file', 'The PowerPoint file has no ordered slides.');
  }
  if (ordered.length > LESSON_SOURCE_LIMITS.maxUnits) {
    throw new LessonSourceImportError(
      'too-many-units',
      `This presentation has ${ordered.length} slides. Use a teaching excerpt with at most ${LESSON_SOURCE_LIMITS.maxUnits} slides.`,
    );
  }
  return ordered;
}

export function hiddenShape(element: Element): boolean {
  if (
    element.namespaceURI !== PRESENTATION_NS
    || !['sp', 'grpSp', 'graphicFrame', 'cxnSp', 'pic'].includes(element.localName)
  ) return false;
  const nonVisualContainer = Array.from(element.children).find((child) => (
    child.namespaceURI === PRESENTATION_NS
    && child.localName.startsWith('nv')
    && child.localName.endsWith('Pr')
  ));
  const nonVisualProperties = nonVisualContainer
    ? Array.from(nonVisualContainer.children).find((child) => child.localName === 'cNvPr')
    : undefined;
  const hidden = nonVisualProperties?.getAttribute('hidden')?.toLocaleLowerCase('en-US');
  return hidden === '1' || hidden === 'true';
}

export function slideText(
  bytes: Uint8Array | undefined,
  label: string,
  maxCharacters: number,
  signal?: AbortSignal,
  omitNotesPlaceholders = false,
): { text: string; truncated: boolean } {
  const slide = xmlDocument(bytes, label);
  if (omitNotesPlaceholders) {
    for (const shape of Array.from(slide.getElementsByTagNameNS(PRESENTATION_NS, 'sp'))) {
      const placeholder = shape.getElementsByTagNameNS(PRESENTATION_NS, 'ph')[0];
      if (placeholder && ['sldNum', 'hdr', 'ftr', 'dt', 'sldImg'].includes(placeholder.getAttribute('type') ?? '')) {
        shape.remove();
      }
    }
  }
  const show = slide.documentElement.getAttribute('show')?.toLocaleLowerCase('en-US');
  if (show === '0' || show === 'false') return { text: '', truncated: false };

  type Visit = { element: Element; depth: number; hidden: boolean; exiting?: boolean; paragraph?: boolean };
  const stack: Visit[] = [{ element: slide.documentElement, depth: 0, hidden: false }];
  let raw = '';
  let nodeCount = 0;
  let textNodeCount = 0;
  let paragraphDepth = 0;
  let truncated = false;

  while (stack.length > 0 && raw.length < maxCharacters) {
    if (signal?.aborted) throw cancelled();
    const visit = stack.pop()!;
    if (visit.exiting) {
      if (visit.paragraph) paragraphDepth -= 1;
      continue;
    }
    nodeCount += 1;
    if (nodeCount > LESSON_SOURCE_LIMITS.maxXmlNodesPerUnit) {
      throw archiveError(`${label} contains too many XML elements to import safely.`);
    }
    if (visit.depth > LESSON_SOURCE_LIMITS.maxXmlDepth) {
      throw archiveError(`${label} is nested too deeply to import safely.`);
    }
    const hidden = visit.hidden || hiddenShape(visit.element);
    if (hidden) continue;

    const paragraph = visit.element.namespaceURI === DRAWING_NS && visit.element.localName === 'p';
    if (paragraph) {
      if (paragraphDepth === 0 && raw.length > 0) raw += '\n';
      paragraphDepth += 1;
    }
    stack.push({ ...visit, hidden, exiting: true, paragraph });

    if (visit.element.namespaceURI === DRAWING_NS && visit.element.localName === 't' && paragraphDepth > 0) {
      textNodeCount += 1;
      if (textNodeCount > LESSON_SOURCE_LIMITS.maxTextItemsPerUnit) {
        throw archiveError(`${label} contains too many text runs to import safely.`);
      }
      for (let index = 0; index < visit.element.childNodes.length; index += 1) {
        const node = visit.element.childNodes[index];
        if (node.nodeType !== 3) continue;
        const value = node.nodeValue ?? '';
        const available = maxCharacters - raw.length;
        raw += value.slice(0, available);
        if (value.length > available) truncated = true;
        if (raw.length >= maxCharacters) break;
      }
      continue;
    }

    const children = Array.from(visit.element.children);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({ element: children[index], depth: visit.depth + 1, hidden });
    }
  }
  if (raw.length >= maxCharacters && stack.length > 0) truncated = true;
  return {
    text: raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n'),
    truncated,
  };
}

export async function extractPptxLessonSource(
  file: File,
  options: LessonSourceImportOptions = {},
): Promise<LessonSourceExtraction> {
  if (options.signal?.aborted) {
    throw cancelled();
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (options.signal?.aborted) throw cancelled();
  const preflight = preflightArchive(bytes);
  for (const required of ['[Content_Types].xml', 'ppt/presentation.xml', 'ppt/_rels/presentation.xml.rels']) {
    if (!preflight.names.has(required)) {
      throw new LessonSourceImportError('malformed-file', `The PowerPoint file is missing ${required}.`);
    }
  }
  const manifestNames = new Set([
    '[Content_Types].xml',
    'ppt/presentation.xml',
    'ppt/_rels/presentation.xml.rels',
  ]);
  const actualBudget = { inflated: 0 };
  let manifests: Record<string, Uint8Array>;
  try {
    manifests = await extractSelectedXml(
      bytes,
      preflight,
      manifestNames,
      actualBudget,
      options.signal,
    );
  } catch (error) {
    if (error instanceof LessonSourceImportError) throw error;
    throw new LessonSourceImportError(
      'malformed-file',
      'The PowerPoint ZIP content could not be read safely.',
      { cause: error },
    );
  }
  const contentTypes = strFromU8(manifests['[Content_Types].xml'] ?? new Uint8Array());
  if (!contentTypes.includes(PRESENTATION_CONTENT_TYPE)) {
    throw new LessonSourceImportError(
      'unsupported-format',
      'This ZIP is not a macro-free PowerPoint presentation (.pptx).',
    );
  }
  const orderedSlides = slideOrder(manifests);
  let slideFiles: Record<string, Uint8Array>;
  try {
    slideFiles = await extractSelectedXml(
      bytes,
      preflight,
      new Set(orderedSlides),
      actualBudget,
      options.signal,
    );
  } catch (error) {
    if (error instanceof LessonSourceImportError) throw error;
    throw new LessonSourceImportError(
      'malformed-file',
      'The referenced PowerPoint slides could not be read safely.',
      { cause: error },
    );
  }
  const sections: LessonSourceExtraction['sections'][number][] = [];
  const warnings: string[] = [];
  let truncatedSlides = 0;
  for (let index = 0; index < orderedSlides.length; index += 1) {
    if (index > 0) await yieldToBrowser();
    if (options.signal?.aborted) {
      throw cancelled();
    }
    const bounded = slideText(
      slideFiles[orderedSlides[index]],
      `slide ${index + 1}`,
      LESSON_SOURCE_LIMITS.maxCharactersPerUnit,
      options.signal,
    );
    if (bounded.truncated) truncatedSlides += 1;
    if (bounded.text) sections.push({ index: index + 1, label: `Slide ${index + 1}`, text: bounded.text });
  }
  if (sections.length < orderedSlides.length) {
    warnings.push(`${orderedSlides.length - sections.length} slide(s) had no imported text and were not added to the draft.`);
  }
  if (truncatedSlides > 0) {
    warnings.push(`Text on ${truncatedSlides} slide(s) reached a safe extraction limit and was shortened.`);
  }
  return {
    format: 'pptx',
    sections,
    unitCount: orderedSlides.length,
    warnings,
  };
}
