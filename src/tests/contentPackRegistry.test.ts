import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUILTIN_CONTENT_PACKS } from '../data/builtinContentPacks';
import { listBuiltinContentPackEntries } from '../data/contentPackRegistry';

describe('built-in Content Pack registry', () => {
  it('builds every declared case exactly once and verifies its local asset bytes', async () => {
    const entries = await listBuiltinContentPackEntries();
    const declaredCount = BUILTIN_CONTENT_PACKS.reduce(
      (total, pack) => total + pack.cases.length,
      0,
    );

    expect(entries).toHaveLength(declaredCount);
    expect(new Set(entries.map((entry) => entry.casePackage.id)).size).toBe(entries.length);
    for (const entry of entries) {
      if (entry.casePackage.artifact.kind !== 'image') {
        throw new Error('Content Pack registry only accepts single-image cases.');
      }
      const src = entry.casePackage.artifact.src;
      const bytes = await readFile(join(process.cwd(), 'public', src));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        entry.casePackage.artifact.sha256,
      );
    }
  });
});
