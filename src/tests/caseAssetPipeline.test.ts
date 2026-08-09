import { describe, expect, it, vi } from 'vitest';
import {
  CaseAssetPipelineError,
  inspectCaseImageBytes,
  prepareCaseImageAsset,
  prepareCaseImageAssets,
  readCaseImageDimensions,
  reencodeCaseImageWithCanvas,
  validateCaseImageDecode,
} from '../services/caseAssetPipeline';

const ONE_PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function onePixelPng(): Uint8Array {
  return Uint8Array.from(atob(ONE_PIXEL_PNG_BASE64), (character) => character.charCodeAt(0));
}

function blobBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function errorCode(action: () => unknown): string | undefined {
  try {
    action();
  } catch (error) {
    return error instanceof CaseAssetPipelineError ? error.code : undefined;
  }
  return undefined;
}

describe('case image asset pipeline', () => {
  it('uses the byte signature and header dimensions rather than trusting the filename', () => {
    const bytes = onePixelPng();
    expect(inspectCaseImageBytes(bytes, {
      declaredMimeType: 'image/png',
      fileName: 'teaching-image.png',
    })).toEqual({
      mimeType: 'image/png',
      width: 1,
      height: 1,
      byteLength: bytes.byteLength,
    });
    expect(readCaseImageDimensions(bytes, 'image/png')).toEqual({ width: 1, height: 1 });
    expect(errorCode(() => inspectCaseImageBytes(bytes, {
      declaredMimeType: 'image/jpeg',
      fileName: 'teaching-image.jpg',
    }))).toBe('mime-mismatch');
  });

  it('rejects raw DICOM, unsupported extensions, oversized files, and pixel bombs', () => {
    const dicom = new Uint8Array(132);
    dicom.set([0x44, 0x49, 0x43, 0x4d], 128);
    expect(errorCode(() => inspectCaseImageBytes(dicom, { fileName: 'scan.dcm' })))
      .toBe('dicom-not-supported');
    expect(errorCode(() => inspectCaseImageBytes(onePixelPng(), { fileName: 'image.svg' })))
      .toBe('unsupported-extension');
    expect(errorCode(() => inspectCaseImageBytes(onePixelPng(), {
      limits: { maxAssetBytes: 8 },
    }))).toBe('file-too-large');

    const largeHeader = onePixelPng();
    largeHeader.set([0x00, 0x00, 0x10, 0x00], 16);
    largeHeader.set([0x00, 0x00, 0x10, 0x00], 20);
    expect(() => inspectCaseImageBytes(largeHeader, {
      limits: { maxPixels: 1_000_000 },
    })).toThrow('Resize or downsample it before importing.');
  });

  it('re-encodes through canvas without using a data URL and releases the decoder', async () => {
    const source = {} as CanvasImageSource;
    const close = vi.fn();
    const drawImage = vi.fn();
    const toBlob = vi.fn((callback: BlobCallback, type?: string) => {
      callback(new Blob([blobBuffer(onePixelPng())], { type }));
    });

    const output = await reencodeCaseImageWithCanvas(
      new Blob([blobBuffer(onePixelPng())], { type: 'image/png' }),
      {
        outputMimeType: 'image/png',
        decode: async () => ({ source, width: 1, height: 1, close }),
        createCanvas: () => ({
          width: 0,
          height: 0,
          getContext: () => ({ drawImage }),
          toBlob,
        }),
      },
    );

    expect(output.type).toBe('image/png');
    expect(drawImage).toHaveBeenCalledWith(source, 0, 0, 1, 1);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png', 0.92);
    expect(close).toHaveBeenCalledOnce();
  });

  it('prepares content-addressed assets in the selected order', async () => {
    const bytes = onePixelPng();
    const createCanvas = () => ({
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: vi.fn() }),
      toBlob: (callback: BlobCallback, type?: string) => callback(new Blob([blobBuffer(bytes)], { type })),
    });
    const decode = async () => ({
      source: {} as CanvasImageSource,
      width: 1,
      height: 1,
    });
    const first = new File([blobBuffer(bytes)], 'frame-02.png', { type: 'image/png' });
    const second = new File([blobBuffer(bytes)], 'frame-01.png', { type: 'image/png' });

    const prepared = await prepareCaseImageAssets([first, second], { createCanvas, decode });

    expect(prepared.map((asset) => asset.originalName)).toEqual(['frame-02.png', 'frame-01.png']);
    expect(prepared[0].uri).toMatch(/^case:\/\/assets\/[a-f0-9]{64}\.png$/);
    expect(prepared[0].sha256).toBe(prepared[1].sha256);
    expect(prepared[0].bytesBase64).toBe(ONE_PIXEL_PNG_BASE64);
    await expect(prepareCaseImageAsset(
      new File([blobBuffer(bytes)], 'image.png', { type: 'image/png' }),
      { createCanvas, decode },
    )).resolves.toMatchObject({ width: 1, height: 1, mimeType: 'image/png' });
  });

  it('enforces count and total-byte limits before decoding a stack', async () => {
    const bytes = onePixelPng();
    const files = [
      new File([blobBuffer(bytes)], 'one.png', { type: 'image/png' }),
      new File([blobBuffer(bytes)], 'two.png', { type: 'image/png' }),
    ];
    await expect(prepareCaseImageAssets(files, { limits: { maxAssetCount: 1 } }))
      .rejects.toMatchObject({ code: 'too-many-files' });
    await expect(prepareCaseImageAssets(files, { limits: { maxTotalBytes: bytes.byteLength } }))
      .rejects.toMatchObject({ code: 'total-too-large' });
    await expect(prepareCaseImageAssets(files, { limits: { maxTotalPixels: 1 } }))
      .rejects.toMatchObject({
        code: 'total-pixels-too-large',
        message: expect.stringContaining('Resize or downsample the images, or choose a smaller stack.'),
      });
  });

  it('rejects an oversized File before reading its bytes', async () => {
    const file = new File([blobBuffer(onePixelPng())], 'large.png', { type: 'image/png' });
    const arrayBuffer = vi.spyOn(file, 'arrayBuffer');

    await expect(prepareCaseImageAsset(file, { limits: { maxAssetBytes: 8 } }))
      .rejects.toMatchObject({ code: 'file-too-large' });
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('rejects an oversized canvas result before reading the encoded bytes', async () => {
    const bytes = onePixelPng();
    const output = new Blob([blobBuffer(bytes)], { type: 'image/png' });
    Object.defineProperty(output, 'size', { configurable: true, value: 101 });
    const outputArrayBuffer = vi.spyOn(output, 'arrayBuffer');
    const file = new File([blobBuffer(bytes)], 'source.png', { type: 'image/png' });

    await expect(prepareCaseImageAsset(file, {
      limits: { maxAssetBytes: 100 },
      decode: async () => ({ source: {} as CanvasImageSource, width: 1, height: 1 }),
      createCanvas: () => ({
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: vi.fn() }),
        toBlob: (callback: BlobCallback) => callback(output),
      }),
    })).rejects.toMatchObject({ code: 'file-too-large' });
    expect(outputArrayBuffer).not.toHaveBeenCalled();
  });

  it('rejects decoder pixel bombs before allocating a canvas', async () => {
    const createCanvas = vi.fn();
    await expect(reencodeCaseImageWithCanvas(
      new Blob([blobBuffer(onePixelPng())], { type: 'image/png' }),
      {
        outputMimeType: 'image/png',
        limits: { maxPixels: 1_000_000 },
        decode: async () => ({
          source: {} as CanvasImageSource,
          width: 2_000,
          height: 2_000,
        }),
        createCanvas,
      },
    )).rejects.toMatchObject({ code: 'dimensions-too-large' });
    expect(createCanvas).not.toHaveBeenCalled();
  });

  it('requires imported bytes to decode to their declared dimensions and releases the decoder', async () => {
    const close = vi.fn();
    await expect(validateCaseImageDecode(
      new Blob([blobBuffer(onePixelPng())], { type: 'image/png' }),
      { width: 1, height: 1 },
      {
        decode: async () => ({
          source: {} as CanvasImageSource,
          width: 2,
          height: 1,
          close,
        }),
      },
    )).rejects.toMatchObject({ code: 'dimensions-mismatch' });
    expect(close).toHaveBeenCalledOnce();
  });
});
