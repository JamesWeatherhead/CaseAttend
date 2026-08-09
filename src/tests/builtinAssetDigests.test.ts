// @vitest-environment node

import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUILTIN_ASSET_SHA256 } from '../data/builtinAssetDigests';

const PUBLIC_ROOT = path.resolve(process.cwd(), 'public');

const EXPECTED_MIME_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const KNOWN_UNREGISTERED_CT_PREFIXES = [
  '/images/ct-fahr/',
  '/images/ct-meningioma/',
  '/images/ct-normal-brain/',
  '/images/ct-normal-brain-contrast/',
] as const;

function resolvePublicAsset(assetPath: string): string {
  const relativePath = assetPath.replace(/^\/+/, '');
  const resolvedPath = path.resolve(PUBLIC_ROOT, relativePath);

  expect(assetPath).toMatch(/^\/images\//);
  expect(resolvedPath.startsWith(`${PUBLIC_ROOT}${path.sep}`)).toBe(true);

  return resolvedPath;
}

function detectImageMime(bytes: Buffer): string | null {
  if (
    bytes.length >= 8
    && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    bytes.length >= 12
    && bytes.subarray(0, 4).toString('ascii') === 'RIFF'
    && bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

describe('built-in asset digest registry', () => {
  const entries = Object.entries(BUILTIN_ASSET_SHA256);
  const registeredPaths = entries.map(([assetPath]) => assetPath);

  it('contains exactly 128 unique registered paths', () => {
    expect(registeredPaths).toHaveLength(128);
    expect(new Set(registeredPaths).size).toBe(128);
  });

  it('points only to existing files under public', async () => {
    await Promise.all(registeredPaths.map(async (assetPath) => {
      const filePath = resolvePublicAsset(assetPath);
      const fileStat = await stat(filePath);
      expect(fileStat.isFile(), `${assetPath} must resolve to a file`).toBe(true);
    }));
  });

  it('matches every declared SHA-256 digest to the file bytes', async () => {
    await Promise.all(entries.map(async ([assetPath, declaredDigest]) => {
      const bytes = await readFile(resolvePublicAsset(assetPath));
      const actualDigest = createHash('sha256').update(bytes).digest('hex');
      expect(actualDigest, `SHA-256 mismatch for ${assetPath}`).toBe(declaredDigest);
    }));
  });

  it('uses a supported image extension with matching file magic', async () => {
    await Promise.all(registeredPaths.map(async (assetPath) => {
      const extension = path.extname(assetPath).toLowerCase();
      const expectedMime = EXPECTED_MIME_BY_EXTENSION[extension];
      const bytes = await readFile(resolvePublicAsset(assetPath));

      expect(expectedMime, `Unsupported image extension for ${assetPath}`).toBeDefined();
      expect(detectImageMime(bytes), `Unexpected file magic for ${assetPath}`).toBe(expectedMime);
    }));
  });

  it('does not register the known unreviewed CT asset sets', () => {
    for (const prefix of KNOWN_UNREGISTERED_CT_PREFIXES) {
      expect(
        registeredPaths.some((assetPath) => assetPath.startsWith(prefix)),
        `${prefix} must remain outside the built-in digest registry`,
      ).toBe(false);
    }
  });
});
