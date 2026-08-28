/**
 * Browser-local PDF/PPTX -> lesson-draft extraction.
 *
 * The source file is never persisted or uploaded. Format-specific parsers
 * return selectable PDF text or text from non-hidden PowerPoint slides; this
 * module bounds and normalizes that
 * text into an educator-reviewable outline.
 */

export const LESSON_SOURCE_LIMITS = Object.freeze({
  maxFileBytes: 25 * 1024 * 1024,
  maxUnits: 80,
  maxCharacters: 60_000,
  maxCharactersPerUnit: 12_000,
  maxTextItemsPerUnit: 20_000,
  maxArchiveEntries: 2_048,
  maxArchiveEntryBytes: 8 * 1024 * 1024,
  maxManifestXmlBytes: 2 * 1024 * 1024,
  maxArchiveInflatedBytes: 96 * 1024 * 1024,
  maxCompressionRatio: 200,
  maxXmlNodesPerUnit: 100_000,
  maxXmlTagCharacters: 65_536,
  maxXmlDepth: 256,
});

export type LessonSourceFormat = 'pdf' | 'pptx';

export interface LessonSourceSection {
  index: number;
  label: string;
  text: string;
}

export interface LessonSourceExtraction {
  format: LessonSourceFormat;
  sections: readonly LessonSourceSection[];
  unitCount: number;
  warnings?: readonly string[];
}

export interface LessonSourceOutline extends LessonSourceExtraction {
  titleCandidate: string | null;
  objectiveCandidates: readonly string[];
  teachingNoteDraft: string;
  detectedLinks: readonly string[];
  extractedCharacters: number;
  warnings: readonly string[];
}

export type LessonSourceImportErrorCode =
  | 'empty-file'
  | 'file-too-large'
  | 'unsupported-format'
  | 'signature-mismatch'
  | 'encrypted-file'
  | 'malformed-file'
  | 'too-many-units'
  | 'archive-limit'
  | 'no-readable-text'
  | 'cancelled';

export class LessonSourceImportError extends Error {
  readonly code: LessonSourceImportErrorCode;

  constructor(code: LessonSourceImportErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'LessonSourceImportError';
    this.code = code;
  }
}

export interface LessonSourceImportOptions {
  signal?: AbortSignal;
}

function extension(name: string): string {
  const leaf = name.split(/[\\/]/).at(-1) ?? '';
  const dot = leaf.lastIndexOf('.');
  return dot > 0 ? leaf.slice(dot + 1).toLocaleLowerCase('en-US') : '';
}

function assertNotCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new LessonSourceImportError('cancelled', 'Document import was cancelled.');
  }
}

function sniffFormat(header: Uint8Array): LessonSourceFormat | null {
  const pdf = new TextDecoder('latin1').decode(header).indexOf('%PDF-');
  if (pdf >= 0) return 'pdf';
  if (
    header.length >= 4
    && header[0] === 0x50
    && header[1] === 0x4b
    && (
      (header[2] === 0x03 && header[3] === 0x04)
      || (header[2] === 0x05 && header[3] === 0x06)
      || (header[2] === 0x07 && header[3] === 0x08)
    )
  ) return 'pptx';
  return null;
}

function cleanLine(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function normalizedLines(sections: readonly LessonSourceSection[]): string[] {
  return sections.flatMap((section) => section.text.split(/\r?\n/).map(cleanLine).filter(Boolean));
}

function stripBullet(value: string): string {
  return value
    .replace(/^\s*(?:[-*•▪◦]|\d{1,2}[.)]|[a-z][.)])\s*/i, '')
    .replace(/^(?:learners?|students?)\s+(?:will|should|can)\s+/i, '')
    .trim();
}

function deriveObjectiveCandidates(lines: readonly string[], title: string | null): string[] {
  const candidates: string[] = [];
  let afterObjectiveHeading = 0;
  const add = (raw: string) => {
    const value = stripBullet(raw).replace(/[.;:]$/, '').trim();
    if (
      value.length < 18
      || value.length > 240
      || value === title
      || /https?:\/\//i.test(value)
      || /^(?:references?|sources?|bibliography)\b/i.test(value)
      || /^(objectives?|learning outcomes?|goals?)$/i.test(value)
      || candidates.some((entry) => entry.toLocaleLowerCase('en-US') === value.toLocaleLowerCase('en-US'))
    ) return;
    candidates.push(value);
  };

  for (const line of lines) {
    if (/^(?:learning\s+)?(?:objectives?|outcomes?|goals?)\s*:?\s*$/i.test(line)) {
      afterObjectiveHeading = 8;
      continue;
    }
    const bullet = /^\s*(?:[-*•▪◦]|\d{1,2}[.)])\s+/.test(line);
    const explicit = /^(?:learners?|students?)\s+(?:will|should|can)\s+/i.test(line);
    if (afterObjectiveHeading > 0 || explicit || (bullet && /\b(?:identify|describe|explain|compare|apply|analy[sz]e|evaluate|recognize|interpret|differentiate|demonstrate|summarize)\b/i.test(line))) {
      add(line);
    }
    if (afterObjectiveHeading > 0) afterObjectiveHeading -= 1;
    if (candidates.length >= 6) break;
  }

  if (candidates.length === 0) {
    for (const line of lines) {
      if (/[.!?]$/.test(line) && !/^https?:\/\//i.test(line)) add(line);
      if (candidates.length >= 3) break;
    }
  }
  return candidates;
}

function detectLinks(text: string): string[] {
  const values = new Set<string>();
  for (const match of text.matchAll(/https:\/\/[^\s<>()\[\]{}"']+/gi)) {
    values.add(match[0].replace(/[.,;:!?]+$/, ''));
    if (values.size >= 20) break;
  }
  for (const match of text.matchAll(/\b10\.\d{4,9}\/[-._;()/:a-z0-9]+\b/gi)) {
    values.add(`doi:${match[0].replace(/[.,;:!?]+$/, '')}`);
    if (values.size >= 20) break;
  }
  return [...values];
}

export function buildLessonSourceOutline(
  extraction: LessonSourceExtraction,
): LessonSourceOutline {
  const warnings = [...(extraction.warnings ?? [])];
  let remaining = LESSON_SOURCE_LIMITS.maxCharacters;
  const sections: LessonSourceSection[] = [];
  for (const section of extraction.sections) {
    if (remaining <= 0) break;
    const cleaned = section.text
      .split(/\r?\n/)
      .map(cleanLine)
      .filter(Boolean)
      .join('\n')
      .slice(0, Math.min(LESSON_SOURCE_LIMITS.maxCharactersPerUnit, remaining));
    if (!cleaned) continue;
    sections.push({ ...section, text: cleaned });
    remaining -= cleaned.length;
  }
  const combined = sections.map((section) => section.text).join('\n');
  if (!combined.trim()) {
    throw new LessonSourceImportError(
      'no-readable-text',
      extraction.format === 'pdf'
        ? 'No selectable text was found. This may be a scanned PDF; run OCR or export a text-enabled PDF, then try again.'
        : 'No slide text was found. Add text to a non-hidden slide or start the lesson manually.',
    );
  }
  if (remaining <= 0) {
    warnings.push(`Only the first ${LESSON_SOURCE_LIMITS.maxCharacters.toLocaleString()} readable characters were included.`);
  }
  const lines = normalizedLines(sections);
  const titleCandidate = lines.find((line) => (
    line.length >= 4
    && line.length <= 160
    && !/^https?:\/\//i.test(line)
    && !/^(?:page|slide)\s+\d+$/i.test(line)
    && !/^(?:overview|agenda|contents?|objectives?|learning outcomes?|goals?|references?)\s*:?$/i.test(line)
  )) ?? null;
  const objectiveCandidates = deriveObjectiveCandidates(lines, titleCandidate);
  if (objectiveCandidates.length === 0) {
    warnings.push('No clear learning-objective lines were detected. Add objectives manually after applying the draft.');
  }
  const unitName = extraction.format === 'pdf' ? 'Page' : 'Slide';
  const teachingNoteDraft = sections
    .map((section) => `## ${unitName} ${section.index}\n${section.text}`)
    .join('\n\n');
  return {
    ...extraction,
    sections,
    titleCandidate,
    objectiveCandidates,
    teachingNoteDraft,
    detectedLinks: detectLinks(combined),
    extractedCharacters: combined.length,
    warnings,
  };
}

export async function importLessonSource(
  file: File,
  options: LessonSourceImportOptions = {},
): Promise<LessonSourceOutline> {
  assertNotCancelled(options.signal);
  if (file.size === 0) {
    throw new LessonSourceImportError('empty-file', 'The selected file is empty. Choose a PDF or PowerPoint file.');
  }
  if (file.size > LESSON_SOURCE_LIMITS.maxFileBytes) {
    throw new LessonSourceImportError(
      'file-too-large',
      `The document is larger than ${Math.floor(LESSON_SOURCE_LIMITS.maxFileBytes / 1024 / 1024)} MB. Split it into a smaller teaching file and try again.`,
    );
  }
  const ext = extension(file.name);
  if (ext === 'ppt' || ext === 'pptm') {
    throw new LessonSourceImportError(
      'unsupported-format',
      `.${ext} files are not supported. Save a macro-free .pptx copy and try again.`,
    );
  }
  if (ext && ext !== 'pdf' && ext !== 'pptx') {
    throw new LessonSourceImportError(
      'unsupported-format',
      'Choose one .pdf or .pptx file. Images belong in Case Studio.',
    );
  }
  const header = new Uint8Array(await file.slice(0, 1_024).arrayBuffer());
  assertNotCancelled(options.signal);
  const format = sniffFormat(header);
  if (!format) {
    throw new LessonSourceImportError(
      'unsupported-format',
      'The file contents are not a supported PDF or PowerPoint presentation.',
    );
  }
  if (ext && ext !== format) {
    throw new LessonSourceImportError(
      'signature-mismatch',
      `The .${ext} extension does not match the file contents. Export a fresh ${format.toUpperCase()} copy and try again.`,
    );
  }

  let extraction: LessonSourceExtraction;
  if (format === 'pdf') {
    const { extractPdfLessonSource } = await import('./pdfLessonSource');
    extraction = await extractPdfLessonSource(file, options);
  } else {
    const { extractPptxLessonSource } = await import('./pptxLessonSource');
    extraction = await extractPptxLessonSource(file, options);
  }
  assertNotCancelled(options.signal);
  return buildLessonSourceOutline(extraction);
}
