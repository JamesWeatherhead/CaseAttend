import { describe, expect, it, vi } from 'vitest';
import { unzipSync, zipSync } from 'fflate';
import { PORTABLE_CASE_ASSET_LIMITS } from '../core/portableCasePackage';
import {
  exportPortableCaseArchive,
  importPortableCaseArchive,
  portableCaseArchiveBlob,
  PORTABLE_CASE_ARCHIVE_LIMITS,
  PORTABLE_CASE_ARCHIVE_MIME_TYPE,
} from '../services/portableCaseArchive';
import { makePortableCasePackage } from './portableCaseTestFixture';

// Local-field 1980-01-01 mirrors the exporter so the rebuilt bytes match in
// every timezone (fflate encodes ZIP mtime from local date components).
const FIXED_ZIP_OPTIONS = { mtime: new Date(1980, 0, 1, 0, 0, 0, 0) } as const;
const MAX_MANIFEST_BYTES = 512 * 1024;

function replaceEveryAscii(bytes: Uint8Array, from: string, to: string): Uint8Array {
  if (from.length !== to.length) throw new Error('Replacement paths must have equal length.');
  const output = bytes.slice();
  const needle = new TextEncoder().encode(from);
  const replacement = new TextEncoder().encode(to);
  let replacements = 0;
  for (let offset = 0; offset <= output.length - needle.length; offset += 1) {
    if (!needle.every((byte, index) => output[offset + index] === byte)) continue;
    output.set(replacement, offset);
    replacements += 1;
    offset += needle.length - 1;
  }
  if (replacements < 2) throw new Error('Expected both local and central ZIP path records.');
  return output;
}

function addZipComment(bytes: Uint8Array, comment: string): Uint8Array {
  const encoded = new TextEncoder().encode(comment);
  const output = new Uint8Array(bytes.byteLength + encoded.byteLength);
  output.set(bytes);
  output.set(encoded, bytes.byteLength);
  const eocdOffset = bytes.byteLength - 22;
  new DataView(output.buffer).setUint16(eocdOffset + 20, encoded.byteLength, true);
  return output;
}

describe('portable CaseAttend archives', () => {
  it('keeps every portable package within the archive and decompression ceilings', () => {
    expect(
      PORTABLE_CASE_ASSET_LIMITS.maxTotalBytes
      + PORTABLE_CASE_ARCHIVE_LIMITS.maxManifestBytes
      + PORTABLE_CASE_ARCHIVE_LIMITS.zipOverheadBudgetBytes,
    ).toBeLessThanOrEqual(PORTABLE_CASE_ARCHIVE_LIMITS.maxArchiveBytes);
    expect(
      PORTABLE_CASE_ASSET_LIMITS.maxTotalBytes
      + PORTABLE_CASE_ARCHIVE_LIMITS.maxManifestBytes,
    ).toBeLessThanOrEqual(PORTABLE_CASE_ARCHIVE_LIMITS.maxTotalUncompressedBytes);
  });

  it('round-trips a strict binary archive deterministically without embedding base64', async () => {
    const portablePackage = await makePortableCasePackage();
    const first = await exportPortableCaseArchive(portablePackage);
    const second = await exportPortableCaseArchive(portablePackage);

    expect(first).toEqual(second);
    const files = unzipSync(first);
    const assetName = `assets/${portablePackage.assets[0].uri.slice('case://assets/'.length)}`;
    expect(Object.keys(files).sort()).toEqual([assetName, 'manifest.json'].sort());
    const manifest = new TextDecoder().decode(files['manifest.json']);
    expect(manifest).not.toContain('bytesBase64');
    expect(manifest).not.toMatch(/apiKey|authorization|chatMessage|sessionEvent/i);
    await expect(importPortableCaseArchive(first)).resolves.toEqual(portablePackage);

    const blob = portableCaseArchiveBlob(first);
    expect(blob.type).toBe(PORTABLE_CASE_ARCHIVE_MIME_TYPE);
    await expect(importPortableCaseArchive(blob)).resolves.toEqual(portablePackage);
  });

  it('rejects unexpected and path-traversing entries before reading a manifest', async () => {
    const unexpected = zipSync({
      'manifest.json': new Uint8Array([123, 125]),
      'notes.txt': new Uint8Array([1]),
    }, FIXED_ZIP_OPTIONS);
    await expect(importPortableCaseArchive(unexpected)).rejects.toThrow(/not an allowed CaseAttend path/i);

    const traversal = zipSync({
      'manifest.json': new Uint8Array([123, 125]),
      '../assets/secret.png': new Uint8Array([1]),
    }, FIXED_ZIP_OPTIONS);
    await expect(importPortableCaseArchive(traversal)).rejects.toThrow(/not an allowed CaseAttend path/i);
  });

  it('rejects duplicate entry names instead of accepting last-write-wins ZIP behavior', async () => {
    const firstPath = `assets/${'1'.repeat(64)}.png`;
    const secondPath = `assets/${'2'.repeat(64)}.png`;
    const ordinaryZip = zipSync({
      'manifest.json': new Uint8Array([123, 125]),
      [firstPath]: new Uint8Array([1]),
      [secondPath]: new Uint8Array([2]),
    }, FIXED_ZIP_OPTIONS);
    const duplicateZip = replaceEveryAscii(ordinaryZip, secondPath, firstPath);

    await expect(importPortableCaseArchive(duplicateZip)).rejects.toThrow(/duplicated/i);
  });

  it('rejects ZIP comments as an undeclared hidden-data channel', async () => {
    const portablePackage = await makePortableCasePackage();
    const commented = addZipComment(
      await exportPortableCaseArchive(portablePackage),
      'private-chat-or-api-key-could-hide-here',
    );

    await expect(importPortableCaseArchive(commented)).rejects.toThrow(/comments are not allowed/i);
  });

  it('rejects changed asset bytes even when the ZIP and byte length remain valid', async () => {
    const portablePackage = await makePortableCasePackage();
    const archive = await exportPortableCaseArchive(portablePackage);
    const files = unzipSync(archive);
    const assetPath = Object.keys(files).find((path) => path.startsWith('assets/'))!;
    const changed = files[assetPath].slice();
    changed[changed.length - 1] ^= 1;
    files[assetPath] = changed;
    const tamperedArchive = zipSync(files, FIXED_ZIP_OPTIONS);

    await expect(importPortableCaseArchive(tamperedArchive)).rejects.toThrow(/sha-?256|digest|image/i);
  });

  it('rejects an undeclared allowlisted asset instead of importing unrelated bytes', async () => {
    const portablePackage = await makePortableCasePackage();
    const files = unzipSync(await exportPortableCaseArchive(portablePackage));
    files[`assets/${'f'.repeat(64)}.png`] = files[Object.keys(files).find((path) => path.startsWith('assets/'))!];

    await expect(importPortableCaseArchive(zipSync(files, FIXED_ZIP_OPTIONS))).rejects.toThrow(
      /not declared by manifest/i,
    );
  });

  it('rejects an oversized Blob before allocating its attacker-controlled bytes', async () => {
    const archive = new Blob([new Uint8Array([1])]);
    Object.defineProperty(archive, 'size', {
      configurable: true,
      value: 128 * 1024 * 1024 + 1,
    });
    const arrayBuffer = vi.spyOn(archive, 'arrayBuffer');

    await expect(importPortableCaseArchive(archive)).rejects.toThrow(/between 1 byte/i);
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('accepts the manifest byte ceiling at preflight and rejects one byte over with recovery guidance', async () => {
    const assetPath = `assets/${'a'.repeat(64)}.png`;
    const exactLimitManifest = new TextEncoder().encode(`{}${' '.repeat(MAX_MANIFEST_BYTES - 2)}`);
    const overLimitManifest = new TextEncoder().encode(`{}${' '.repeat(MAX_MANIFEST_BYTES - 1)}`);
    const asset = new Uint8Array([1]);

    await expect(importPortableCaseArchive(zipSync({
      'manifest.json': exactLimitManifest,
      [assetPath]: asset,
    }, FIXED_ZIP_OPTIONS))).rejects.toThrow(/manifest\.schema/i);
    await expect(importPortableCaseArchive(zipSync({
      'manifest.json': overLimitManifest,
      [assetPath]: asset,
    }, FIXED_ZIP_OPTIONS))).rejects.toThrow(/524288 bytes.*Shorten the authored case and lesson text/i);
  });

  it('rejects sensitive undeclared fields and never serializes ambient key, chat, or filename state', async () => {
    const portablePackage = await makePortableCasePackage();
    const sensitiveValues = {
      apiKey: 'sk-browser-only-export-sentinel',
      chatMessage: 'private-chat-export-sentinel',
      originalName: 'patient-original-name-export-sentinel.png',
    };
    const ambientScope = globalThis as typeof globalThis & {
      __caseAttendSensitiveState?: typeof sensitiveValues;
    };
    ambientScope.__caseAttendSensitiveState = sensitiveValues;
    try {
      const archive = await exportPortableCaseArchive(portablePackage);
      const files = unzipSync(archive);
      const serialized = Object.entries(files)
        .filter(([path]) => path === 'manifest.json')
        .map(([, value]) => new TextDecoder().decode(value))
        .join('\n');
      for (const sensitiveValue of Object.values(sensitiveValues)) {
        expect(serialized).not.toContain(sensitiveValue);
      }

      for (const [path, value] of [
        ['portablePackage.apiKey', sensitiveValues.apiKey],
        ['portablePackage.casePackage.chatMessages', [sensitiveValues.chatMessage]],
        ['portablePackage.assets[0].originalName', sensitiveValues.originalName],
      ] as const) {
        const poisoned = structuredClone(portablePackage) as unknown as Record<string, unknown>;
        if (path === 'portablePackage.apiKey') {
          poisoned.apiKey = value;
        } else if (path === 'portablePackage.casePackage.chatMessages') {
          (poisoned.casePackage as Record<string, unknown>).chatMessages = value;
        } else {
          ((poisoned.assets as Array<Record<string, unknown>>)[0]).originalName = value;
        }
        await expect(exportPortableCaseArchive(
          poisoned as unknown as Parameters<typeof exportPortableCaseArchive>[0],
        )).rejects.toThrow(/invalid Portable Case Package|not allowed/i);
      }
    } finally {
      delete ambientScope.__caseAttendSensitiveState;
    }
  });
});
