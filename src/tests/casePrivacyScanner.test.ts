// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  countIdentifierFlags,
  scanCaseAssetPrivacy,
} from '../services/casePrivacyScanner';

const tesseract = vi.hoisted(() => ({
  createWorker: vi.fn(),
}));

vi.mock('tesseract.js', () => ({
  OEM: { LSTM_ONLY: 1 },
  createWorker: tesseract.createWorker,
}));

function workerWithText(text: string) {
  return {
    recognize: vi.fn(async () => ({ data: { text } })),
    terminate: vi.fn(async () => undefined),
  };
}

describe('case privacy scanner', () => {
  beforeEach(() => {
    tesseract.createWorker.mockReset();
  });

  it('counts common identifier patterns without returning recognized text', async () => {
    const worker = workerWithText('MRN: ABC-1234, 2025-04-09, learner@example.org, 312-555-0187');
    const result = await scanCaseAssetPrivacy(
      { blob: new Blob(['safe']), domain: 'radiology' },
      {
        createOcrWorker: async () => worker,
        detectFaces: async () => 0,
      },
    );

    expect(result.ocr.identifierFlags).toEqual({
      email: 1,
      phone: 1,
      date: 1,
      labeledIdentifier: 1,
    });
    expect(JSON.stringify(result)).not.toContain('ABC-1234');
    expect(result.warnings.join(' ')).toContain('Possible identifying text');
    expect(worker.terminate).toHaveBeenCalled();
  });

  it('warns conservatively for dermatology and unavailable face detection', async () => {
    const result = await scanCaseAssetPrivacy(
      { blob: new Blob(['safe']), domain: 'dermatology' },
      {
        createOcrWorker: async () => workerWithText(''),
        detectFaces: async () => null,
      },
    );
    expect(result.face.status).toBe('unavailable');
    expect(result.comparableImageWarning).toBe(true);
    expect(result.warnings.join(' ')).toContain('Clinical photographs can identify');
  });

  it('returns advisory failures without treating the image as cleared', async () => {
    const result = await scanCaseAssetPrivacy(
      { blob: new Blob(['safe']), domain: 'pathology', sourceName: 'MRN-0099.png' },
      {
        createOcrWorker: async () => { throw new Error('worker unavailable'); },
        detectFaces: async () => { throw new Error('detector unavailable'); },
      },
    );
    expect(result.ocr.status).toBe('failed');
    expect(result.face.status).toBe('failed');
    expect(result.warnings.at(-1)).toContain('do not establish HIPAA');
  });

  it('aborts without returning partial scan data', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(scanCaseAssetPrivacy(
      { blob: new Blob(['safe']), domain: 'radiology' },
      { signal: controller.signal },
    )).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('counts patterns independently', () => {
    expect(countIdentifierFlags('2026/08/09 and accession: ZX-991')).toEqual({
      email: 0,
      phone: 0,
      date: 1,
      labeledIdentifier: 1,
    });
  });

  it('loads OCR worker, core, and language data only from fixed same-origin paths', async () => {
    const worker = workerWithText('');
    tesseract.createWorker.mockResolvedValue(worker);

    await scanCaseAssetPrivacy(
      { blob: new Blob(['safe']), domain: 'radiology' },
      { detectFaces: async () => 0 },
    );

    expect(tesseract.createWorker).toHaveBeenCalledOnce();
    const [language, engine, options] = tesseract.createWorker.mock.calls[0] as [
      string,
      number,
      {
        workerPath: string;
        corePath: string;
        langPath: string;
        gzip: boolean;
        cacheMethod: string;
      },
    ];
    expect(language).toBe('eng');
    expect(engine).toBe(1);
    expect(options).toMatchObject({
      workerPath: `${window.location.origin}/vendor/tesseract/worker.min.js`,
      corePath: `${window.location.origin}/vendor/tesseract-core`,
      langPath: `${window.location.origin}/vendor/tessdata`,
      gzip: true,
      cacheMethod: 'none',
    });
    for (const path of [options.workerPath, options.corePath, options.langPath]) {
      expect(new URL(path).origin).toBe(window.location.origin);
    }
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
