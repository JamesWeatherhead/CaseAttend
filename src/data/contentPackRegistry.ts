import { BUILTIN_CONTENT_PACKS } from './builtinContentPacks';
import {
  buildContentPack,
  type BuiltContentPackEntry,
} from './contentPack';

let registryPromise: Promise<readonly BuiltContentPackEntry[]> | undefined;

async function buildRegistry(): Promise<readonly BuiltContentPackEntry[]> {
  const packIds = new Set<string>();
  const caseIds = new Set<string>();
  const entries: BuiltContentPackEntry[] = [];

  for (const pack of BUILTIN_CONTENT_PACKS) {
    if (packIds.has(pack.id)) throw new Error(`Duplicate built-in Content Pack id: ${pack.id}`);
    packIds.add(pack.id);
    for (const entry of await buildContentPack(pack)) {
      if (caseIds.has(entry.casePackage.id)) {
        throw new Error(`Duplicate built-in Content Pack case id: ${entry.casePackage.id}`);
      }
      caseIds.add(entry.casePackage.id);
      entries.push(entry);
    }
  }

  return Object.freeze(entries);
}

export function listBuiltinContentPackEntries(): Promise<readonly BuiltContentPackEntry[]> {
  registryPromise ??= buildRegistry();
  return registryPromise;
}

export async function getBuiltinContentPackEntry(
  caseId: string,
): Promise<BuiltContentPackEntry | undefined> {
  return (await listBuiltinContentPackEntries()).find(
    (entry) => entry.casePackage.id === caseId,
  );
}
