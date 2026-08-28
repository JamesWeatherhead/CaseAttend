import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
} from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

import {
  LESSON_SOURCE_LIMITS,
  LessonSourceImportError,
  type LessonSourceExtraction,
  type LessonSourceImportOptions,
} from './lessonSourceImport';

// Pin the parser worker to the same-origin asset emitted by Vite. Do not honor
// ambient configuration that could point document processing at another host.
GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function cancelled(): LessonSourceImportError {
  return new LessonSourceImportError('cancelled', 'Document import was cancelled.');
}

function readablePdfError(error: unknown): LessonSourceImportError {
  const name = error && typeof error === 'object' ? (error as { name?: string }).name : '';
  if (name === 'PasswordException') {
    return new LessonSourceImportError(
      'encrypted-file',
      'Password-protected PDFs are not supported. Export an unlocked teaching copy and try again.',
    );
  }
  if (error instanceof LessonSourceImportError) return error;
  return new LessonSourceImportError(
    'malformed-file',
    'The PDF could not be read safely. Export a fresh PDF copy and try again.',
    { cause: error },
  );
}

interface PdfTextChunk {
  items: Array<
    | { str: string; hasEOL: boolean }
    | { type: string; id?: string }
  >;
}

/** Consume PDF.js text incrementally and stop the worker stream at our bounds. */
export async function readBoundedPdfTextStream(
  stream: ReadableStream<PdfTextChunk>,
  maxCharacters: number,
  signal?: AbortSignal,
): Promise<{ text: string; truncated: boolean }> {
  const reader = stream.getReader();
  let raw = '';
  let itemCount = 0;
  let completed = false;
  let truncated = false;
  try {
    readChunks: while (raw.length < maxCharacters) {
      if (signal?.aborted) throw cancelled();
      const { done, value } = await reader.read();
      if (done) {
        completed = true;
        break;
      }
      for (const item of value.items) {
        if (signal?.aborted) throw cancelled();
        if (itemCount >= LESSON_SOURCE_LIMITS.maxTextItemsPerUnit) {
          truncated = true;
          break readChunks;
        }
        itemCount += 1;
        if (!('str' in item)) continue;

        const available = maxCharacters - raw.length;
        if (item.str.length >= available) {
          raw += item.str.slice(0, available);
          truncated = true;
          break readChunks;
        }
        raw += item.str;
        const separator = item.hasEOL ? '\n' : ' ';
        if (raw.length + separator.length > maxCharacters) {
          truncated = true;
          break readChunks;
        }
        raw += separator;
        if (itemCount >= LESSON_SOURCE_LIMITS.maxTextItemsPerUnit) {
          truncated = true;
          break readChunks;
        }
      }
    }
    if (raw.length >= maxCharacters && !completed) truncated = true;
  } finally {
    if (!completed) await reader.cancel('CaseAttend text extraction limit reached.').catch(() => undefined);
    reader.releaseLock();
  }
  return {
    text: raw
      .replace(/[ \t]+\n/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim(),
    truncated,
  };
}

export async function extractPdfLessonSource(
  file: File,
  options: LessonSourceImportOptions = {},
): Promise<LessonSourceExtraction> {
  if (options.signal?.aborted) throw cancelled();
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (options.signal?.aborted) throw cancelled();

  let loadingTask: PDFDocumentLoadingTask | null = null;
  let document: PDFDocumentProxy | null = null;
  const abort = () => { void loadingTask?.destroy(); };
  options.signal?.addEventListener('abort', abort, { once: true });
  try {
    loadingTask = getDocument({
      data: bytes,
      useWorkerFetch: false,
      disableFontFace: true,
      enableXfa: false,
      stopAtErrors: true,
    });
    document = await loadingTask.promise;
    if (document.numPages > LESSON_SOURCE_LIMITS.maxUnits) {
      throw new LessonSourceImportError(
        'too-many-units',
        `This PDF has ${document.numPages} pages. Use a teaching excerpt with at most ${LESSON_SOURCE_LIMITS.maxUnits} pages.`,
      );
    }
    const sections: LessonSourceExtraction['sections'][number][] = [];
    let remaining = LESSON_SOURCE_LIMITS.maxCharacters;
    let truncatedPages = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages && remaining > 0; pageNumber += 1) {
      if (options.signal?.aborted) throw cancelled();
      const page = await document.getPage(pageNumber);
      try {
        const bounded = await readBoundedPdfTextStream(
          page.streamTextContent({ disableNormalization: false }) as ReadableStream<PdfTextChunk>,
          Math.min(LESSON_SOURCE_LIMITS.maxCharactersPerUnit, remaining),
          options.signal,
        );
        const text = bounded.text;
        if (bounded.truncated) truncatedPages += 1;
        if (text) sections.push({ index: pageNumber, label: `Page ${pageNumber}`, text });
        remaining -= text.length;
      } finally {
        page.cleanup();
      }
    }
    return {
      format: 'pdf',
      sections,
      unitCount: document.numPages,
      warnings: [
        ...(remaining <= 0
          ? [`The PDF text was limited to ${LESSON_SOURCE_LIMITS.maxCharacters.toLocaleString()} characters.`]
          : []),
        ...(truncatedPages > 0
          ? [`Text on ${truncatedPages} page(s) reached a safe extraction limit and was shortened.`]
          : []),
      ],
    };
  } catch (error) {
    if (options.signal?.aborted) throw cancelled();
    throw readablePdfError(error);
  } finally {
    options.signal?.removeEventListener('abort', abort);
    if (document) await document.cleanup().catch(() => undefined);
    if (loadingTask) await loadingTask.destroy().catch(() => undefined);
  }
}
