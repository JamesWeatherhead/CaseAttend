import {
  PORTABLE_CASE_ASSET_LIMITS,
  createPortableCaseAssetV1,
  detectPortableImageMimeType,
  findPortableImageMetadata,
  readPortableImageDimensions,
  type PortableCaseAssetV1,
  type PortableImageDimensions,
  type PortableImageMimeType,
} from '../core/portableCasePackage';

export interface CaseAssetPipelineLimits {
  maxAssetCount: number;
  maxAssetBytes: number;
  maxTotalBytes: number;
  maxWidth: number;
  maxHeight: number;
  maxPixels: number;
  maxTotalPixels: number;
}

export const DEFAULT_CASE_ASSET_LIMITS: Readonly<CaseAssetPipelineLimits> =
  PORTABLE_CASE_ASSET_LIMITS;

export type CaseAssetPipelineErrorCode =
  | 'empty-file'
  | 'too-many-files'
  | 'file-too-large'
  | 'total-too-large'
  | 'total-pixels-too-large'
  | 'dicom-not-supported'
  | 'unsupported-extension'
  | 'unsupported-image'
  | 'mime-mismatch'
  | 'dimensions-unreadable'
  | 'dimensions-mismatch'
  | 'dimensions-too-large'
  | 'decoder-unavailable'
  | 'decode-failed'
  | 'canvas-unavailable'
  | 'reencode-failed';

export class CaseAssetPipelineError extends Error {
  readonly code: CaseAssetPipelineErrorCode;

  constructor(code: CaseAssetPipelineErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'CaseAssetPipelineError';
    this.code = code;
  }
}

export interface InspectCaseImageOptions {
  declaredMimeType?: string;
  fileName?: string;
  limits?: Partial<CaseAssetPipelineLimits>;
}

export interface CaseImageInspection extends PortableImageDimensions {
  mimeType: PortableImageMimeType;
  byteLength: number;
}

export interface DecodedCanvasImage extends PortableImageDimensions {
  source: CanvasImageSource;
  close?: () => void;
}

interface CanvasSurface {
  width: number;
  height: number;
  getContext(contextId: '2d'): Pick<CanvasRenderingContext2D, 'drawImage'> | null;
  toBlob(
    callback: BlobCallback,
    type?: string,
    quality?: number,
  ): void;
}

export interface CanvasReencodeDependencies {
  decode?: (blob: Blob) => Promise<DecodedCanvasImage>;
  createCanvas?: (width: number, height: number) => CanvasSurface;
}

export interface ReencodeCaseImageOptions extends CanvasReencodeDependencies {
  outputMimeType?: PortableImageMimeType;
  quality?: number;
  limits?: Partial<CaseAssetPipelineLimits>;
}

export interface PrepareCaseImageOptions extends ReencodeCaseImageOptions {}

export interface ValidateCaseImageDecodeOptions {
  decode?: CanvasReencodeDependencies['decode'];
  limits?: Partial<CaseAssetPipelineLimits>;
}

export interface PreparedCaseImageAsset extends PortableCaseAssetV1 {
  blob: Blob;
  originalName: string;
}

const FILE_EXTENSIONS_BY_MIME: Record<PortableImageMimeType, ReadonlySet<string>> = {
  'image/jpeg': new Set(['jpg', 'jpeg', 'jfif']),
  'image/png': new Set(['png']),
  'image/webp': new Set(['webp']),
};
const SUPPORTED_EXTENSIONS = new Set(
  Object.values(FILE_EXTENSIONS_BY_MIME).flatMap((extensions) => [...extensions]),
);

function resolveLimits(
  partial: Partial<CaseAssetPipelineLimits> | undefined,
): CaseAssetPipelineLimits {
  const limits = { ...DEFAULT_CASE_ASSET_LIMITS, ...partial };
  for (const [key, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`limits.${key} must be a positive safe integer.`);
    }
    if (value > DEFAULT_CASE_ASSET_LIMITS[key as keyof CaseAssetPipelineLimits]) {
      throw new Error(`limits.${key} cannot weaken the built-in Case Studio safety limit.`);
    }
  }
  return limits;
}

function fileExtension(fileName: string | undefined): string | null {
  if (!fileName) return null;
  const leafName = fileName.split(/[\\/]/).at(-1) ?? '';
  const dotIndex = leafName.lastIndexOf('.');
  return dotIndex > 0 && dotIndex < leafName.length - 1
    ? leafName.slice(dotIndex + 1).toLowerCase()
    : null;
}

function hasDicomPreamble(bytes: Uint8Array): boolean {
  return bytes.length >= 132
    && bytes[128] === 0x44
    && bytes[129] === 0x49
    && bytes[130] === 0x43
    && bytes[131] === 0x4d;
}

function validateDimensions(
  dimensions: PortableImageDimensions,
  limits: CaseAssetPipelineLimits,
): void {
  if (
    dimensions.width > limits.maxWidth
    || dimensions.height > limits.maxHeight
    || dimensions.width * dimensions.height > limits.maxPixels
  ) {
    throw new CaseAssetPipelineError(
      'dimensions-too-large',
      `This image is ${dimensions.width} by ${dimensions.height} pixels. Resize or downsample it before importing. Use an image no larger than ${limits.maxWidth} by ${limits.maxHeight} pixels and ${limits.maxPixels} total pixels.`,
    );
  }
}

function validateInputByteLength(
  byteLength: number,
  limits: CaseAssetPipelineLimits,
): void {
  if (byteLength === 0) {
    throw new CaseAssetPipelineError('empty-file', 'The selected file is empty. Choose a JPEG, PNG, or WebP image.');
  }
  if (byteLength > limits.maxAssetBytes) {
    throw new CaseAssetPipelineError(
      'file-too-large',
      `This file is ${byteLength} bytes. Each image must be ${limits.maxAssetBytes} bytes or smaller.`,
    );
  }
}

export const detectCaseImageMimeType = detectPortableImageMimeType;
export const readCaseImageDimensions = readPortableImageDimensions;

export function inspectCaseImageBytes(
  bytes: Uint8Array,
  options: InspectCaseImageOptions = {},
): CaseImageInspection {
  const limits = resolveLimits(options.limits);
  validateInputByteLength(bytes.byteLength, limits);

  const extension = fileExtension(options.fileName);
  if (extension === 'dcm' || extension === 'dicom' || hasDicomPreamble(bytes)) {
    throw new CaseAssetPipelineError(
      'dicom-not-supported',
      'Raw DICOM import is not supported in this browser-only Case Studio. Export a deidentified JPEG, PNG, or WebP teaching image first.',
    );
  }
  if (extension && !SUPPORTED_EXTENSIONS.has(extension)) {
    throw new CaseAssetPipelineError(
      'unsupported-extension',
      `The .${extension} file extension is not supported. Choose a .jpg, .jpeg, .png, or .webp image.`,
    );
  }

  const mimeType = detectCaseImageMimeType(bytes);
  if (!mimeType) {
    throw new CaseAssetPipelineError(
      'unsupported-image',
      'The file contents are not a supported JPEG, PNG, or WebP image.',
    );
  }
  if (
    options.declaredMimeType
    && options.declaredMimeType !== 'application/octet-stream'
    && options.declaredMimeType !== mimeType
  ) {
    throw new CaseAssetPipelineError(
      'mime-mismatch',
      `The file reports ${options.declaredMimeType}, but its byte signature is ${mimeType}.`,
    );
  }
  if (extension && !FILE_EXTENSIONS_BY_MIME[mimeType].has(extension)) {
    throw new CaseAssetPipelineError(
      'mime-mismatch',
      `The .${extension} extension does not match the ${mimeType} byte signature.`,
    );
  }

  const dimensions = readCaseImageDimensions(bytes, mimeType);
  if (!dimensions) {
    throw new CaseAssetPipelineError(
      'dimensions-unreadable',
      'The image dimensions could not be read safely. The file may be incomplete or damaged.',
    );
  }
  validateDimensions(dimensions, limits);
  return { ...dimensions, mimeType, byteLength: bytes.byteLength };
}

async function decodeWithBrowser(blob: Blob): Promise<DecodedCanvasImage> {
  if (typeof globalThis.createImageBitmap === 'function') {
    try {
      const bitmap = await globalThis.createImageBitmap(blob, { imageOrientation: 'from-image' });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch (error) {
      throw new CaseAssetPipelineError(
        'decode-failed',
        'The browser could not decode this image. The file may be incomplete or damaged.',
        { cause: error },
      );
    }
  }

  if (
    typeof document === 'undefined'
    || typeof Image === 'undefined'
    || typeof URL?.createObjectURL !== 'function'
  ) {
    throw new CaseAssetPipelineError(
      'decoder-unavailable',
      'This browser does not provide an image decoder required for safe metadata removal.',
    );
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = objectUrl;
    try {
      await image.decode();
    } catch (error) {
      throw new CaseAssetPipelineError(
        'decode-failed',
        'The browser could not decode this image. The file may be incomplete or damaged.',
        { cause: error },
      );
    }
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

function createBrowserCanvas(width: number, height: number): CanvasSurface {
  if (typeof document === 'undefined') {
    throw new CaseAssetPipelineError(
      'canvas-unavailable',
      'Canvas is unavailable. Case Studio cannot safely remove image metadata in this environment.',
    );
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * Ask the browser's image decoder to validate imported bytes before they are
 * persisted. Header parsing alone cannot prove that a complete raster decodes.
 */
export async function validateCaseImageDecode(
  blob: Blob,
  expected: PortableImageDimensions,
  options: ValidateCaseImageDecodeOptions = {},
): Promise<void> {
  const decoded = await (options.decode ?? decodeWithBrowser)(blob);
  try {
    if (!Number.isSafeInteger(decoded.width) || decoded.width <= 0
      || !Number.isSafeInteger(decoded.height) || decoded.height <= 0) {
      throw new CaseAssetPipelineError(
        'decode-failed',
        'The decoded image has invalid dimensions.',
      );
    }
    validateDimensions(decoded, resolveLimits(options.limits));
    if (decoded.width !== expected.width || decoded.height !== expected.height) {
      throw new CaseAssetPipelineError(
        'dimensions-mismatch',
        `The browser decoded this image as ${decoded.width} by ${decoded.height} pixels, but the portable package declares ${expected.width} by ${expected.height} pixels.`,
      );
    }
  } finally {
    decoded.close?.();
  }
}

/** Re-encodes visible pixels, then verifies that the browser added no metadata. */
export async function reencodeCaseImageWithCanvas(
  blob: Blob,
  options: ReencodeCaseImageOptions = {},
): Promise<Blob> {
  const limits = resolveLimits(options.limits);
  const outputMimeType = options.outputMimeType
    ?? (detectCaseImageMimeType(new Uint8Array(await blob.slice(0, 16).arrayBuffer())) ?? 'image/png');
  const quality = options.quality ?? 0.92;
  if (!Number.isFinite(quality) || quality <= 0 || quality > 1) {
    throw new Error('quality must be greater than 0 and no greater than 1.');
  }

  const decoded = await (options.decode ?? decodeWithBrowser)(blob);
  try {
    if (!Number.isSafeInteger(decoded.width) || decoded.width <= 0
      || !Number.isSafeInteger(decoded.height) || decoded.height <= 0) {
      throw new CaseAssetPipelineError(
        'decode-failed',
        'The decoded image has invalid dimensions.',
      );
    }
    validateDimensions(decoded, limits);
    const canvas = (options.createCanvas ?? createBrowserCanvas)(decoded.width, decoded.height);
    canvas.width = decoded.width;
    canvas.height = decoded.height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new CaseAssetPipelineError(
        'canvas-unavailable',
        'The browser could not create a two-dimensional canvas for safe metadata removal.',
      );
    }
    context.drawImage(decoded.source, 0, 0, decoded.width, decoded.height);
    const encode = async (mimeType: PortableImageMimeType) => {
      const output = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (encoded) => {
            if (encoded) resolve(encoded);
            else reject(new CaseAssetPipelineError(
              'reencode-failed',
              'The browser could not re-encode this image after metadata removal.',
            ));
          },
          mimeType,
          quality,
        );
      });
      if (output.type !== mimeType) {
        throw new CaseAssetPipelineError(
          'reencode-failed',
          `The browser encoded ${output.type || 'an unknown format'} instead of ${mimeType}.`,
        );
      }
      // Bound allocations before inspecting either the first result or fallback.
      validateInputByteLength(output.size, limits);
      const bytes = new Uint8Array(await output.arrayBuffer());
      const inspection = inspectCaseImageBytes(bytes, { declaredMimeType: mimeType, limits });
      if (inspection.width !== decoded.width || inspection.height !== decoded.height) {
        throw new CaseAssetPipelineError(
          'dimensions-mismatch',
          'The browser changed the image dimensions while encoding. Export a fresh teaching image and try again.',
        );
      }
      return { output, metadata: findPortableImageMetadata(bytes, inspection.mimeType) };
    };
    let encoded = await encode(outputMimeType);
    if (encoded.metadata.length && outputMimeType !== 'image/png') {
      // Some browser JPEG/WebP encoders add an ICC profile even to fresh canvas
      // pixels. Retry those same pixels once as PNG, without decoding or drawing
      // the lossy encoded result, and keep the portable metadata guard intact.
      encoded = await encode('image/png');
    }
    if (encoded.metadata.length) {
      throw new CaseAssetPipelineError(
        'reencode-failed',
        'The browser could not produce an image without embedded metadata. Export a fresh PNG teaching image and try again.',
      );
    }
    return encoded.output;
  } finally {
    decoded.close?.();
  }
}

export async function prepareCaseImageAsset(
  file: File,
  options: PrepareCaseImageOptions = {},
): Promise<PreparedCaseImageAsset> {
  const limits = resolveLimits(options.limits);
  // Blob.size is available without reading attacker-controlled bytes. Enforce
  // the cap before arrayBuffer() to avoid allocating a rejected large file.
  validateInputByteLength(file.size, limits);
  const originalBytes = new Uint8Array(await file.arrayBuffer());
  const original = inspectCaseImageBytes(originalBytes, {
    declaredMimeType: file.type,
    fileName: file.name,
    limits,
  });
  const outputMimeType = options.outputMimeType ?? original.mimeType;
  const outputBlob = await reencodeCaseImageWithCanvas(file, {
    outputMimeType,
    quality: options.quality,
    decode: options.decode,
    createCanvas: options.createCanvas,
    limits,
  });
  validateInputByteLength(outputBlob.size, limits);
  const outputBytes = new Uint8Array(await outputBlob.arrayBuffer());
  const output = inspectCaseImageBytes(outputBytes, {
    declaredMimeType: outputBlob.type,
    limits,
  });
  const portableAsset = await createPortableCaseAssetV1(outputBytes);
  return {
    ...portableAsset,
    blob: outputBlob,
    originalName: file.name,
  };
}

export async function prepareCaseImageAssets(
  files: readonly File[],
  options: PrepareCaseImageOptions = {},
): Promise<PreparedCaseImageAsset[]> {
  const limits = resolveLimits(options.limits);
  if (files.length === 0) return [];
  if (files.length > limits.maxAssetCount) {
    throw new CaseAssetPipelineError(
      'too-many-files',
      `Choose no more than ${limits.maxAssetCount} images at a time.`,
    );
  }
  for (const file of files) validateInputByteLength(file.size, limits);
  const inputBytes = files.reduce((total, file) => total + file.size, 0);
  if (inputBytes > limits.maxTotalBytes) {
    throw new CaseAssetPipelineError(
      'total-too-large',
      `The selected files total ${inputBytes} bytes. Choose ${limits.maxTotalBytes} bytes or less.`,
    );
  }

  let inputPixels = 0;
  for (const file of files) {
    const inspection = inspectCaseImageBytes(
      new Uint8Array(await file.arrayBuffer()),
      {
        declaredMimeType: file.type,
        fileName: file.name,
        limits,
      },
    );
    inputPixels += inspection.width * inspection.height;
    if (inputPixels > limits.maxTotalPixels) {
      throw new CaseAssetPipelineError(
        'total-pixels-too-large',
        `The selected stack contains more than ${limits.maxTotalPixels} total pixels. Resize or downsample the images, or choose a smaller stack.`,
      );
    }
  }

  const prepared: PreparedCaseImageAsset[] = [];
  let outputBytes = 0;
  let outputPixels = 0;
  for (const file of files) {
    const asset = await prepareCaseImageAsset(file, options);
    outputBytes += asset.byteLength;
    outputPixels += asset.width * asset.height;
    if (outputBytes > limits.maxTotalBytes) {
      throw new CaseAssetPipelineError(
        'total-too-large',
        `The safely re-encoded images exceed the ${limits.maxTotalBytes}-byte total limit.`,
      );
    }
    if (outputPixels > limits.maxTotalPixels) {
      throw new CaseAssetPipelineError(
        'total-pixels-too-large',
        `The safely re-encoded stack exceeds ${limits.maxTotalPixels} total pixels. Resize or downsample the images, or choose a smaller stack.`,
      );
    }
    prepared.push(asset);
  }
  return prepared;
}
