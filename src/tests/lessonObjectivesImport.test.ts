import { strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  importLessonObjectives,
  LESSON_OBJECTIVES_LIMITS as LIMITS,
  LessonObjectivesImportError,
} from '../services/lessonObjectivesImport';

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const CONTENT_TYPES_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml';
const HEADERS = ['Level', 'Objective', 'Expected evidence', 'Answer key', 'Hint', 'Slides', 'Source URL'];
const VALUES = ['Step1', 'Describe the visible feature.', 'Names the feature and its location.', 'A focal feature in the labelled region.', 'Compare the labelled regions.', '1, 3-4', 'https://example.org/teaching'];
const escapeXml = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function inlineCell(reference: string, value: string): string {
  return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function xmlRow(rowNumber: number, values: readonly string[]): string {
  return `<row r="${rowNumber}">${values.map((value, index) => inlineCell(`${String.fromCharCode(65 + index)}${rowNumber}`, value)).join('')}</row>`;
}

function worksheet(rows = xmlRow(1, HEADERS) + xmlRow(2, VALUES)): string {
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${NS}" xmlns:r="${REL}"><dimension ref="A1:G2"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetData>${rows}</sheetData><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`;
}

interface SheetFixture { name: string; xml: string; state?: 'hidden' | 'veryHidden'; external?: boolean }
function workbook(options: { sheets?: SheetFixture[]; shared?: string; compressed?: boolean; extra?: Record<string, Uint8Array> } = {}): File {
  const sheets = options.sheets ?? [{ name: 'Objectives', xml: worksheet() }];
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`),
    '_rels/.rels': strToU8(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(`<workbook xmlns="${NS}" xmlns:r="${REL}"><bookViews><workbookView/></bookViews><sheets>${sheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"${sheet.state ? ` state="${sheet.state}"` : ''}/>`).join('')}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((sheet, index) => `<Relationship Id="rId${index + 1}" Type="${REL}/worksheet" Target="${sheet.external ? 'https://example.org/sheet.xml' : `/xl/worksheets/sheet${index + 1}.xml`}"${sheet.external ? ' TargetMode="External"' : ''}/>`).join('')}${options.shared ? `<Relationship Id="shared" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/>` : ''}<Relationship Id="externalLink" Type="${REL}/externalLink" TargetMode="External" Target="https://example.org/data.xlsx"/></Relationships>`),
    'docProps/core.xml': strToU8('<metadata>Workbook author metadata is not lesson content.</metadata>'),
    ...options.extra,
  };
  sheets.forEach((sheet, index) => { files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(sheet.xml); });
  if (options.shared) files['xl/sharedStrings.xml'] = strToU8(`<sst xmlns="${NS}" count="8" uniqueCount="8">${options.shared}</sst>`);
  const bytes = zipSync(files, { level: options.compressed ? 6 : 0 });
  return new File([new Uint8Array(bytes).buffer], 'educator-objectives.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function csv(rows: readonly (readonly string[])[], options: { delimiter?: string; bom?: boolean } = {}): File {
  const delimiter = options.delimiter ?? ',';
  const text = rows.map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(delimiter)).join('\r\n');
  return new File([`${options.bom ? '\uFEFF' : ''}${text}`], 'objectives.csv', { type: 'text/csv' });
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('lesson objective spreadsheet import', () => {
  it('reads workbooks whose fixed workbook part uses the XML extension content-type default', async () => {
    const types = `<Types xmlns="${CONTENT_TYPES_NS}"><Default Extension="xml" ContentType="${XLSX_TYPE}"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;
    const result = await importLessonObjectives(workbook({ extra: { '[Content_Types].xml': strToU8(types) } }));
    expect(result.sheetName).toBe('Objectives');
    expect(result.rows[0]).toMatchObject({ objective: VALUES[1], answerKey: VALUES[3], slides: [1, 3, 4] });
    expect(result.warnings).toEqual([]);
  });

  it.each([
    `<Default Extension="xml" ContentType="${XLSX_TYPE}"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.ms-excel.sheet.macroEnabled.main+xml"/>`,
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Default Extension="xml" ContentType="application/vnd.ms-excel.sheet.macroEnabled.main+xml"/>',
    `<Default Extension="rels" ContentType="${XLSX_TYPE}"/>`,
    `<Default Extension="xml" ContentType="${XLSX_TYPE}"/><Override PartName="/xl/workbook.xml"/>`,
  ])('rejects an unsupported resolved workbook type without falling through to a different declaration', async (declarations) => {
    const types = `<Types xmlns="${CONTENT_TYPES_NS}">${declarations}</Types>`;
    await expect(importLessonObjectives(workbook({ extra: { '[Content_Types].xml': strToU8(types) } })))
      .rejects.toMatchObject({ code: 'unsupported-format' });
  });

  it('requires the content-types namespace and ignores declarations from other namespaces', async () => {
    const wrongRoot = `<Types xmlns="urn:unrelated"><Default Extension="xml" ContentType="${XLSX_TYPE}"/></Types>`;
    await expect(importLessonObjectives(workbook({ extra: { '[Content_Types].xml': strToU8(wrongRoot) } })))
      .rejects.toMatchObject({ code: 'malformed-file' });
    const foreignDefault = `<Types xmlns="${CONTENT_TYPES_NS}"><Default xmlns="urn:unrelated" Extension="xml" ContentType="${XLSX_TYPE}"/></Types>`;
    await expect(importLessonObjectives(workbook({ extra: { '[Content_Types].xml': strToU8(foreignDefault) } })))
      .rejects.toMatchObject({ code: 'unsupported-format' });
  });

  it.each([false, true])('reads a real XLSX package with inline, rich shared, numeric, and cached string cells (compressed=%s)', async (compressed) => {
    const header = HEADERS.map((_, index) => `<c r="${String.fromCharCode(65 + index)}3" t="s"><v>${index}</v></c>`).join('');
    const row = `${inlineCell('A5', ' Post-Step1 ')}<c r="B5" t="s"><v>7</v></c>${inlineCell('C5', VALUES[2])}${inlineCell('D5', VALUES[3])}${inlineCell('E5', VALUES[4])}<c r="F5"><v>2</v></c><c r="G5" t="str"><v>https://example.org/source</v></c>`;
    const shared = HEADERS.map((value) => `<si><t>${value}</t></si>`).join('') + '<si><r><t>Describe </t></r><r><t>the finding.</t></r><rPh sb="0" eb="8"><t>phonetic annotation</t></rPh></si>';
    const result = await importLessonObjectives(workbook({ compressed, shared, sheets: [{ name: 'Objectives', xml: worksheet(`<row r="3">${header}</row><row r="5">${row}</row>`) }] }));
    expect(result).toEqual({
      sheetName: 'Objectives', warnings: [],
      rows: [{ rowNumber: 5, level: 'Post-Step1', objective: 'Describe the finding.', evidence: VALUES[2], answerKey: VALUES[3], hint: VALUES[4], slides: [2], sourceUrl: 'https://example.org/source' }],
    });
  });

  it('imports BOM CSV, tolerant headers, quoted punctuation/newlines, and raw accepted level labels', async () => {
    const aliases = ['Audience', 'Learning objective', 'Success criteria', 'Expected answer', 'Suggested hint', 'Slide numbers', 'Reference URL'];
    const labels = ['HS', 'High school', 'Undergrad', 'Step1', 'Post-Step1', 'Step2', 'Resident'];
    const rows = labels.map((level) => [level, 'Describe "A", then B.\nExplain why.', VALUES[2], VALUES[3], '', '2; 4 – 6; 4', '']);
    const result = await importLessonObjectives(csv([aliases, ...rows], { bom: true }));
    expect(result.rows.map((row) => row.level)).toEqual(labels);
    expect(result.rows[0]).toMatchObject({ objective: 'Describe "A", then B.\nExplain why.', slides: [2, 4, 5, 6], hint: '', rowNumber: 2 });
    expect(result.rows[1].rowNumber).toBe(4);
    expect(result.rows[0]).not.toHaveProperty('sourceUrl');
  });

  it('recognizes semicolon exports and skips leading title/empty records without losing row numbers', async () => {
    const result = await importLessonObjectives(csv([['Teaching objectives'], [], HEADERS, VALUES], { delimiter: ';' }));
    expect(result.rows[0].rowNumber).toBe(4);
    expect(result.rows[0].slides).toEqual([1, 3, 4]);
  });

  it('supports the Excel sep directive and UTF-16 CSV export', async () => {
    const source = `sep=;\r\n${HEADERS.join(';')}\r\n${[...VALUES.slice(0, 5), '2', VALUES[6]].join(';')}`;
    const bytes = new Uint8Array(2 + source.length * 2);
    bytes.set([0xff, 0xfe]);
    for (let index = 0; index < source.length; index += 1) { bytes[2 + index * 2] = source.charCodeAt(index) & 255; bytes[3 + index * 2] = source.charCodeAt(index) >> 8; }
    const result = await importLessonObjectives(new File([bytes], 'excel.csv'));
    expect(result.rows[0]).toMatchObject({ rowNumber: 3, slides: [2] });
  });

  it('prefers the visible Objectives sheet and does not parse hidden-sheet distractions or fetch links', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const result = await importLessonObjectives(workbook({ sheets: [
      { name: 'Old table', xml: worksheet(xmlRow(1, HEADERS) + xmlRow(2, ['HS', 'Old objective', ...VALUES.slice(2)])) },
      { name: 'Private notes', state: 'veryHidden', xml: 'not a worksheet' },
      { name: 'Objectives', xml: worksheet() },
    ] }));
    expect(result.sheetName).toBe('Objectives');
    expect(result.rows[0].objective).toBe(VALUES[1]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses the first recognized visible table when Objectives is hidden and skips external worksheets', async () => {
    const result = await importLessonObjectives(workbook({ sheets: [
      { name: 'Objectives', state: 'hidden', xml: 'not a worksheet' },
      { name: 'Linked sheet', external: true, xml: 'not a worksheet' },
      { name: 'Read me', xml: worksheet(xmlRow(1, ['Instructions only'])) },
      { name: 'Clinical curriculum', xml: worksheet() },
      { name: 'Later curriculum', xml: worksheet() },
    ] }));
    expect(result.sheetName).toBe('Clinical curriculum');
  });

  it('reports missing/duplicate columns instead of importing a partial or ambiguous schema', async () => {
    await expect(importLessonObjectives(csv([['Level', 'Objective'], ['Step1', 'Observe']]))).rejects.toThrow('Expected evidence, Answer key');
    await expect(importLessonObjectives(csv([[...HEADERS, 'Model answer'], [...VALUES, 'another answer']]))).rejects.toThrow('row 1: use only one Answer key column');
  });

  it.each([
    [0, '', 'Level is required'], [1, '', 'Objective is required'],
    [2, '', 'Expected evidence is required'], [3, '', 'Answer key is required'],
    [0, 'Unknown level', 'Level must be HS'], [5, '0, 2', 'Slides must be between'],
    [5, '4-2', 'Slides must be between'], [5, 'first slide', 'Slides must contain'],
    [6, 'example.org/no-protocol', 'Source URL must be a complete'],
  ])('reports the exact source row and column for an invalid value (%s)', async (column, value, message) => {
    const values = [...VALUES]; values[Number(column)] = String(value);
    await expect(importLessonObjectives(csv([['Course title'], HEADERS, values]))).rejects.toThrow(`CSV, row 3: ${message}`);
  });

  it('uses cached formula results with a warning and never evaluates formula text or external links', async () => {
    const row = xmlRow(2, VALUES).replace(inlineCell('D2', VALUES[3]), `<c r="D2" t="str"><f>CONCAT(&quot;Reviewed&quot;,&quot; answer&quot;)</f><v>Reviewed answer</v></c>`);
    const result = await importLessonObjectives(workbook({ sheets: [{ name: 'Objectives', xml: worksheet(xmlRow(1, HEADERS) + row) }] }));
    expect(result.rows[0].answerKey).toBe('Reviewed answer');
    expect(result.warnings).toEqual([expect.stringContaining('row 2: imported saved formula results only')]);
  });

  it.each([
    ['<c r="D2" t="str"><f>CONCAT(&quot;Reviewed&quot;,&quot; answer&quot;)</f></c>', 'formula without a saved value'],
    ['<c r="D2" t="e"><v>#VALUE!</v></c>', 'spreadsheet error'],
  ])('requires educators to repair formulas without caches and spreadsheet errors', async (cell, message) => {
    const row = xmlRow(2, VALUES).replace(inlineCell('D2', VALUES[3]), cell);
    await expect(importLessonObjectives(workbook({ sheets: [{ name: 'Objectives', xml: worksheet(xmlRow(1, HEADERS) + row) }] }))).rejects.toThrow(`row 2: Answer key ${message === 'spreadsheet error' ? 'contains a ' : 'has a '}${message}`);
  });

  it('does not treat formula results as literal column headings or CSV text as an instruction to calculate', async () => {
    const header = xmlRow(1, HEADERS).replace(inlineCell('A1', 'Level'), '<c r="A1" t="str"><f>&quot;Level&quot;</f><v>Level</v></c>');
    await expect(importLessonObjectives(workbook({ sheets: [{ name: 'Objectives', xml: worksheet(header + xmlRow(2, VALUES)) }] }))).rejects.toThrow('required column Level');
    const result = await importLessonObjectives(csv([HEADERS, [...VALUES.slice(0, 3), '=1+1', ...VALUES.slice(4)]]));
    expect(result.rows[0].answerKey).toBe('=1+1');
  });

  it('enforces file, objective-row, cell, archive-entry, and expanded-entry limits', async () => {
    const oversized = csv([HEADERS, VALUES]);
    Object.defineProperty(oversized, 'size', { value: LIMITS.maxFileBytes + 1 });
    const read = vi.spyOn(oversized, 'arrayBuffer');
    await expect(importLessonObjectives(oversized)).rejects.toMatchObject({ code: 'file-too-large' });
    expect(read).not.toHaveBeenCalled();
    await expect(importLessonObjectives(csv([HEADERS, ...Array.from({ length: LIMITS.maxRows + 1 }, () => VALUES)]))).rejects.toMatchObject({ code: 'table-limit' });
    await expect(importLessonObjectives(csv([HEADERS, [VALUES[0], 'x'.repeat(LIMITS.maxCellCharacters + 1), ...VALUES.slice(2)]]))).rejects.toMatchObject({ code: 'table-limit' });
    const extra = Object.fromEntries(Array.from({ length: LIMITS.maxArchiveEntries }, (_, index) => [`custom/${index}.txt`, new Uint8Array()]));
    await expect(importLessonObjectives(workbook({ extra }))).rejects.toMatchObject({ code: 'archive-limit' });
    await expect(importLessonObjectives(workbook({ compressed: true, extra: { 'xl/sharedStrings.xml': strToU8('x'.repeat(LIMITS.maxArchiveEntryBytes + 1)) } }))).rejects.toMatchObject({ code: 'archive-limit' });
  });

  it('rejects unsupported, empty, malformed CSV, and non-workbook files with understandable errors', async () => {
    await expect(importLessonObjectives(new File(['old workbook'], 'objectives.xls'))).rejects.toMatchObject({ code: 'unsupported-format' });
    await expect(importLessonObjectives(new File([], 'objectives.csv'))).rejects.toMatchObject({ code: 'empty-file' });
    await expect(importLessonObjectives(new File(['not a workbook'], 'objectives.xlsx'))).rejects.toBeInstanceOf(LessonObjectivesImportError);
    await expect(importLessonObjectives(new File(['"unclosed'], 'objectives.csv'))).rejects.toThrow('quoted cell is not closed');
  });

  it('cancels before reading and while an asynchronous read is pending', async () => {
    const before = new AbortController(); before.abort();
    const file = csv([HEADERS, VALUES]);
    const read = vi.spyOn(file, 'arrayBuffer');
    await expect(importLessonObjectives(file, { signal: before.signal })).rejects.toMatchObject({ code: 'cancelled' });
    expect(read).not.toHaveBeenCalled();
    const during = new AbortController();
    let resolveRead!: (value: ArrayBuffer) => void;
    read.mockImplementation(() => new Promise<ArrayBuffer>((resolve) => { resolveRead = resolve; }));
    const pending = importLessonObjectives(file, { signal: during.signal });
    during.abort();
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
    resolveRead(new ArrayBuffer(0));
  });

  it('honors cancellation between workbook extraction steps', async () => {
    const controller = new AbortController();
    const pending = importLessonObjectives(workbook({ compressed: true }), { signal: controller.signal });
    setTimeout(() => controller.abort(), 0);
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
  });
});
