import {
  validateCasePackageV1,
  type CaseImageFrame,
  type CasePackageV1,
} from './casePackage';
import { validateCaseLessonBundleV1 } from './caseLessonBundle';
import type { LessonPlanV1 } from './lessonPlan';

export const PORTABLE_CASE_PACKAGE_SCHEMA = 'caseattend.portable-case-package' as const;
export const PORTABLE_CASE_PACKAGE_VERSION = '1.0' as const;

export const PORTABLE_CASE_ASSET_LIMITS = Object.freeze({
  maxAssetCount: 256,
  maxAssetBytes: 25 * 1024 * 1024,
  // Leaves at least 32 MiB beneath the .caseattend archive ceiling for the
  // manifest, ZIP records, and worst-case incompressible output.
  maxTotalBytes: 96 * 1024 * 1024,
  maxWidth: 8_192,
  maxHeight: 8_192,
  maxPixels: 16_000_000,
  maxTotalPixels: 64_000_000,
});

export type PortableImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';
export type PortableImageExtension = 'jpg' | 'png' | 'webp';

export interface PortableCaseAssetV1 {
  /** Content-addressed reference used verbatim by the Case Package. */
  uri: string;
  sha256: string;
  mimeType: PortableImageMimeType;
  byteLength: number;
  width: number;
  height: number;
  /** Standard padded base64. No data URL prefix or whitespace is allowed. */
  bytesBase64: string;
}

export interface PortableCasePackageV1 {
  schema: typeof PORTABLE_CASE_PACKAGE_SCHEMA;
  schemaVersion: typeof PORTABLE_CASE_PACKAGE_VERSION;
  casePackage: CasePackageV1;
  lessonPlan: LessonPlanV1;
  assets: readonly PortableCaseAssetV1[];
}

export interface PortableCasePackageValidationResult {
  valid: boolean;
  errors: string[];
}

export interface PortableAssetUriParts {
  sha256: string;
  extension: PortableImageExtension;
  mimeType: PortableImageMimeType;
}

export interface CaseAssetReference {
  path: string;
  uri: string;
  sha256: string;
  mimeType: string;
  width?: number;
  height?: number;
}

export interface PortableImageDimensions {
  width: number;
  height: number;
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const ASSET_URI_PATTERN = /^case:\/\/assets\/([a-f0-9]{64})\.(jpg|png|webp)$/;
const EXTENSION_BY_MIME: Record<PortableImageMimeType, PortableImageExtension> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const MIME_BY_EXTENSION: Record<PortableImageExtension, PortableImageMimeType> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};
const PORTABLE_PRESENTATION_TEXT_CLASSES = new Set([
  'text-amber-400',
  'text-blue-400',
  'text-cyan-400',
  'text-fuchsia-400',
  'text-green-400',
  'text-lime-400',
  'text-orange-400',
  'text-pink-400',
  'text-purple-400',
  'text-red-400',
  'text-rose-400',
  'text-teal-400',
  'text-violet-400',
  'text-yellow-400',
]);
const STRICT_RGBA_PATTERN = /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(0(?:\.\d{1,3})?|1(?:\.0{1,3})?)\s*\)$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPortableMimeType(value: unknown): value is PortableImageMimeType {
  return value === 'image/jpeg' || value === 'image/png' || value === 'image/webp';
}

function validatePortablePresentation(
  casePackage: CasePackageV1,
  errors: string[],
): void {
  const { presentation } = casePackage;
  if (!PORTABLE_PRESENTATION_TEXT_CLASSES.has(presentation.textClass)) {
    errors.push(
      'portablePackage.casePackage.presentation.textClass must be one approved CaseAttend color class.',
    );
  }
  for (const key of ['accentColor', 'accentGlow', 'accentBorder'] as const) {
    const value = presentation[key];
    const match = STRICT_RGBA_PATTERN.exec(value);
    if (
      !match
      || Number(match[1]) > 255
      || Number(match[2]) > 255
      || Number(match[3]) > 255
      || Number(match[4]) > 1
    ) {
      errors.push(
        `portablePackage.casePackage.presentation.${key} must be one strict rgba(r,g,b,a) color with RGB values from 0 to 255 and alpha from 0 to 1.`,
      );
    }
  }
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  errors: string[],
): void {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      errors.push(`${path}.${key} is not valid in Portable Case Package v1.`);
    }
  }
}

function readUint16BigEndian(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint16LittleEndian(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint24LittleEndian(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readUint32BigEndian(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] * 0x1000000)
    + (bytes[offset + 1] << 16)
    + (bytes[offset + 2] << 8)
    + bytes[offset + 3]
  );
}

function readUint32LittleEndian(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]
    + (bytes[offset + 1] << 8)
    + (bytes[offset + 2] << 16)
    + (bytes[offset + 3] * 0x1000000)
  );
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

export function createPortableAssetUri(
  sha256: string,
  mimeType: PortableImageMimeType,
): string {
  if (!SHA256_PATTERN.test(sha256)) {
    throw new Error('sha256 must be a lowercase 64-character SHA-256 digest.');
  }
  if (!isPortableMimeType(mimeType)) {
    throw new Error('mimeType must be image/jpeg, image/png, or image/webp.');
  }
  return `case://assets/${sha256}.${EXTENSION_BY_MIME[mimeType]}`;
}

export function parsePortableAssetUri(value: string): PortableAssetUriParts | null {
  const match = ASSET_URI_PATTERN.exec(value);
  if (!match) return null;
  const extension = match[2] as PortableImageExtension;
  return {
    sha256: match[1],
    extension,
    mimeType: MIME_BY_EXTENSION[extension],
  };
}

export function encodePortableAssetBytes(bytes: Uint8Array): string {
  if (typeof globalThis.btoa !== 'function') {
    throw new Error('Base64 encoding is unavailable in this browser.');
  }
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return globalThis.btoa(binary);
}

export function decodePortableAssetBytes(
  value: string | Pick<PortableCaseAssetV1, 'bytesBase64'>,
): Uint8Array {
  const encoded = typeof value === 'string' ? value : value.bytesBase64;
  if (encoded === '' || !BASE64_PATTERN.test(encoded)) {
    throw new Error('bytesBase64 must be standard padded base64 without whitespace.');
  }
  if (typeof globalThis.atob !== 'function') {
    throw new Error('Base64 decoding is unavailable in this browser.');
  }
  const binary = globalThis.atob(encoded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (encodePortableAssetBytes(bytes) !== encoded) {
    throw new Error('bytesBase64 must use the canonical padded base64 representation.');
  }
  return bytes;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto is unavailable. Portable asset hashing requires crypto.subtle.');
  }
  const source = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', source);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function detectPortableImageMimeType(bytes: Uint8Array): PortableImageMimeType | null {
  if (
    bytes.length >= 3
    && bytes[0] === 0xff
    && bytes[1] === 0xd8
    && bytes[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 12
    && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/**
 * Finds metadata containers that may carry identifiers even when the visible
 * pixels look safe. Portable Case Package assets must be pixel-only exports.
 */
export function findPortableImageMetadata(
  bytes: Uint8Array,
  mimeType: PortableImageMimeType,
): string[] {
  const findings = new Set<string>();
  if (mimeType === 'image/jpeg') {
    const allowedApplicationMarkers = new Set([0xe0, 0xee]);
    let offset = 2;
    let sawEndOfImage = false;
    while (offset < bytes.length) {
      while (offset < bytes.length && bytes[offset] !== 0xff) offset += 1;
      while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
      if (offset >= bytes.length) {
        findings.add('JPEG missing EOI or incomplete container');
        break;
      }
      const marker = bytes[offset];
      offset += 1;
      if (marker === 0xd9) {
        sawEndOfImage = true;
        if (offset !== bytes.length) findings.add('JPEG trailing bytes after EOI');
        break;
      }
      if (marker === 0x00 || marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
        continue;
      }
      if (offset + 1 >= bytes.length) {
        findings.add('JPEG missing EOI or incomplete container');
        break;
      }
      const segmentLength = readUint16BigEndian(bytes, offset);
      if (segmentLength < 2 || offset + segmentLength > bytes.length) {
        findings.add('JPEG missing EOI or incomplete container');
        break;
      }
      const payloadOffset = offset + 2;
      if (marker === 0xe1) findings.add('JPEG EXIF or XMP (APP1)');
      else if (marker === 0xe2 && ascii(bytes, payloadOffset, 12) === 'ICC_PROFILE\0') {
        findings.add('JPEG ICC profile (APP2)');
      }
      else if (marker === 0xed) findings.add('JPEG IPTC (APP13)');
      else if (marker === 0xfe) findings.add('JPEG comment');
      else if (marker >= 0xe0 && marker <= 0xef) {
        const isRecognizedContainerMarker = marker === 0xe0
          ? ascii(bytes, payloadOffset, 5) === 'JFIF\0'
          : marker === 0xee
            ? ascii(bytes, payloadOffset, 5) === 'Adobe'
            : false;
        if (!allowedApplicationMarkers.has(marker) || !isRecognizedContainerMarker) {
          findings.add(`JPEG application metadata (APP${marker - 0xe0})`);
        }
      }
      offset += segmentLength;
    }
    if (!sawEndOfImage && !findings.has('JPEG missing EOI or incomplete container')) {
      findings.add('JPEG missing EOI or incomplete container');
    }
    return [...findings];
  }

  if (mimeType === 'image/png') {
    const namedUnsafeChunks: Readonly<Record<string, string>> = {
      tEXt: 'PNG text (tEXt)',
      zTXt: 'PNG compressed text (zTXt)',
      iTXt: 'PNG international text (iTXt)',
      eXIf: 'PNG EXIF (eXIf)',
      tIME: 'PNG modification time (tIME)',
      iCCP: 'PNG ICC profile (iCCP)',
    };
    const allowedChunks = new Set([
      'IHDR', 'PLTE', 'IDAT', 'IEND',
      'tRNS', 'cHRM', 'gAMA', 'sBIT', 'sRGB', 'bKGD', 'pHYs',
      'cICP', 'mDCv', 'cLLi',
    ]);
    let offset = 8;
    let sawImageEnd = false;
    while (offset < bytes.length) {
      if (offset + 12 > bytes.length) {
        findings.add('PNG missing IEND or incomplete container');
        break;
      }
      const dataLength = readUint32BigEndian(bytes, offset);
      const chunkEnd = offset + 12 + dataLength;
      if (!Number.isSafeInteger(chunkEnd) || chunkEnd > bytes.length) {
        findings.add('PNG missing IEND or incomplete container');
        break;
      }
      const chunkType = ascii(bytes, offset + 4, 4);
      const finding = namedUnsafeChunks[chunkType];
      if (finding) findings.add(finding);
      else if (!allowedChunks.has(chunkType)) findings.add(`PNG unsupported ancillary or container chunk (${chunkType})`);
      offset = chunkEnd;
      if (chunkType === 'IEND') {
        sawImageEnd = true;
        if (dataLength !== 0) findings.add('PNG invalid IEND chunk');
        if (offset !== bytes.length) findings.add('PNG trailing bytes after IEND');
        break;
      }
    }
    if (!sawImageEnd && !findings.has('PNG missing IEND or incomplete container')) {
      findings.add('PNG missing IEND or incomplete container');
    }
    return [...findings];
  }

  const declaredRiffSize = readUint32LittleEndian(bytes, 4);
  const declaredContainerEnd = 8 + declaredRiffSize;
  if (declaredRiffSize < 4 || declaredContainerEnd !== bytes.length) {
    findings.add('WebP RIFF size does not match the file length');
  }
  const containerEnd = Math.min(bytes.length, declaredContainerEnd);
  let offset = 12;
  while (offset < containerEnd) {
    if (offset + 8 > containerEnd) {
      findings.add('WebP incomplete container chunk');
      break;
    }
    const chunkType = ascii(bytes, offset, 4);
    const dataLength = readUint32LittleEndian(bytes, offset + 4);
    const paddedDataLength = dataLength + (dataLength % 2);
    const chunkEnd = offset + 8 + paddedDataLength;
    if (!Number.isSafeInteger(chunkEnd) || chunkEnd > containerEnd) {
      findings.add('WebP incomplete container chunk');
      break;
    }
    if (chunkType === 'EXIF') findings.add('WebP EXIF');
    else if (chunkType === 'XMP ') findings.add('WebP XMP');
    else if (chunkType === 'ICCP') findings.add('WebP ICC profile');
    else if (chunkType === 'ANIM' || chunkType === 'ANMF') findings.add('WebP animation');
    else if (!['VP8 ', 'VP8L', 'VP8X', 'ALPH'].includes(chunkType)) {
      findings.add(`WebP unsupported container chunk (${chunkType})`);
    }
    offset = chunkEnd;
  }
  return [...findings];
}

export function readPortableImageDimensions(
  bytes: Uint8Array,
  mimeType: PortableImageMimeType,
): PortableImageDimensions | null {
  if (mimeType === 'image/png') {
    if (bytes.length < 24 || detectPortableImageMimeType(bytes) !== mimeType) return null;
    const width = readUint32BigEndian(bytes, 16);
    const height = readUint32BigEndian(bytes, 20);
    return width > 0 && height > 0 ? { width, height } : null;
  }

  if (mimeType === 'image/jpeg') {
    if (bytes.length < 12 || detectPortableImageMimeType(bytes) !== mimeType) return null;
    const startOfFrameMarkers = new Set([
      0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
    ]);
    let offset = 2;
    while (offset + 3 < bytes.length) {
      while (offset < bytes.length && bytes[offset] !== 0xff) offset += 1;
      while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
      if (offset >= bytes.length) break;
      const marker = bytes[offset];
      offset += 1;
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (marker === 0xda) break;
      if (offset + 1 >= bytes.length) break;
      const segmentLength = readUint16BigEndian(bytes, offset);
      if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;
      if (startOfFrameMarkers.has(marker)) {
        if (segmentLength < 7 || offset + 6 >= bytes.length) return null;
        const height = readUint16BigEndian(bytes, offset + 3);
        const width = readUint16BigEndian(bytes, offset + 5);
        return width > 0 && height > 0 ? { width, height } : null;
      }
      offset += segmentLength;
    }
    return null;
  }

  if (bytes.length < 30 || detectPortableImageMimeType(bytes) !== mimeType) return null;
  const chunkType = String.fromCharCode(...bytes.subarray(12, 16));
  if (chunkType === 'VP8X') {
    const width = readUint24LittleEndian(bytes, 24) + 1;
    const height = readUint24LittleEndian(bytes, 27) + 1;
    return { width, height };
  }
  if (
    chunkType === 'VP8 '
    && bytes.length >= 30
    && bytes[23] === 0x9d
    && bytes[24] === 0x01
    && bytes[25] === 0x2a
  ) {
    const width = readUint16LittleEndian(bytes, 26) & 0x3fff;
    const height = readUint16LittleEndian(bytes, 28) & 0x3fff;
    return width > 0 && height > 0 ? { width, height } : null;
  }
  if (chunkType === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
    const width = 1 + (bytes[21] | ((bytes[22] & 0x3f) << 8));
    const height = 1 + ((bytes[22] >> 6) | (bytes[23] << 2) | ((bytes[24] & 0x0f) << 10));
    return { width, height };
  }
  return null;
}

function frameReferences(
  frames: readonly CaseImageFrame[],
  seriesIndex: number,
): CaseAssetReference[] {
  return frames.map((frame, frameIndex) => ({
    path: `casePackage.artifact.series[${seriesIndex}].frames[${frameIndex}]`,
    uri: frame.src,
    sha256: frame.sha256,
    mimeType: frame.mimeType,
    width: frame.width,
    height: frame.height,
  }));
}

export function collectCaseAssetReferences(casePackage: CasePackageV1): CaseAssetReference[] {
  const artifactReferences: CaseAssetReference[] = casePackage.artifact.kind === 'image'
    ? [{
        path: 'casePackage.artifact',
        uri: casePackage.artifact.src,
        sha256: casePackage.artifact.sha256,
        mimeType: casePackage.artifact.mimeType,
        width: casePackage.artifact.width,
        height: casePackage.artifact.height,
      }]
    : casePackage.artifact.series.flatMap((series, seriesIndex) => (
        frameReferences(series.frames, seriesIndex)
      ));
  return [
    ...artifactReferences,
    {
      path: 'casePackage.preview',
      uri: casePackage.preview.src,
      sha256: casePackage.preview.sha256,
      mimeType: casePackage.preview.mimeType,
      width: casePackage.preview.width,
      height: casePackage.preview.height,
    },
  ];
}

function validateReference(
  reference: CaseAssetReference,
  errors: string[],
): PortableAssetUriParts | null {
  const parsed = parsePortableAssetUri(reference.uri);
  if (!parsed) {
    errors.push(`${reference.path}.src must exactly match case://assets/<sha256>.<jpg|png|webp>.`);
    return null;
  }
  if (reference.sha256 !== parsed.sha256) {
    errors.push(`${reference.path}.sha256 must match the digest encoded in its asset URI.`);
  }
  if (reference.mimeType !== parsed.mimeType) {
    errors.push(`${reference.path}.mimeType must match the extension encoded in its asset URI.`);
  }
  if (!Number.isInteger(reference.width) || (reference.width ?? 0) <= 0) {
    errors.push(`${reference.path}.width is required for a portable asset and must be a positive integer.`);
  }
  if (!Number.isInteger(reference.height) || (reference.height ?? 0) <= 0) {
    errors.push(`${reference.path}.height is required for a portable asset and must be a positive integer.`);
  }
  return parsed;
}

function validatePositiveInteger(
  value: unknown,
  path: string,
  errors: string[],
): value is number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    errors.push(`${path} must be a positive integer.`);
    return false;
  }
  return true;
}

function validateDimensionLimits(
  dimensions: PortableImageDimensions,
  path: string,
  errors: string[],
): void {
  if (dimensions.width > PORTABLE_CASE_ASSET_LIMITS.maxWidth) {
    errors.push(`${path}.width exceeds the ${PORTABLE_CASE_ASSET_LIMITS.maxWidth}-pixel limit.`);
  }
  if (dimensions.height > PORTABLE_CASE_ASSET_LIMITS.maxHeight) {
    errors.push(`${path}.height exceeds the ${PORTABLE_CASE_ASSET_LIMITS.maxHeight}-pixel limit.`);
  }
  if (dimensions.width * dimensions.height > PORTABLE_CASE_ASSET_LIMITS.maxPixels) {
    errors.push(`${path} exceeds the ${PORTABLE_CASE_ASSET_LIMITS.maxPixels}-pixel limit.`);
  }
}

export async function createPortableCaseAssetV1(
  bytes: Uint8Array,
): Promise<PortableCaseAssetV1> {
  if (bytes.byteLength === 0) throw new Error('Portable case assets cannot be empty.');
  if (bytes.byteLength > PORTABLE_CASE_ASSET_LIMITS.maxAssetBytes) {
    throw new Error(`Portable case assets cannot exceed ${PORTABLE_CASE_ASSET_LIMITS.maxAssetBytes} bytes.`);
  }
  const mimeType = detectPortableImageMimeType(bytes);
  if (!mimeType) throw new Error('Asset bytes must be a JPEG, PNG, or WebP image.');
  const metadata = findPortableImageMetadata(bytes, mimeType);
  if (metadata.length > 0) {
    throw new Error(
      `Asset contains embedded metadata that must be removed before packaging: ${metadata.join(', ')}. Re-encode the visible pixels through canvas first.`,
    );
  }
  const dimensions = readPortableImageDimensions(bytes, mimeType);
  if (!dimensions) throw new Error('The image dimensions could not be read from the asset bytes.');
  const limitErrors: string[] = [];
  validateDimensionLimits(dimensions, 'asset', limitErrors);
  if (limitErrors.length > 0) throw new Error(limitErrors.join('\n'));
  const sha256 = await sha256Hex(bytes);
  return {
    uri: createPortableAssetUri(sha256, mimeType),
    sha256,
    mimeType,
    byteLength: bytes.byteLength,
    width: dimensions.width,
    height: dimensions.height,
    bytesBase64: encodePortableAssetBytes(bytes),
  };
}

export async function validatePortableCasePackageV1(
  value: unknown,
): Promise<PortableCasePackageValidationResult> {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { valid: false, errors: ['portablePackage is required and must be an object.'] };
  }
  rejectUnknownKeys(
    value,
    ['schema', 'schemaVersion', 'casePackage', 'lessonPlan', 'assets'],
    'portablePackage',
    errors,
  );
  if (value.schema !== PORTABLE_CASE_PACKAGE_SCHEMA) {
    errors.push(`portablePackage.schema must be '${PORTABLE_CASE_PACKAGE_SCHEMA}'.`);
  }
  if (value.schemaVersion !== PORTABLE_CASE_PACKAGE_VERSION) {
    errors.push(`portablePackage.schemaVersion must be '${PORTABLE_CASE_PACKAGE_VERSION}'.`);
  }

  const bundleValidation = await validateCaseLessonBundleV1({
    schema: 'caseattend.case-lesson-bundle',
    schemaVersion: '1.0',
    casePackage: value.casePackage,
    lessonPlan: value.lessonPlan,
  });
  errors.push(...bundleValidation.errors.map((error) => `portablePackage: ${error}`));

  const caseValidation = validateCasePackageV1(value.casePackage);
  const requiredAssets = new Map<string, CaseAssetReference>();
  let caseReferences: CaseAssetReference[] = [];
  if (caseValidation.valid) {
    const casePackage = value.casePackage as CasePackageV1;
    validatePortablePresentation(casePackage, errors);
    caseReferences = collectCaseAssetReferences(casePackage);
    for (const reference of caseReferences) {
      validateReference(reference, errors);
      const existing = requiredAssets.get(reference.uri);
      if (existing) {
        if (
          existing.sha256 !== reference.sha256
          || existing.mimeType !== reference.mimeType
          || existing.width !== reference.width
          || existing.height !== reference.height
        ) {
          errors.push(`${reference.path} must exactly match the other Case Package reference to ${reference.uri}.`);
        }
      } else {
        requiredAssets.set(reference.uri, reference);
      }
    }
    const artifactReferences = caseReferences.filter(
      (reference) => reference.path !== 'casePackage.preview',
    );
    if (artifactReferences.length > PORTABLE_CASE_ASSET_LIMITS.maxAssetCount) {
      errors.push(
        `casePackage.artifact cannot reference more than ${PORTABLE_CASE_ASSET_LIMITS.maxAssetCount} frames.`,
      );
    }
    const totalReferencedPixels = artifactReferences.reduce((total, reference) => (
      total + (
        Number.isInteger(reference.width)
        && Number.isInteger(reference.height)
        && (reference.width ?? 0) > 0
        && (reference.height ?? 0) > 0
          ? (reference.width as number) * (reference.height as number)
          : 0
      )
    ), 0);
    if (totalReferencedPixels > PORTABLE_CASE_ASSET_LIMITS.maxTotalPixels) {
      errors.push(
        `casePackage.artifact exceeds the ${PORTABLE_CASE_ASSET_LIMITS.maxTotalPixels}-pixel total stack limit. Resize images or use a smaller stack.`,
      );
    }
  }

  if (!Array.isArray(value.assets)) {
    errors.push('portablePackage.assets is required and must be an array.');
    return { valid: false, errors };
  }
  if (value.assets.length === 0) {
    errors.push('portablePackage.assets must contain at least one image asset.');
  }
  if (value.assets.length > PORTABLE_CASE_ASSET_LIMITS.maxAssetCount) {
    errors.push(`portablePackage.assets cannot contain more than ${PORTABLE_CASE_ASSET_LIMITS.maxAssetCount} assets.`);
  }

  const seenUris = new Set<string>();
  let totalBytes = 0;
  let totalPixels = 0;
  let totalPixelLimitReported = false;
  for (let index = 0; index < value.assets.length; index += 1) {
    const path = `portablePackage.assets[${index}]`;
    const rawAsset = value.assets[index];
    if (!isRecord(rawAsset)) {
      errors.push(`${path} must be an object.`);
      continue;
    }
    rejectUnknownKeys(
      rawAsset,
      ['uri', 'sha256', 'mimeType', 'byteLength', 'width', 'height', 'bytesBase64'],
      path,
      errors,
    );
    const parsedUri = typeof rawAsset.uri === 'string' ? parsePortableAssetUri(rawAsset.uri) : null;
    if (!parsedUri) errors.push(`${path}.uri must exactly match case://assets/<sha256>.<jpg|png|webp>.`);
    if (typeof rawAsset.uri === 'string') {
      if (seenUris.has(rawAsset.uri)) errors.push(`${path}.uri duplicates another portable asset.`);
      seenUris.add(rawAsset.uri);
    }
    if (typeof rawAsset.sha256 !== 'string' || !SHA256_PATTERN.test(rawAsset.sha256)) {
      errors.push(`${path}.sha256 must be a lowercase 64-character SHA-256 digest.`);
    }
    if (!isPortableMimeType(rawAsset.mimeType)) {
      errors.push(`${path}.mimeType must be image/jpeg, image/png, or image/webp.`);
    }
    const hasByteLength = validatePositiveInteger(rawAsset.byteLength, `${path}.byteLength`, errors);
    const hasWidth = validatePositiveInteger(rawAsset.width, `${path}.width`, errors);
    const hasHeight = validatePositiveInteger(rawAsset.height, `${path}.height`, errors);
    if (parsedUri && rawAsset.sha256 !== parsedUri.sha256) {
      errors.push(`${path}.sha256 must match the digest encoded in its URI.`);
    }
    if (parsedUri && rawAsset.mimeType !== parsedUri.mimeType) {
      errors.push(`${path}.mimeType must match the extension encoded in its URI.`);
    }

    let bytes: Uint8Array | null = null;
    if (typeof rawAsset.bytesBase64 !== 'string') {
      errors.push(`${path}.bytesBase64 is required and must be a string.`);
    } else if (
      rawAsset.bytesBase64.length
      > Math.ceil(PORTABLE_CASE_ASSET_LIMITS.maxAssetBytes / 3) * 4
    ) {
      errors.push(`${path}.bytesBase64 exceeds the encoded asset size limit.`);
    } else {
      try {
        bytes = decodePortableAssetBytes(rawAsset.bytesBase64);
      } catch (error) {
        errors.push(`${path}.${error instanceof Error ? error.message : 'bytesBase64 is invalid.'}`);
      }
    }
    if (!bytes) continue;
    totalBytes += bytes.byteLength;
    if (totalBytes > PORTABLE_CASE_ASSET_LIMITS.maxTotalBytes) {
      errors.push(`portablePackage.assets exceed the ${PORTABLE_CASE_ASSET_LIMITS.maxTotalBytes}-byte total limit.`);
      continue;
    }
    if (hasByteLength && rawAsset.byteLength !== bytes.byteLength) {
      errors.push(`${path}.byteLength must match the decoded asset length.`);
    }
    if (bytes.byteLength > PORTABLE_CASE_ASSET_LIMITS.maxAssetBytes) {
      errors.push(`${path} exceeds the ${PORTABLE_CASE_ASSET_LIMITS.maxAssetBytes}-byte asset limit.`);
    }
    const detectedMime = detectPortableImageMimeType(bytes);
    if (!detectedMime) {
      errors.push(`${path}.bytesBase64 must decode to a JPEG, PNG, or WebP image.`);
      continue;
    }
    if (isPortableMimeType(rawAsset.mimeType) && rawAsset.mimeType !== detectedMime) {
      errors.push(`${path}.mimeType must match the image byte signature.`);
    }
    const metadata = findPortableImageMetadata(bytes, detectedMime);
    if (metadata.length > 0) {
      errors.push(
        `${path} contains embedded metadata that may carry identifiers: ${metadata.join(', ')}. Re-encode the visible pixels before import.`,
      );
    }
    const dimensions = readPortableImageDimensions(bytes, detectedMime);
    if (!dimensions) {
      errors.push(`${path} dimensions could not be read from the image bytes.`);
    } else {
      if (hasWidth && rawAsset.width !== dimensions.width) {
        errors.push(`${path}.width must match the image bytes.`);
      }
      if (hasHeight && rawAsset.height !== dimensions.height) {
        errors.push(`${path}.height must match the image bytes.`);
      }
      validateDimensionLimits(dimensions, path, errors);
      totalPixels += dimensions.width * dimensions.height;
      if (
        totalPixels > PORTABLE_CASE_ASSET_LIMITS.maxTotalPixels
        && !totalPixelLimitReported
      ) {
        totalPixelLimitReported = true;
        errors.push(
          `portablePackage.assets exceed the ${PORTABLE_CASE_ASSET_LIMITS.maxTotalPixels}-pixel total limit. Resize images or use a smaller stack.`,
        );
      }
    }
    if (typeof rawAsset.sha256 === 'string' && SHA256_PATTERN.test(rawAsset.sha256)) {
      const actualDigest = await sha256Hex(bytes);
      if (rawAsset.sha256 !== actualDigest) {
        errors.push(`${path}.sha256 must match the decoded asset bytes.`);
      }
    }
  }
  for (const reference of caseReferences) {
    const asset = value.assets.find(
      (candidate) => isRecord(candidate) && candidate.uri === reference.uri,
    );
    if (!asset) {
      errors.push(`${reference.path}.src has no matching entry in portablePackage.assets.`);
      continue;
    }
    if (
      asset.sha256 !== reference.sha256
      || asset.mimeType !== reference.mimeType
      || asset.width !== reference.width
      || asset.height !== reference.height
    ) {
      errors.push(`${reference.path} must exactly match its portablePackage.assets entry.`);
    }
  }
  for (const asset of value.assets) {
    if (isRecord(asset) && typeof asset.uri === 'string' && !requiredAssets.has(asset.uri)) {
      errors.push(`portablePackage.assets contains unreferenced asset ${asset.uri}.`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export async function createPortableCasePackageV1(
  casePackage: CasePackageV1,
  lessonPlan: LessonPlanV1,
  assets: readonly PortableCaseAssetV1[],
): Promise<PortableCasePackageV1> {
  const portablePackage: PortableCasePackageV1 = {
    schema: PORTABLE_CASE_PACKAGE_SCHEMA,
    schemaVersion: PORTABLE_CASE_PACKAGE_VERSION,
    casePackage,
    lessonPlan,
    assets: [...assets].sort((left, right) => left.uri.localeCompare(right.uri)),
  };
  const validation = await validatePortableCasePackageV1(portablePackage);
  if (!validation.valid) {
    throw new Error(
      `Cannot create an invalid Portable Case Package v1:\n${validation.errors.map((error) => `- ${error}`).join('\n')}`,
    );
  }
  return portablePackage;
}
