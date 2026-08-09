import { unzipSync, zipSync, type Zippable } from 'fflate';
import {
  canonicalizeJson,
  type CasePackageV1,
} from '../core/casePackage';
import type { LessonPlanV1 } from '../core/lessonPlan';
import {
  createPortableAssetUri,
  decodePortableAssetBytes,
  encodePortableAssetBytes,
  parsePortableAssetUri,
  PORTABLE_CASE_PACKAGE_SCHEMA,
  PORTABLE_CASE_PACKAGE_VERSION,
  validatePortableCasePackageV1,
  type PortableCaseAssetV1,
  type PortableCasePackageV1,
  type PortableImageMimeType,
} from '../core/portableCasePackage';

export const PORTABLE_CASE_ARCHIVE_SCHEMA = 'caseattend.portable-case-archive' as const;
export const PORTABLE_CASE_ARCHIVE_VERSION = '1.0' as const;
export const PORTABLE_CASE_ARCHIVE_EXTENSION = '.caseattend' as const;
export const PORTABLE_CASE_ARCHIVE_MIME_TYPE = 'application/vnd.caseattend.case+zip' as const;

const MANIFEST_PATH = 'manifest.json';
export const PORTABLE_CASE_ARCHIVE_LIMITS = Object.freeze({
  maxArchiveBytes: 128 * 1024 * 1024,
  // This JSON later supplies provider prompt content. Keep it substantially
  // below the archive limit so a schema-valid import cannot amplify one lesson
  // into an unexpectedly large or costly inference request.
  maxManifestBytes: 512 * 1024,
  maxTotalUncompressedBytes: 100 * 1024 * 1024,
  // Covers local/central headers and worst-case deflate expansion for the
  // portable asset ceiling without allocating a near-limit fixture in tests.
  zipOverheadBudgetBytes: 2 * 1024 * 1024,
});
const MAX_ARCHIVE_BYTES = PORTABLE_CASE_ARCHIVE_LIMITS.maxArchiveBytes;
const MAX_MANIFEST_BYTES = PORTABLE_CASE_ARCHIVE_LIMITS.maxManifestBytes;
const MAX_ASSET_BYTES = 32 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED_BYTES = PORTABLE_CASE_ARCHIVE_LIMITS.maxTotalUncompressedBytes;
const MAX_ARCHIVE_ENTRIES = 258;
const MAX_COMPRESSION_RATIO = 200;
const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const ZIP64_SENTINEL_16 = 0xffff;
const ZIP64_SENTINEL_32 = 0xffffffff;
const SAFE_ENTRY_PATH = /^(?:manifest\.json|assets\/[a-f0-9]{64}\.(?:jpg|png|webp))$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const textEncoder = new TextEncoder();

interface PortableArchiveAssetDescriptor {
  uri: string;
  path: string;
  sha256: string;
  mimeType: PortableImageMimeType;
  byteLength: number;
  width: number;
  height: number;
}

interface PortableArchiveManifestV1 {
  schema: typeof PORTABLE_CASE_ARCHIVE_SCHEMA;
  schemaVersion: typeof PORTABLE_CASE_ARCHIVE_VERSION;
  casePackage: CasePackageV1;
  lessonPlan: LessonPlanV1;
  assets: PortableArchiveAssetDescriptor[];
}

interface ZipEntryMetadata {
  path: string;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  dataEnd: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rejectUnknownKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(record).filter((key) => !allowedSet.has(key));
  if (unknown.length > 0) {
    throw new Error(`${path}.${unknown[0]} is not allowed in a CaseAttend archive.`);
  }
}

function archiveAssetPath(asset: Pick<PortableCaseAssetV1, 'uri' | 'sha256' | 'mimeType'>): string {
  const parsed = parsePortableAssetUri(asset.uri);
  if (!parsed || parsed.sha256 !== asset.sha256 || parsed.mimeType !== asset.mimeType) {
    throw new Error(`Portable asset ${asset.uri} does not match its digest and MIME type.`);
  }
  return `assets/${asset.uri.slice('case://assets/'.length)}`;
}

function portableValidationError(errors: readonly string[]): Error {
  return new Error(
    `Cannot archive an invalid Portable Case Package v1:\n${errors.map((error) => `- ${error}`).join('\n')}`,
  );
}

function asUint8Array(value: Uint8Array | ArrayBuffer): Uint8Array<ArrayBuffer> {
  if (value instanceof Uint8Array) {
    const copy = new Uint8Array(value.byteLength);
    copy.set(value);
    return copy;
  }
  return new Uint8Array(value.slice(0));
}

function decodeAsciiPath(bytes: Uint8Array): string {
  if (bytes.length === 0 || bytes.some((byte) => byte > 0x7f || byte === 0)) {
    throw new Error('Archive entry names must be non-empty ASCII paths.');
  }
  return String.fromCharCode(...bytes);
}

function safeEntryPath(path: string): boolean {
  if (
    path.startsWith('/')
    || path.includes('\\')
    || path.includes('//')
    || path.split('/').some((component) => component === '.' || component === '..')
  ) {
    return false;
  }
  return SAFE_ENTRY_PATH.test(path);
}

function findEndOfCentralDirectory(view: DataView): number {
  const minimumOffset = Math.max(0, view.byteLength - 65_557);
  for (let offset = view.byteLength - 22; offset >= minimumOffset; offset -= 1) {
    if (view.getUint32(offset, true) !== ZIP_EOCD_SIGNATURE) continue;
    const commentLength = view.getUint16(offset + 20, true);
    if (offset + 22 + commentLength === view.byteLength) return offset;
  }
  throw new Error('The selected file is not a complete ZIP archive.');
}

/**
 * Inspect central and local headers before decompression. unzipSync returns a
 * name-keyed object, so this pass is also the boundary that rejects duplicate
 * entries instead of allowing a later entry to silently replace an earlier one.
 */
function inspectZipEntries(bytes: Uint8Array): ZipEntryMetadata[] {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_ARCHIVE_BYTES) {
    throw new Error(`CaseAttend archives must be between 1 byte and ${MAX_ARCHIVE_BYTES} bytes.`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(view);
  if (view.getUint16(eocdOffset + 20, true) !== 0) {
    throw new Error('ZIP archive comments are not allowed in a CaseAttend archive.');
  }
  const diskNumber = view.getUint16(eocdOffset + 4, true);
  const centralDisk = view.getUint16(eocdOffset + 6, true);
  const diskEntryCount = view.getUint16(eocdOffset + 8, true);
  const totalEntryCount = view.getUint16(eocdOffset + 10, true);
  const centralSize = view.getUint32(eocdOffset + 12, true);
  const centralOffset = view.getUint32(eocdOffset + 16, true);

  if (diskNumber !== 0 || centralDisk !== 0 || diskEntryCount !== totalEntryCount) {
    throw new Error('Multi-disk ZIP archives are not supported.');
  }
  if (
    totalEntryCount === ZIP64_SENTINEL_16
    || centralSize === ZIP64_SENTINEL_32
    || centralOffset === ZIP64_SENTINEL_32
  ) {
    throw new Error('ZIP64 archives are not supported.');
  }
  if (totalEntryCount < 2 || totalEntryCount > MAX_ARCHIVE_ENTRIES) {
    throw new Error(`A CaseAttend archive must contain 2 to ${MAX_ARCHIVE_ENTRIES} entries.`);
  }
  if (centralOffset + centralSize !== eocdOffset) {
    throw new Error('ZIP central directory bounds are inconsistent.');
  }

  const seenPaths = new Set<string>();
  const seenLocalOffsets = new Set<number>();
  const entries: ZipEntryMetadata[] = [];
  let totalUncompressed = 0;
  let offset = centralOffset;

  for (let index = 0; index < totalEntryCount; index += 1) {
    if (offset + 46 > eocdOffset || view.getUint32(offset, true) !== ZIP_CENTRAL_SIGNATURE) {
      throw new Error('ZIP central directory is malformed.');
    }
    const flags = view.getUint16(offset + 8, true);
    const compressionMethod = view.getUint16(offset + 10, true);
    const crc32 = view.getUint32(offset + 16, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const entryEnd = offset + 46 + nameLength + extraLength + commentLength;
    if (entryEnd > eocdOffset) throw new Error('ZIP central directory entry is truncated.');
    if (extraLength !== 0 || commentLength !== 0) {
      throw new Error('ZIP entry extra fields and comments are not allowed in a CaseAttend archive.');
    }
    if ((flags & 0x0001) !== 0) throw new Error('Encrypted ZIP entries are not supported.');
    if ((flags & 0x0008) !== 0) {
      throw new Error('ZIP data descriptors are not allowed in a CaseAttend archive.');
    }
    if ((flags & ~(0x0006 | 0x0008 | 0x0800)) !== 0) {
      throw new Error('The ZIP entry uses unsupported general-purpose flags.');
    }
    if (compressionMethod !== 0 && compressionMethod !== 8) {
      throw new Error('Only stored or deflated ZIP entries are supported.');
    }
    if (
      compressedSize === ZIP64_SENTINEL_32
      || uncompressedSize === ZIP64_SENTINEL_32
      || localHeaderOffset === ZIP64_SENTINEL_32
    ) {
      throw new Error('ZIP64 entries are not supported.');
    }

    const path = decodeAsciiPath(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if (!safeEntryPath(path)) {
      throw new Error(`Archive entry '${path}' is not an allowed CaseAttend path.`);
    }
    if (seenPaths.has(path)) throw new Error(`Archive entry '${path}' is duplicated.`);
    if (seenLocalOffsets.has(localHeaderOffset)) {
      throw new Error('ZIP entries cannot share a local file header.');
    }
    seenPaths.add(path);
    seenLocalOffsets.add(localHeaderOffset);

    const entryLimit = path === MANIFEST_PATH ? MAX_MANIFEST_BYTES : MAX_ASSET_BYTES;
    if (path === MANIFEST_PATH && uncompressedSize > MAX_MANIFEST_BYTES) {
      throw new Error(
        `manifest.json cannot exceed ${MAX_MANIFEST_BYTES} bytes. Shorten the authored case and lesson text, then export it again.`,
      );
    }
    if (uncompressedSize === 0 || uncompressedSize > entryLimit) {
      throw new Error(`Archive entry '${path}' exceeds its allowed size.`);
    }
    if (
      compressedSize > 0
      && uncompressedSize > 1_048_576
      && uncompressedSize / compressedSize > MAX_COMPRESSION_RATIO
    ) {
      throw new Error(`Archive entry '${path}' has an unsafe compression ratio.`);
    }
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw new Error('The archive exceeds the total uncompressed size limit.');
    }

    if (
      localHeaderOffset + 30 > centralOffset
      || view.getUint32(localHeaderOffset, true) !== ZIP_LOCAL_SIGNATURE
    ) {
      throw new Error(`Archive entry '${path}' has an invalid local file header.`);
    }
    const localFlags = view.getUint16(localHeaderOffset + 6, true);
    const localMethod = view.getUint16(localHeaderOffset + 8, true);
    const localCrc32 = view.getUint32(localHeaderOffset + 14, true);
    const localCompressedSize = view.getUint32(localHeaderOffset + 18, true);
    const localUncompressedSize = view.getUint32(localHeaderOffset + 22, true);
    const localNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    if (localExtraLength !== 0) {
      throw new Error(`Archive entry '${path}' cannot contain a local ZIP extra field.`);
    }
    const localNameEnd = localHeaderOffset + 30 + localNameLength;
    const dataOffset = localNameEnd + localExtraLength;
    if (dataOffset + compressedSize > centralOffset) {
      throw new Error(`Archive entry '${path}' points outside its local data bounds.`);
    }
    const localPath = decodeAsciiPath(bytes.subarray(localHeaderOffset + 30, localNameEnd));
    if (localPath !== path || localFlags !== flags || localMethod !== compressionMethod) {
      throw new Error(`Archive entry '${path}' has conflicting local and central metadata.`);
    }
    if (
      localCrc32 !== crc32
      || localCompressedSize !== compressedSize
      || localUncompressedSize !== uncompressedSize
    ) {
      throw new Error(`Archive entry '${path}' has conflicting local integrity metadata.`);
    }

    entries.push({
      path,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      dataEnd: dataOffset + compressedSize,
    });
    offset = entryEnd;
  }

  if (offset !== eocdOffset || !seenPaths.has(MANIFEST_PATH)) {
    throw new Error('The archive must contain exactly one manifest.json entry.');
  }
  const localRanges = [...entries].sort(
    (left, right) => left.localHeaderOffset - right.localHeaderOffset,
  );
  if (localRanges[0].localHeaderOffset !== 0) {
    throw new Error('A CaseAttend archive cannot contain bytes before its first ZIP entry.');
  }
  for (let index = 1; index < localRanges.length; index += 1) {
    if (localRanges[index].localHeaderOffset !== localRanges[index - 1].dataEnd) {
      throw new Error('ZIP entries must be contiguous without hidden or overlapping data.');
    }
  }
  if (localRanges.at(-1)?.dataEnd !== centralOffset) {
    throw new Error('A CaseAttend archive cannot contain hidden data before its central directory.');
  }
  return entries;
}

function parseArchiveManifest(bytes: Uint8Array): PortableArchiveManifestV1 {
  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('manifest.json must be valid UTF-8.');
  }
  let value: unknown;
  try {
    value = JSON.parse(decoded);
  } catch {
    throw new Error('manifest.json must contain valid JSON.');
  }
  if (!isRecord(value)) throw new Error('manifest.json must contain an object.');
  rejectUnknownKeys(value, ['schema', 'schemaVersion', 'casePackage', 'lessonPlan', 'assets'], 'manifest');
  if (value.schema !== PORTABLE_CASE_ARCHIVE_SCHEMA) {
    throw new Error(`manifest.schema must be '${PORTABLE_CASE_ARCHIVE_SCHEMA}'.`);
  }
  if (value.schemaVersion !== PORTABLE_CASE_ARCHIVE_VERSION) {
    throw new Error(`manifest.schemaVersion must be '${PORTABLE_CASE_ARCHIVE_VERSION}'.`);
  }
  if (!Array.isArray(value.assets) || value.assets.length === 0 || value.assets.length > 256) {
    throw new Error('manifest.assets must contain 1 to 256 asset descriptors.');
  }

  const paths = new Set<string>();
  const digests = new Set<string>();
  const assets = value.assets.map((candidate, index): PortableArchiveAssetDescriptor => {
    if (!isRecord(candidate)) {
      throw new Error(`manifest.assets[${index}] must be an object.`);
    }
    rejectUnknownKeys(
      candidate,
      ['uri', 'path', 'sha256', 'mimeType', 'byteLength', 'width', 'height'],
      `manifest.assets[${index}]`,
    );
    const { uri, path, sha256, mimeType, byteLength, width, height } = candidate;
    if (
      typeof uri !== 'string'
      || typeof path !== 'string'
      || typeof sha256 !== 'string'
      || !SHA256_PATTERN.test(sha256)
      || !['image/jpeg', 'image/png', 'image/webp'].includes(String(mimeType))
      || !Number.isSafeInteger(byteLength)
      || (byteLength as number) <= 0
      || (byteLength as number) > MAX_ASSET_BYTES
      || !Number.isSafeInteger(width)
      || (width as number) <= 0
      || !Number.isSafeInteger(height)
      || (height as number) <= 0
    ) {
      throw new Error(`manifest.assets[${index}] contains invalid asset metadata.`);
    }
    const parsed = parsePortableAssetUri(uri);
    const expectedPath = `assets/${uri.slice('case://assets/'.length)}`;
    if (
      !parsed
      || parsed.sha256 !== sha256
      || parsed.mimeType !== mimeType
      || path !== expectedPath
      || !safeEntryPath(path)
    ) {
      throw new Error(`manifest.assets[${index}] URI, path, digest, and MIME type must agree.`);
    }
    if (paths.has(path) || digests.has(sha256)) {
      throw new Error(`manifest.assets[${index}] duplicates an asset path or digest.`);
    }
    paths.add(path);
    digests.add(sha256);
    return {
      uri,
      path,
      sha256,
      mimeType: mimeType as PortableImageMimeType,
      byteLength: byteLength as number,
      width: width as number,
      height: height as number,
    };
  });

  return {
    schema: PORTABLE_CASE_ARCHIVE_SCHEMA,
    schemaVersion: PORTABLE_CASE_ARCHIVE_VERSION,
    casePackage: value.casePackage as CasePackageV1,
    lessonPlan: value.lessonPlan as LessonPlanV1,
    assets,
  };
}

/** Create a deterministic, allowlisted `.caseattend` ZIP archive. */
export async function exportPortableCaseArchive(
  portablePackage: PortableCasePackageV1,
): Promise<Uint8Array> {
  const snapshot = structuredClone(portablePackage);
  const validation = await validatePortableCasePackageV1(snapshot);
  if (!validation.valid) throw portableValidationError(validation.errors);

  const sortedAssets = [...snapshot.assets].sort((left, right) => left.uri.localeCompare(right.uri));
  const descriptors = sortedAssets.map((asset): PortableArchiveAssetDescriptor => ({
    uri: asset.uri,
    path: archiveAssetPath(asset),
    sha256: asset.sha256,
    mimeType: asset.mimeType,
    byteLength: asset.byteLength,
    width: asset.width,
    height: asset.height,
  }));
  const manifest: PortableArchiveManifestV1 = {
    schema: PORTABLE_CASE_ARCHIVE_SCHEMA,
    schemaVersion: PORTABLE_CASE_ARCHIVE_VERSION,
    casePackage: snapshot.casePackage,
    lessonPlan: snapshot.lessonPlan,
    assets: descriptors,
  };
  const manifestBytes = textEncoder.encode(canonicalizeJson(manifest));
  if (manifestBytes.byteLength > MAX_MANIFEST_BYTES) {
    throw new Error(
      `manifest.json cannot exceed ${MAX_MANIFEST_BYTES} bytes. Shorten the authored case and lesson text, then export it again.`,
    );
  }
  const totalUncompressedBytes = manifestBytes.byteLength
    + sortedAssets.reduce((total, asset) => total + asset.byteLength, 0);
  if (totalUncompressedBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) {
    throw new Error('The case exceeds the CaseAttend archive uncompressed size limit.');
  }
  const files: Zippable = {
    [MANIFEST_PATH]: manifestBytes,
  };
  for (const asset of sortedAssets) {
    files[archiveAssetPath(asset)] = decodePortableAssetBytes(asset.bytesBase64);
  }
  const archive = zipSync(files, {
    level: 6,
    mtime: new Date('1980-01-01T00:00:00.000Z'),
    os: 3,
    attrs: 0o644 << 16,
  });
  // Apply the same header and compression-ratio checks to locally generated
  // bytes so every successful export is guaranteed to pass archive preflight.
  inspectZipEntries(archive);
  return archive;
}

async function archiveInputBytes(input: Uint8Array | ArrayBuffer | Blob): Promise<Uint8Array> {
  if (typeof Blob !== 'undefined' && input instanceof Blob) {
    if (input.size === 0 || input.size > MAX_ARCHIVE_BYTES) {
      throw new Error(`CaseAttend archives must be between 1 byte and ${MAX_ARCHIVE_BYTES} bytes.`);
    }
    return new Uint8Array(await input.arrayBuffer());
  }
  return asUint8Array(input as Uint8Array | ArrayBuffer);
}

/**
 * Import only the documented archive files, verify every digest and image
 * invariant, and reconstruct the canonical in-memory portable package.
 */
export async function importPortableCaseArchive(
  input: Uint8Array | ArrayBuffer | Blob,
): Promise<PortableCasePackageV1> {
  const bytes = await archiveInputBytes(input);
  const inspectedEntries = inspectZipEntries(bytes);
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error('The CaseAttend archive could not be decompressed safely.');
  }
  const extractedPaths = Object.keys(files).sort();
  const inspectedPaths = inspectedEntries.map((entry) => entry.path).sort();
  if (
    extractedPaths.length !== inspectedPaths.length
    || extractedPaths.some((path, index) => path !== inspectedPaths[index])
  ) {
    throw new Error('The archive entry list changed during decompression.');
  }

  const manifestBytes = files[MANIFEST_PATH];
  if (!manifestBytes) throw new Error('The archive is missing manifest.json.');
  const manifest = parseArchiveManifest(manifestBytes);
  const expectedPaths = new Set([MANIFEST_PATH, ...manifest.assets.map((asset) => asset.path)]);
  for (const path of extractedPaths) {
    if (!expectedPaths.has(path)) throw new Error(`Archive entry '${path}' is not declared by manifest.json.`);
  }
  if (expectedPaths.size !== extractedPaths.length) {
    const missing = [...expectedPaths].find((path) => !Object.hasOwn(files, path));
    throw new Error(`Archive entry '${missing ?? 'unknown'}' is declared but missing.`);
  }

  const assets: PortableCaseAssetV1[] = manifest.assets.map((descriptor) => {
    const assetBytes = files[descriptor.path];
    if (!assetBytes || assetBytes.byteLength !== descriptor.byteLength) {
      throw new Error(`Archive asset '${descriptor.path}' does not match its declared byte length.`);
    }
    return {
      uri: createPortableAssetUri(descriptor.sha256, descriptor.mimeType),
      sha256: descriptor.sha256,
      mimeType: descriptor.mimeType,
      byteLength: descriptor.byteLength,
      width: descriptor.width,
      height: descriptor.height,
      bytesBase64: encodePortableAssetBytes(assetBytes),
    };
  });
  const portablePackage: PortableCasePackageV1 = {
    schema: PORTABLE_CASE_PACKAGE_SCHEMA,
    schemaVersion: PORTABLE_CASE_PACKAGE_VERSION,
    casePackage: manifest.casePackage,
    lessonPlan: manifest.lessonPlan,
    assets,
  };
  const validation = await validatePortableCasePackageV1(portablePackage);
  if (!validation.valid) throw portableValidationError(validation.errors);
  return portablePackage;
}

export function portableCaseArchiveBlob(bytes: Uint8Array): Blob {
  return new Blob([asUint8Array(bytes).buffer], { type: PORTABLE_CASE_ARCHIVE_MIME_TYPE });
}
