import type { DomainKey } from '../lib/domains/types';

export interface IdentifierFlagCounts {
  email: number;
  phone: number;
  date: number;
  labeledIdentifier: number;
}

export type DetectorStatus = 'complete' | 'unavailable' | 'failed';

export interface CasePrivacyScanResult {
  ocr: {
    status: DetectorStatus;
    textDetected: boolean;
    identifierFlags: IdentifierFlagCounts;
  };
  face: {
    status: DetectorStatus;
    count: number;
  };
  comparableImageWarning: boolean;
  warnings: readonly string[];
}

export interface CasePrivacyScanInput {
  blob: Blob;
  domain: DomainKey;
  /** Used for flag counts only. The source name is never returned or persisted. */
  sourceName?: string;
}

export interface CasePrivacyScanProgress {
  phase: 'ocr-loading' | 'ocr-running' | 'face-running';
  progress?: number;
}

interface OcrWorkerLike {
  recognize(image: Blob): Promise<{ data: { text?: string } }>;
  terminate(): Promise<unknown>;
}

export interface CasePrivacyScannerOptions {
  signal?: AbortSignal;
  onProgress?: (progress: CasePrivacyScanProgress) => void;
  createOcrWorker?: (
    onProgress: (progress: number) => void,
  ) => Promise<OcrWorkerLike>;
  detectFaces?: (blob: Blob) => Promise<number | null>;
  /** Internal batch seam. Callers normally leave lifecycle management enabled. */
  terminateOcrWorker?: boolean;
}

const EMPTY_IDENTIFIER_FLAGS: IdentifierFlagCounts = {
  email: 0,
  phone: 0,
  date: 0,
  labeledIdentifier: 0,
};

const IDENTIFIER_PATTERNS: Readonly<Record<keyof IdentifierFlagCounts, RegExp>> = {
  email: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  phone: /(?:\+?\d{1,3}[ .-]?)?(?:\(?\d{3}\)?[ .-]?)\d{3}[ .-]?\d{4}\b/g,
  date: /\b(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\b/g,
  labeledIdentifier: /\b(?:mrn|medical record|patient id|record (?:number|no)|accession)\s*[:#-]?\s*[A-Z0-9-]{3,}\b/gi,
};

function abortError(): DOMException {
  return new DOMException('The privacy scan was cancelled.', 'AbortError');
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

export function countIdentifierFlags(text: string): IdentifierFlagCounts {
  const counts = { ...EMPTY_IDENTIFIER_FLAGS };
  for (const [key, pattern] of Object.entries(IDENTIFIER_PATTERNS) as Array<[
    keyof IdentifierFlagCounts,
    RegExp,
  ]>) {
    pattern.lastIndex = 0;
    counts[key] = Array.from(text.matchAll(pattern)).length;
  }
  return counts;
}

async function defaultOcrWorker(
  onProgress: (progress: number) => void,
): Promise<OcrWorkerLike> {
  const { createWorker, OEM } = await import('tesseract.js');
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return createWorker('eng', OEM.LSTM_ONLY, {
    workerPath: `${origin}/vendor/tesseract/worker.min.js`,
    corePath: `${origin}/vendor/tesseract-core`,
    langPath: `${origin}/vendor/tessdata`,
    gzip: true,
    cacheMethod: 'none',
    logger(message) {
      if (message.status === 'recognizing text') onProgress(message.progress);
    },
  });
}

async function defaultFaceDetector(blob: Blob): Promise<number | null> {
  const scope = globalThis as typeof globalThis & {
    FaceDetector?: new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => {
      detect(image: ImageBitmap): Promise<readonly unknown[]>;
    };
  };
  if (!scope.FaceDetector || typeof createImageBitmap !== 'function') return null;
  const bitmap = await createImageBitmap(blob);
  try {
    const detector = new scope.FaceDetector({ fastMode: true, maxDetectedFaces: 20 });
    return (await detector.detect(bitmap)).length;
  } finally {
    bitmap.close();
  }
}

function hasFlags(flags: IdentifierFlagCounts): boolean {
  return Object.values(flags).some((count) => count > 0);
}

/**
 * Runs browser-local advisory privacy checks. Recognized text is discarded before
 * this function returns. A clean result is never a de-identification decision.
 */
export async function scanCaseAssetPrivacy(
  input: CasePrivacyScanInput,
  options: CasePrivacyScannerOptions = {},
): Promise<CasePrivacyScanResult> {
  throwIfAborted(options.signal);
  const warnings: string[] = [];
  const createWorker = options.createOcrWorker ?? defaultOcrWorker;
  const detectFaces = options.detectFaces ?? defaultFaceDetector;
  const filenameFlags = countIdentifierFlags(input.sourceName ?? '');
  let ocrStatus: DetectorStatus = 'complete';
  let textDetected = false;
  let identifierFlags = filenameFlags;
  let worker: OcrWorkerLike | null = null;

  options.onProgress?.({ phase: 'ocr-loading' });
  try {
    worker = await createWorker((progress) => {
      options.onProgress?.({ phase: 'ocr-running', progress });
    });
    throwIfAborted(options.signal);
    const abortListener = () => { void worker?.terminate(); };
    options.signal?.addEventListener('abort', abortListener, { once: true });
    try {
      const recognized = await worker.recognize(input.blob);
      throwIfAborted(options.signal);
      const recognizedText = recognized.data.text ?? '';
      textDetected = recognizedText.trim().length > 0;
      const ocrFlags = countIdentifierFlags(recognizedText);
      identifierFlags = {
        email: filenameFlags.email + ocrFlags.email,
        phone: filenameFlags.phone + ocrFlags.phone,
        date: filenameFlags.date + ocrFlags.date,
        labeledIdentifier: filenameFlags.labeledIdentifier + ocrFlags.labeledIdentifier,
      };
    } finally {
      options.signal?.removeEventListener('abort', abortListener);
    }
  } catch (error) {
    if (options.signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      throw abortError();
    }
    ocrStatus = 'failed';
    warnings.push('Local text recognition could not finish. Manually inspect every image for identifiers.');
  } finally {
    if (options.terminateOcrWorker !== false) {
      await worker?.terminate().catch(() => undefined);
    }
  }

  if (hasFlags(identifierFlags)) {
    warnings.push('Possible identifying text was detected. Remove it from the source image and import again.');
  } else if (textDetected) {
    warnings.push('Text was detected. Review it manually even though common identifier patterns were not found.');
  }

  throwIfAborted(options.signal);
  options.onProgress?.({ phase: 'face-running' });
  let faceStatus: DetectorStatus = 'complete';
  let faceCount = 0;
  try {
    const detected = await detectFaces(input.blob);
    throwIfAborted(options.signal);
    if (detected === null) {
      faceStatus = 'unavailable';
      warnings.push('Automatic face detection is unavailable in this browser. Review the image manually.');
    } else {
      faceCount = detected;
      if (faceCount > 0) {
        warnings.push('A possible face was detected. Do not save identifiable facial images in the public workflow.');
      }
    }
  } catch (error) {
    if (options.signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      throw abortError();
    }
    faceStatus = 'failed';
    warnings.push('Face detection could not finish. Review the image manually.');
  }

  const comparableImageWarning = input.domain === 'dermatology';
  if (comparableImageWarning) {
    warnings.push('Clinical photographs can identify a person even without a visible face. Confirm consent or de-identification manually.');
  }

  warnings.push('Automated checks do not establish HIPAA de-identification, IRB status, consent, or clinical suitability.');
  return {
    ocr: {
      status: ocrStatus,
      textDetected,
      identifierFlags,
    },
    face: {
      status: faceStatus,
      count: faceCount,
    },
    comparableImageWarning,
    warnings,
  };
}

/** Reuses one browser-local OCR worker across an ordered image stack. */
export async function scanCaseAssetsPrivacy(
  inputs: readonly CasePrivacyScanInput[],
  options: Omit<CasePrivacyScannerOptions, 'createOcrWorker' | 'terminateOcrWorker'> & {
    createOcrWorker?: CasePrivacyScannerOptions['createOcrWorker'];
    onAssetProgress?: (completed: number, total: number) => void;
  } = {},
): Promise<CasePrivacyScanResult[]> {
  if (inputs.length === 0) return [];
  const createWorker = options.createOcrWorker ?? defaultOcrWorker;
  let worker: OcrWorkerLike | null = null;
  try {
    worker = await createWorker((progress) => {
      options.onProgress?.({ phase: 'ocr-running', progress });
    });
  } catch {
    const failed: CasePrivacyScanResult[] = [];
    for (let index = 0; index < inputs.length; index += 1) {
      failed.push(await scanCaseAssetPrivacy(inputs[index], {
        ...options,
        createOcrWorker: async () => { throw new Error('Local OCR worker unavailable.'); },
      }));
      options.onAssetProgress?.(index + 1, inputs.length);
    }
    return failed;
  }

  try {
    const results: CasePrivacyScanResult[] = [];
    for (let index = 0; index < inputs.length; index += 1) {
      throwIfAborted(options.signal);
      results.push(await scanCaseAssetPrivacy(inputs[index], {
        ...options,
        createOcrWorker: async () => worker!,
        terminateOcrWorker: false,
      }));
      options.onAssetProgress?.(index + 1, inputs.length);
    }
    return results;
  } finally {
    await worker.terminate().catch(() => undefined);
  }
}
