import { Inflate } from 'fflate';

export const LESSON_OBJECTIVES_LIMITS = Object.freeze({
  maxFileBytes: 8 * 1024 * 1024,
  maxArchiveEntries: 2_048,
  maxArchiveEntryBytes: 4 * 1024 * 1024,
  maxExpandedBytes: 16 * 1024 * 1024,
  maxCompressionRatio: 200,
  maxSheets: 32,
  maxTableRows: 2_000,
  maxRows: 200,
  maxColumns: 128,
  maxSharedStrings: 20_000,
  maxCellCharacters: 4_000,
  maxCharacters: 200_000,
  maxHeaderRows: 25,
  maxSlideNumber: 80,
  maxXmlMarkup: 150_000,
  maxXmlDepth: 64,
});

export interface LessonObjectiveImportRow {
  rowNumber: number;
  level: string;
  objective: string;
  evidence: string;
  answerKey: string;
  hint: string;
  slides: readonly number[];
  sourceUrl?: string;
}

export interface LessonObjectivesImportResult {
  sheetName: string;
  rows: LessonObjectiveImportRow[];
  warnings: string[];
}

export type LessonObjectivesImportErrorCode =
  | 'unsupported-format' | 'empty-file' | 'file-too-large' | 'malformed-file'
  | 'archive-limit' | 'table-limit' | 'missing-columns' | 'invalid-row' | 'cancelled';

export class LessonObjectivesImportError extends Error {
  constructor(readonly code: LessonObjectivesImportErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'LessonObjectivesImportError';
  }
}

const L = LESSON_OBJECTIVES_LIMITS;
const REQUIRED = ['level', 'objective', 'evidence', 'answerKey'] as const;
type Column = (typeof REQUIRED)[number] | 'hint' | 'slides' | 'sourceUrl';
const LABELS: Record<Column, string> = {
  level: 'Level', objective: 'Objective', evidence: 'Expected evidence',
  answerKey: 'Answer key', hint: 'Hint', slides: 'Slides', sourceUrl: 'Source URL',
};
const normalize = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const ALIASES: Record<Column, readonly string[]> = {
  level: ['level', 'learner level', 'learning level', 'audience', 'training level'],
  objective: ['objective', 'objectives', 'learning objective', 'learning objectives', 'learning outcome', 'outcome'],
  evidence: ['expected evidence', 'evidence', 'evidence of learning', 'success criteria', 'assessment criteria'],
  answerKey: ['answer key', 'answer', 'model answer', 'expected answer', 'correct answer', 'educator answer key'],
  hint: ['hint', 'hints', 'teaching hint', 'suggested hint'],
  slides: ['slides', 'slide', 'slide numbers', 'slide number', 'slide references', 'source slides'],
  sourceUrl: ['source url', 'source link', 'reference url', 'reference link', 'url'],
};
const HEADERS = new Map(Object.entries(ALIASES).flatMap(([column, aliases]) =>
  aliases.map((alias) => [normalize(alias), column as Column] as const)));
const LEVELS = new Set([
  'hs', 'highschool', 'undergrad', 'undergraduate', 'step1', 'prestep1',
  'poststep1', 'step2', 'resident', 'residency',
]);
const SS_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const STRICT_SS_NS = 'http://purl.oclc.org/ooxml/spreadsheetml/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const STRICT_REL_NS = 'http://purl.oclc.org/ooxml/officeDocument/relationships';

function fail(code: LessonObjectivesImportErrorCode, message: string): never {
  throw new LessonObjectivesImportError(code, message);
}

function checkCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) fail('cancelled', 'Objective import was cancelled.');
}

async function pause(signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
  checkCancelled(signal);
}

async function readFile(file: File, signal?: AbortSignal): Promise<Uint8Array> {
  checkCancelled(signal);
  let onAbort: (() => void) | undefined;
  try {
    const buffer = await Promise.race([
      file.arrayBuffer(),
      new Promise<never>((_, reject) => {
        onAbort = () => reject(new LessonObjectivesImportError('cancelled', 'Objective import was cancelled.'));
        signal?.addEventListener('abort', onAbort, { once: true });
        if (signal?.aborted) onAbort();
      }),
    ]);
    checkCancelled(signal);
    if (buffer.byteLength > L.maxFileBytes) fail('file-too-large', 'The spreadsheet is larger than 8 MB.');
    return new Uint8Array(buffer);
  } finally {
    if (onAbort) signal?.removeEventListener('abort', onAbort);
  }
}

function decode(bytes: Uint8Array): string {
  const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le'
    : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8';
  try {
    return new TextDecoder(encoding, { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
  } catch {
    return fail('malformed-file', 'The spreadsheet text could not be read. Export a fresh UTF-8 CSV or .xlsx file.');
  }
}

interface Cell { text: string; formula?: boolean; problem?: string }
interface TableRow { rowNumber: number; cells: Map<number, Cell> }
interface Header { index: number; columns: Map<Column, number>; duplicates: Column[] }

function findHeader(rows: readonly TableRow[]): Header | undefined {
  let best: Header | undefined;
  for (let index = 0; index < Math.min(rows.length, L.maxHeaderRows); index += 1) {
    const columns = new Map<Column, number>();
    const duplicates: Column[] = [];
    for (const [cellIndex, cell] of rows[index].cells) {
      // Column identity must be literal text, never a formula's potentially stale result.
      const column = !cell.formula && !cell.problem ? HEADERS.get(normalize(cell.text)) : undefined;
      if (!column) continue;
      if (columns.has(column)) duplicates.push(column);
      else columns.set(column, cellIndex);
    }
    const candidate = { index, columns, duplicates };
    if (REQUIRED.every((column) => columns.has(column))) return candidate;
    const previousColumns = best?.columns;
    if (!best || REQUIRED.filter((column) => columns.has(column)).length
      > REQUIRED.filter((column) => previousColumns?.has(column)).length) best = candidate;
  }
  return best && best.columns.size > 0 ? best : undefined;
}

function rowError(sheet: string, row: number, column: Column, message: string): never {
  return fail('invalid-row', `${sheet}, row ${row}: ${LABELS[column]} ${message}`);
}

function slideNumbers(value: string, sheet: string, row: number): readonly number[] {
  if (!value) return [];
  const numbers = new Set<number>();
  const normalized = value.replace(/[–—]/g, '-').replace(/\s*-\s*/g, '-');
  for (const part of normalized.split(/[,;\s]+/).filter(Boolean)) {
    const match = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!match) rowError(sheet, row, 'slides', 'must contain slide numbers or ranges, such as 1, 3-5.');
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (start < 1 || end < start || end > L.maxSlideNumber) {
      rowError(sheet, row, 'slides', `must be between 1 and ${L.maxSlideNumber}, with ranges in ascending order.`);
    }
    for (let slide = start; slide <= end; slide += 1) numbers.add(slide);
  }
  return [...numbers].sort((a, b) => a - b);
}

async function assembleTable(
  sheetName: string, table: readonly TableRow[], header: Header | undefined, signal?: AbortSignal,
): Promise<LessonObjectivesImportResult> {
  const missing = REQUIRED.filter((column) => !header?.columns.has(column));
  if (!header || missing.length > 0) {
    fail('missing-columns', `${sheetName}: add the required column${missing.length === 1 ? '' : 's'} ${missing.map((column) => LABELS[column]).join(', ')} in the first ${L.maxHeaderRows} rows.`);
  }
  if (header.duplicates.length) {
    fail('missing-columns', `${sheetName}, row ${table[header.index].rowNumber}: use only one ${LABELS[header.duplicates[0]]} column.`);
  }
  const rows: LessonObjectiveImportRow[] = [];
  const warnings: string[] = [];
  const formulaRows: number[] = [];
  let characters = 0;
  for (let index = header.index + 1; index < table.length; index += 1) {
    if (index % 50 === 0) await pause(signal);
    checkCancelled(signal);
    const input = table[index];
    const values = {} as Record<Column, string>;
    let hasFormula = false;
    let hasContent = false;
    for (const column of Object.keys(LABELS) as Column[]) {
      const columnIndex = header.columns.get(column);
      const cell = columnIndex === undefined ? undefined : input.cells.get(columnIndex);
      values[column] = cell?.text.trim() ?? '';
      hasContent ||= !!(values[column] || cell?.formula || cell?.problem);
      hasFormula ||= !!cell?.formula;
      if (cell?.problem) rowError(sheetName, input.rowNumber, column, cell.problem);
    }
    if (!hasContent) continue;
    for (const column of REQUIRED) {
      if (!values[column]) rowError(sheetName, input.rowNumber, column, 'is required.');
    }
    if (!LEVELS.has(normalize(values.level))) {
      rowError(sheetName, input.rowNumber, 'level', 'must be HS / High school, Undergrad, Step1, Post-Step1, Step2, or Resident.');
    }
    if (values.sourceUrl) {
      try {
        const url = new URL(values.sourceUrl);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
      } catch {
        rowError(sheetName, input.rowNumber, 'sourceUrl', 'must be a complete http:// or https:// address without a username or password.');
      }
    }
    characters += Object.values(values).reduce((total, value) => total + value.length, 0);
    if (characters > L.maxCharacters || rows.length >= L.maxRows) {
      fail('table-limit', `Use a teaching excerpt with at most ${L.maxRows} objectives and ${L.maxCharacters.toLocaleString('en-US')} text characters.`);
    }
    if (hasFormula) formulaRows.push(input.rowNumber);
    rows.push({
      rowNumber: input.rowNumber, level: values.level, objective: values.objective,
      evidence: values.evidence, answerKey: values.answerKey, hint: values.hint,
      slides: slideNumbers(values.slides, sheetName, input.rowNumber),
      ...(values.sourceUrl ? { sourceUrl: values.sourceUrl } : {}),
    });
  }
  if (rows.length === 0) fail('invalid-row', `${sheetName}: add at least one objective below the column headings.`);
  if (formulaRows.length) {
    warnings.push(`${sheetName}, row${formulaRows.length === 1 ? '' : 's'} ${formulaRows.join(', ')}: imported saved formula results only. Formulas were not recalculated; verify these values or paste values before importing.`);
  }
  checkCancelled(signal);
  return { sheetName, rows, warnings };
}

function csvRows(source: string): TableRow[] {
  if (source.includes('\0')) fail('malformed-file', 'The CSV contains unreadable text. Export a fresh UTF-8 CSV.');
  let delimiter = ',';
  let lineOffset = 0;
  const separator = /^sep=([,;\t])\r?\n/i.exec(source);
  if (separator) {
    delimiter = separator[1];
    source = source.slice(separator[0].length);
    lineOffset = 1;
  } else {
    // Recognizable headers allow both comma and locale-specific semicolon exports.
    let best = 0;
    for (const candidate of [',', ';', '\t']) {
      for (const line of source.split(/\r?\n/, L.maxHeaderRows)) {
        const score = line.split(candidate).filter((cell) => HEADERS.has(normalize(cell))).length;
        if (score > best) { delimiter = candidate; best = score; }
      }
    }
  }
  const rows: TableRow[] = [];
  let cells = new Map<number, Cell>();
  let cell = '';
  let quoted = false;
  let closedQuote = false;
  let line = 1 + lineOffset;
  let rowNumber = line;
  const addCell = () => {
    if (cells.size >= L.maxColumns) fail('table-limit', `The CSV has more than ${L.maxColumns} columns.`);
    cells.set(cells.size, { text: cell.trim() });
    cell = '';
    closedQuote = false;
  };
  const addRow = () => {
    addCell();
    if (rows.length >= L.maxTableRows) fail('table-limit', `The CSV has more than ${L.maxTableRows} rows. Use a smaller excerpt.`);
    rows.push({ rowNumber, cells });
    cells = new Map();
  };
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') { cell += '"'; index += 1; }
        else { quoted = false; closedQuote = true; }
      } else {
        cell += character;
        if (character === '\n' || (character === '\r' && source[index + 1] !== '\n')) line += 1;
      }
    } else if (character === delimiter) addCell();
    else if (character === '\n' || character === '\r') {
      addRow();
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      line += 1;
      rowNumber = line;
    } else if (character === '"' && !cell && !closedQuote) quoted = true;
    else if (character === '"' || (closedQuote && !/\s/.test(character))) {
      fail('malformed-file', `CSV, row ${rowNumber}: a quoted cell is malformed. Export a fresh CSV copy.`);
    } else if (!closedQuote) cell += character;
    if (cell.length > L.maxCellCharacters) fail('table-limit', `CSV, row ${rowNumber}: a cell exceeds ${L.maxCellCharacters} characters.`);
  }
  if (quoted) fail('malformed-file', `CSV, row ${rowNumber}: a quoted cell is not closed.`);
  if (cell || closedQuote || cells.size) addRow();
  return rows;
}

const u16 = (bytes: Uint8Array, offset: number): number => bytes[offset] | (bytes[offset + 1] << 8);
const u32 = (bytes: Uint8Array, offset: number): number =>
  (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
interface Entry { method: number; start: number; end: number; expanded: number }
const selectedPath = (name: string): boolean => name === '[Content_Types].xml'
  || name === 'xl/workbook.xml' || name === 'xl/_rels/workbook.xml.rels'
  || name === 'xl/sharedStrings.xml' || /^xl\/worksheets\/[^/]+\.xml$/.test(name);

/** Inspect bounded ZIP metadata, then inflate only workbook text parts on demand. */
function archiveEntries(bytes: Uint8Array): Map<string, Entry> {
  const bad = (message: string): never => fail('archive-limit', message);
  let eocd = -1;
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65_557); index -= 1) {
    if (u32(bytes, index) === 0x06054b50 && index + 22 + u16(bytes, index + 20) === bytes.length) {
      eocd = index; break;
    }
  }
  if (eocd < 0) bad('The XLSX ZIP directory is missing or incomplete.');
  const count = u16(bytes, eocd + 10);
  const centralSize = u32(bytes, eocd + 12);
  const centralStart = u32(bytes, eocd + 16);
  if (u16(bytes, eocd + 4) || u16(bytes, eocd + 6) || u16(bytes, eocd + 8) !== count
    || count === 0xffff || centralSize === 0xffffffff || centralStart === 0xffffffff
    || (eocd >= 20 && u32(bytes, eocd - 20) === 0x07064b50)) {
    bad('Multi-disk and ZIP64 workbooks are not supported. Export a smaller .xlsx file.');
  }
  if (count > L.maxArchiveEntries) bad(`The workbook has more than ${L.maxArchiveEntries} archive entries.`);
  if (centralStart + centralSize !== eocd) bad('The XLSX ZIP directory is inconsistent.');
  const entries = new Map<string, Entry>();
  const names = new Set<string>();
  const ranges: Array<readonly [number, number]> = [];
  let offset = centralStart;
  let totalExpanded = 0;
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > eocd || u32(bytes, offset) !== 0x02014b50) bad('The XLSX ZIP directory is malformed.');
    const flags = u16(bytes, offset + 8);
    const method = u16(bytes, offset + 10);
    const compressed = u32(bytes, offset + 20);
    const expanded = u32(bytes, offset + 24);
    const nameLength = u16(bytes, offset + 28);
    const end = offset + 46 + nameLength + u16(bytes, offset + 30) + u16(bytes, offset + 32);
    const local = u32(bytes, offset + 42);
    if (end > eocd) bad('An XLSX ZIP entry is truncated.');
    const name = decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if (!name || name.includes('\\') || name.includes('\0') || name.startsWith('/')
      || name.replace(/\/$/, '').split('/').some((part) => !part || part === '.' || part === '..') || names.has(name)) {
      bad('The workbook contains an invalid or duplicated archive path.');
    }
    names.add(name);
    if (flags & 1) bad('Password-protected workbooks are not supported. Export an unprotected .xlsx copy.');
    if (/vbaProject\.bin$/i.test(name)) fail('unsupported-format', 'Macro-enabled workbooks are not supported. Save a macro-free .xlsx copy.');
    if (selectedPath(name)) {
      totalExpanded += expanded;
      if (expanded > L.maxArchiveEntryBytes || compressed > L.maxArchiveEntryBytes || totalExpanded > L.maxExpandedBytes
        || (expanded && (!compressed || expanded / compressed > L.maxCompressionRatio))) {
        bad('The expanded workbook text is too large. Export a smaller objective table.');
      }
      if (method !== 0 && method !== 8) bad('The workbook uses an unsupported ZIP compression method.');
      if (method === 0 && expanded !== compressed) bad('An XLSX entry has inconsistent sizes.');
      if (local + 30 > centralStart || u32(bytes, local) !== 0x04034b50) bad('An XLSX entry has an invalid local header.');
      const localNameLength = u16(bytes, local + 26);
      const start = local + 30 + localNameLength + u16(bytes, local + 28);
      const dataEnd = start + compressed;
      if (start > centralStart || dataEnd > centralStart || u16(bytes, local + 8) !== method
        || u16(bytes, local + 6) !== flags
        || decode(bytes.subarray(local + 30, local + 30 + localNameLength)) !== name
        || ranges.some(([rangeStart, rangeEnd]) => local < rangeEnd && dataEnd > rangeStart)) {
        bad('An XLSX entry has inconsistent or overlapping data.');
      }
      ranges.push([local, dataEnd]);
      entries.set(name, { method, start, end: dataEnd, expanded });
    }
    offset = end;
  }
  if (offset !== eocd) bad('The XLSX ZIP directory size is inconsistent.');
  return entries;
}

function xml(bytes: Uint8Array, label: string): XMLDocument {
  const source = decode(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) fail('malformed-file', `${label} contains an unsupported XML declaration.`);
  let markup = 0;
  let depth = 0;
  // Bound DOM construction as well as decompression; quoted > characters do not end a tag.
  for (let cursor = 0; cursor < source.length;) {
    const start = source.indexOf('<', cursor);
    if (start < 0) break;
    markup += 1;
    if (source.startsWith('<!--', start) || source.startsWith('<![CDATA[', start) || source.startsWith('<?', start)) {
      const terminator = source.startsWith('<!--', start) ? '-->' : source.startsWith('<?', start) ? '?>' : ']]>';
      const end = source.indexOf(terminator, start + 2);
      cursor = end < 0 ? source.length : end + terminator.length;
    } else {
      let quote = '';
      let end = start + 1;
      for (; end < source.length; end += 1) {
        if (end - start > 8_192) fail('archive-limit', `${label} has an XML tag that is too large.`);
        const character = source[end];
        if (quote) { if (character === quote) quote = ''; }
        else if (character === '"' || character === "'") quote = character;
        else if (character === '=') markup += 1;
        else if (character === '>') break;
      }
      const tag = source.slice(start, end + 1);
      if (tag.startsWith('</')) depth -= 1;
      else if (!tag.endsWith('/>')) depth += 1;
      if (depth > L.maxXmlDepth) fail('archive-limit', `${label} is nested too deeply.`);
      cursor = end + 1;
    }
    if (markup > L.maxXmlMarkup) fail('archive-limit', `${label} contains too much XML markup.`);
  }
  const document = new DOMParser().parseFromString(source, 'application/xml');
  if (document.getElementsByTagName('parsererror').length) fail('malformed-file', `${label} is not valid XML.`);
  return document;
}

function children(parent: Element, localName: string): Element[] {
  return Array.from(parent.children).filter((child) => child.localName === localName && child.namespaceURI === parent.namespaceURI);
}

function spreadsheetRoot(document: XMLDocument, localName: string, label: string): Element {
  const root = document.documentElement;
  if (root.localName !== localName || ![SS_NS, STRICT_SS_NS].includes(root.namespaceURI ?? '')) {
    fail('malformed-file', `${label} is not a supported XLSX ${localName}.`);
  }
  return root;
}

function stringText(element?: Element): string {
  if (!element) return '';
  // Text and rich-text runs only: omit phonetic annotations and metadata.
  const text = children(element, 't').map((node) => node.textContent ?? '').join('')
    + children(element, 'r').flatMap((run) => children(run, 't').map((node) => node.textContent ?? '')).join('');
  if (text.length > L.maxCellCharacters) fail('table-limit', `A spreadsheet cell exceeds ${L.maxCellCharacters} characters.`);
  return text;
}

function worksheetRows(document: XMLDocument, shared: readonly string[], sheetName: string): TableRow[] {
  const root = spreadsheetRoot(document, 'worksheet', sheetName);
  const sheetData = children(root, 'sheetData')[0];
  if (!sheetData) return [];
  const inputRows = children(sheetData, 'row');
  if (inputRows.length > L.maxTableRows) fail('table-limit', `${sheetName} has more than ${L.maxTableRows} rows. Use a smaller excerpt.`);
  const rows: TableRow[] = [];
  let previousRow = 0;
  for (const row of inputRows) {
    const rowNumber = Number(row.getAttribute('r') ?? previousRow + 1);
    if (!Number.isInteger(rowNumber) || rowNumber <= previousRow || rowNumber > 1_048_576) {
      fail('malformed-file', `${sheetName} has invalid or duplicated row numbers.`);
    }
    previousRow = rowNumber;
    if (['1', 'true'].includes(row.getAttribute('hidden') ?? '')) continue;
    const cells = new Map<number, Cell>();
    let previousColumn = -1;
    for (const input of children(row, 'c')) {
      const reference = input.getAttribute('r');
      const match = reference ? /^([A-Z]{1,3})([1-9]\d*)$/i.exec(reference) : null;
      if (reference && (!match || Number(match[2]) !== rowNumber)) fail('malformed-file', `${sheetName}, row ${rowNumber}: a cell address is invalid.`);
      let column = previousColumn + 1;
      if (match) column = [...match[1].toUpperCase()].reduce((number, letter) => number * 26 + letter.charCodeAt(0) - 64, 0) - 1;
      if (column >= L.maxColumns || cells.size >= L.maxColumns) fail('table-limit', `${sheetName} exceeds ${L.maxColumns} columns. Use a smaller excerpt.`);
      if (cells.has(column)) fail('malformed-file', `${sheetName}, row ${rowNumber}: a cell address is duplicated.`);
      previousColumn = column;
      const formula = children(input, 'f').length > 0;
      const type = input.getAttribute('t') ?? 'n';
      const cached = children(input, 'v')[0]?.textContent;
      let text = '';
      let problem: string | undefined;
      if (formula && (cached === undefined || cached === '')) problem = 'has a formula without a saved value. Recalculate and save the workbook, or paste values.';
      else if (type === 'inlineStr' && !formula) text = stringText(children(input, 'is')[0]);
      else if (type === 's') {
        const index = Number(cached);
        if (cached === undefined || !/^\d+$/.test(cached) || !Number.isInteger(index) || index >= shared.length) problem = 'has an unreadable shared-string value. Export a fresh workbook.';
        else text = shared[index];
      } else if (type === 'b' && cached !== undefined) {
        if (cached === '1' || cached === '0') text = cached === '1' ? 'TRUE' : 'FALSE';
        else problem = 'has an unreadable Boolean value.';
      } else if (['n', 'str', 'd'].includes(type)) {
        text = cached ?? '';
        if (type === 'n' && text && !Number.isFinite(Number(text))) problem = 'has an unreadable numeric value.';
      } else if (type === 'e') problem = 'contains a spreadsheet error. Replace it with a reviewed value.';
      else problem = 'does not contain a supported saved text or scalar value.';
      if (text.length > L.maxCellCharacters) fail('table-limit', `${sheetName}, row ${rowNumber}: a cell exceeds ${L.maxCellCharacters} characters.`);
      cells.set(column, { text, ...(formula ? { formula: true } : {}), ...(problem ? { problem } : {}) });
    }
    rows.push({ rowNumber, cells });
  }
  return rows;
}

function internalTarget(target: string): string | undefined {
  if (!target || target.includes('\\') || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//') || /[?#%\0]/.test(target)) return;
  const segments: string[] = [];
  for (const part of (target.startsWith('/') ? target.slice(1) : `xl/${target}`).split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { if (!segments.length) return; segments.pop(); }
    else segments.push(part);
  }
  const path = segments.join('/');
  return selectedPath(path) ? path : undefined;
}

async function importXlsx(bytes: Uint8Array, signal?: AbortSignal): Promise<LessonObjectivesImportResult> {
  const entries = archiveEntries(bytes);
  let actualExpanded = 0;
  const documents = new Map<string, XMLDocument>();
  const readXml = async (path: string): Promise<XMLDocument> => {
    const cachedDocument = documents.get(path);
    if (cachedDocument) return cachedDocument;
    await pause(signal);
    const entry = entries.get(path);
    if (!entry) fail('malformed-file', `The workbook is missing ${path}. Export a fresh .xlsx copy.`);
    let output: Uint8Array;
    if (entry.method === 0) {
      output = bytes.subarray(entry.start, entry.end);
      actualExpanded += output.length;
    } else {
      output = new Uint8Array(entry.expanded);
      let written = 0;
      const inflator = new Inflate((chunk) => {
        written += chunk.length;
        actualExpanded += chunk.length;
        if (written > entry.expanded || actualExpanded > L.maxExpandedBytes) fail('archive-limit', 'The workbook expands beyond its permitted size.');
        output.set(chunk, written - chunk.length);
      });
      for (let offset = entry.start; offset < entry.end; offset += 4_096) {
        checkCancelled(signal);
        const end = Math.min(offset + 4_096, entry.end);
        inflator.push(bytes.subarray(offset, end), end === entry.end);
        if ((offset - entry.start) % 65_536 === 0) await pause(signal);
      }
      if (written !== entry.expanded) fail('archive-limit', 'A workbook entry does not match its declared size.');
    }
    if (actualExpanded > L.maxExpandedBytes) fail('archive-limit', 'The expanded workbook is too large.');
    checkCancelled(signal);
    const document = xml(output, path);
    documents.set(path, document);
    return document;
  };

  const contentTypes = (await readXml('[Content_Types].xml')).documentElement;
  if (contentTypes.localName !== 'Types' || contentTypes.namespaceURI !== 'http://schemas.openxmlformats.org/package/2006/content-types') {
    fail('malformed-file', 'The workbook has an invalid content-type declaration. Export a fresh .xlsx copy.');
  }
  const workbookOverrides = children(contentTypes, 'Override').filter((entry) => entry.getAttribute('PartName') === '/xl/workbook.xml');
  const xmlDefaults = children(contentTypes, 'Default').filter((entry) => entry.getAttribute('Extension') === 'xml');
  if (workbookOverrides.length > 1 || xmlDefaults.length > 1) {
    fail('malformed-file', 'The workbook has duplicated content-type declarations. Export a fresh .xlsx copy.');
  }
  // OPC permits an extension default when this fixed workbook part has no override.
  // An explicit unsupported override must still take precedence over a valid default.
  const workbookType = (workbookOverrides[0] ?? xmlDefaults[0])?.getAttribute('ContentType');
  if (workbookType !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml') {
    fail('unsupported-format', 'Choose a macro-free .xlsx workbook, or export the objective table as CSV.');
  }
  const workbook = spreadsheetRoot(await readXml('xl/workbook.xml'), 'workbook', 'The workbook');
  const relationships = await readXml('xl/_rels/workbook.xml.rels');
  const targets = new Map<string, string>();
  let sharedPath: string | undefined;
  for (const relation of Array.from(relationships.getElementsByTagNameNS('*', 'Relationship'))) {
    if (relation.getAttribute('TargetMode')?.toLowerCase() === 'external') continue;
    const type = relation.getAttribute('Type') ?? '';
    if (![REL_NS, STRICT_REL_NS].some((namespace) => type.startsWith(`${namespace}/`))) continue;
    const target = internalTarget(relation.getAttribute('Target') ?? '');
    if (!target) continue;
    const id = relation.getAttribute('Id');
    if (type.endsWith('/worksheet') && /^xl\/worksheets\/[^/]+\.xml$/.test(target) && id) {
      if (targets.has(id)) fail('malformed-file', 'The workbook has duplicated worksheet relationships.');
      targets.set(id, target);
    } else if (type.endsWith('/sharedStrings') && target === 'xl/sharedStrings.xml') sharedPath = target;
  }
  const sheetContainer = children(workbook, 'sheets')[0];
  const sheets = sheetContainer ? children(sheetContainer, 'sheet') : [];
  if (sheets.length > L.maxSheets) fail('table-limit', `The workbook has more than ${L.maxSheets} sheets. Use a smaller excerpt.`);
  const visible = sheets.filter((sheet) => !sheet.hasAttribute('state') || sheet.getAttribute('state') === 'visible');
  const preferred = visible.find((sheet) => normalize(sheet.getAttribute('name') ?? '') === 'objectives');
  const candidates = preferred ? [preferred] : visible;
  if (!candidates.length) fail('missing-columns', 'The workbook has no visible worksheet. Make the Objectives sheet visible and try again.');
  let shared: string[] = [];
  if (sharedPath) {
    const root = spreadsheetRoot(await readXml(sharedPath), 'sst', 'Shared strings');
    const strings = children(root, 'si');
    if (strings.length > L.maxSharedStrings) fail('table-limit', 'The workbook has too many shared text values. Export a smaller objective table.');
    shared = strings.map(stringText);
  }
  let closest: { name: string; rows: TableRow[]; header?: Header } | undefined;
  for (const sheet of candidates) {
    checkCancelled(signal);
    const name = sheet.getAttribute('name')?.trim() || 'Worksheet';
    const id = sheet.getAttributeNS(REL_NS, 'id') ?? sheet.getAttributeNS(STRICT_REL_NS, 'id');
    const path = id ? targets.get(id) : undefined;
    if (!path) {
      if (preferred) fail('malformed-file', `${name} does not reference an internal worksheet. Export a fresh .xlsx copy.`);
      continue;
    }
    const rows = worksheetRows(await readXml(path), shared, name);
    const header = findHeader(rows);
    if (header && REQUIRED.every((column) => header.columns.has(column))) {
      return assembleTable(name, rows, header, signal);
    }
    if (!closest || (header?.columns.size ?? 0) > (closest.header?.columns.size ?? 0)) closest = { name, rows, header };
  }
  return assembleTable(closest?.name ?? 'Workbook', closest?.rows ?? [], closest?.header, signal);
}

/** Import educator-authored values locally; never calculate formulas or follow links. */
export async function importLessonObjectives(
  file: File, options: { signal?: AbortSignal } = {},
): Promise<LessonObjectivesImportResult> {
  checkCancelled(options.signal);
  const extension = file.name.split('.').at(-1)?.toLowerCase() ?? '';
  if (!['csv', 'xlsx'].includes(extension)) fail('unsupported-format', 'Choose a .xlsx workbook or .csv objective table. Older .xls and macro-enabled files are not supported.');
  if (!file.size) fail('empty-file', 'The selected spreadsheet is empty.');
  if (file.size > L.maxFileBytes) fail('file-too-large', 'The spreadsheet is larger than 8 MB. Export a smaller objective table.');
  try {
    const bytes = await readFile(file, options.signal);
    await pause(options.signal);
    if (extension === 'xlsx') return await importXlsx(bytes, options.signal);
    const table = csvRows(decode(bytes));
    return await assembleTable('CSV', table, findHeader(table), options.signal);
  } catch (error) {
    checkCancelled(options.signal);
    if (error instanceof LessonObjectivesImportError) throw error;
    throw new LessonObjectivesImportError('malformed-file', 'The spreadsheet could not be read. Export a fresh .xlsx or UTF-8 CSV copy.', { cause: error });
  }
}
