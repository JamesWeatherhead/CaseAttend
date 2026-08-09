// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { unzipSync, zipSync } from 'fflate';
import { finalizeResearchManifestV1 } from '../core/researchManifest';
import {
  exportResearchSupportPacket,
  importResearchSupportPacket,
  researchSupportPacketBlob,
  RESEARCH_SUPPORT_PACKET_LIMITS,
  RESEARCH_SUPPORT_PACKET_MIME_TYPE,
  RESEARCH_SUPPORT_TEMPLATE_LABEL,
} from '../services/researchPacketArchive';
import { makeLaunchReadyResearchStudyBundle } from './researchServiceTestFixture';

// Local-field 1980-01-01 mirrors the exporter so the rebuilt bytes match in
// every timezone (fflate encodes ZIP mtime from local date components).
const FIXED_ZIP_OPTIONS = {
  level: 6,
  mtime: new Date(1980, 0, 1, 0, 0, 0, 0),
  os: 3,
  attrs: 0o644 << 16,
} as const;

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
  if (replacements < 2) throw new Error('Expected local and central ZIP path records.');
  return output;
}

function addZipComment(bytes: Uint8Array, comment: string): Uint8Array {
  const encoded = new TextEncoder().encode(comment);
  const output = new Uint8Array(bytes.byteLength + encoded.byteLength);
  output.set(bytes);
  output.set(encoded, bytes.byteLength);
  new DataView(output.buffer).setUint16(bytes.byteLength - 2, encoded.byteLength, true);
  return output;
}

describe('research support packet archive', () => {
  const fetchSpy = vi.fn();
  let getItemSpy: ReturnType<typeof vi.spyOn> | undefined;

  beforeEach(() => {
    fetchSpy.mockReset();
    vi.stubGlobal('fetch', fetchSpy);
    if (typeof Storage !== 'undefined') getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
  });

  afterEach(() => {
    getItemSpy?.mockRestore();
    getItemSpy = undefined;
    vi.unstubAllGlobals();
  });

  it('round-trips deterministically with exact prompts/cases and editable, clearly labeled templates', async () => {
    const bundle = await makeLaunchReadyResearchStudyBundle();
    const first = await exportResearchSupportPacket(bundle);
    const second = await exportResearchSupportPacket(bundle);

    expect(first).toEqual(second);
    const files = unzipSync(first);
    const paths = Object.keys(files).sort();
    expect(paths).toContain('packet-manifest.json');
    expect(paths).toContain('config/research-manifest.json');
    expect(paths.filter((path) => path.startsWith('templates/'))).toHaveLength(9);
    expect(paths.filter((path) => path.startsWith('prompts/'))).toHaveLength(1);
    expect(paths.filter((path) => path.startsWith('cases/'))).toHaveLength(1);
    for (const path of paths.filter((candidate) => candidate.endsWith('.md'))) {
      const markdown = new TextDecoder().decode(files[path]);
      expect(markdown).toContain(RESEARCH_SUPPORT_TEMPLATE_LABEL);
      expect(markdown).toMatch(/^# /);
    }
    const dataFlow = new TextDecoder().decode(files['templates/data-flow.md']);
    expect(dataFlow).toContain('browser-held-openrouter-api-key');
    expect(dataFlow).toContain('"includedInResearchRecords": false');
    expect(dataFlow).toContain('learner message');
    expect(dataFlow).toContain('current view image');
    expect(new TextDecoder().decode(files['templates/provider-model-list.md']))
      .toContain(bundle.researchManifest.arms[0].inferencePolicy.provider.policyUrl);
    const dictionary = new TextDecoder().decode(files['templates/data-dictionary.md']);
    expect(dictionary).toContain('institution-assigned-outside-caseattend');
    expect(dictionary).toContain('"linkageKeyStorage": "outside-caseattend"');

    const imported = await importResearchSupportPacket(first);
    expect(imported.bundle).toEqual(bundle);
    expect(Object.keys(imported.templates)).toHaveLength(9);
    expect(Object.keys(imported.exactPrompts)).toHaveLength(1);
    const blob = researchSupportPacketBlob(first);
    expect(blob.type).toBe(RESEARCH_SUPPORT_PACKET_MIME_TYPE);
    await expect(importResearchSupportPacket(blob)).resolves.toMatchObject({ bundle });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getItemSpy).not.toHaveBeenCalled();
  }, 15_000);

  it('exports an oversight draft for institutional review without treating it as launch approval', async () => {
    const ready = await makeLaunchReadyResearchStudyBundle();
    const { manifest: _manifest, ...draft } = ready.researchManifest;
    const researchManifest = await finalizeResearchManifestV1({
      ...draft,
      oversight: { status: 'draft' },
    });
    const draftBundle = { ...ready, researchManifest };

    const imported = await importResearchSupportPacket(
      await exportResearchSupportPacket(draftBundle),
    );
    expect(imported.bundle.researchManifest.oversight).toEqual({ status: 'draft' });
    expect(imported.templates['templates/readme.md']).toContain(
      'supports preparation for institutional review',
    );
    expect(imported.templates['templates/readme.md']).toContain(
      RESEARCH_SUPPORT_TEMPLATE_LABEL,
    );
  });

  it('never includes participant rows, ambient browser keys, raw chat, or original filenames', async () => {
    const bundle = await makeLaunchReadyResearchStudyBundle();
    const sentinels = {
      apiKey: 'sk-browser-only-research-packet-sentinel',
      participantCode: 'private-participant-code-sentinel',
      learnerText: 'private-learner-chat-sentinel',
      modelText: 'private-model-chat-sentinel',
      originalFilename: 'patient-name-original-file-sentinel.jpg',
    };
    const ambient = globalThis as typeof globalThis & { __researchSensitive?: typeof sentinels };
    ambient.__researchSensitive = sentinels;
    try {
      const files = unzipSync(await exportResearchSupportPacket(bundle));
      const text = Object.entries(files)
        .filter(([path]) => !path.startsWith('cases/'))
        .map(([, bytes]) => new TextDecoder().decode(bytes))
        .join('\n');
      for (const sentinel of Object.values(sentinels)) expect(text).not.toContain(sentinel);
      expect(Object.keys(files).some(
        (path) => /^(?:participants|runs|records|chats)\//i.test(path),
      )).toBe(false);
      expect(text).not.toMatch(/"(?:apiKey|authorization|participantCode|learnerText|modelText|originalFilename)"/i);
    } finally {
      delete ambient.__researchSensitive;
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getItemSpy).not.toHaveBeenCalled();
  });

  it('rejects unexpected, traversing, and duplicate ZIP paths before parsing content', async () => {
    const bundle = await makeLaunchReadyResearchStudyBundle();
    const files = unzipSync(await exportResearchSupportPacket(bundle));
    files['templates/private.txt'] = new TextEncoder().encode('secret');
    await expect(importResearchSupportPacket(zipSync(files, FIXED_ZIP_OPTIONS)))
      .rejects.toThrow(/not an allowed safe path/i);

    delete files['templates/private.txt'];
    files['../templates/private.md'] = new TextEncoder().encode('secret');
    await expect(importResearchSupportPacket(zipSync(files, FIXED_ZIP_OPTIONS)))
      .rejects.toThrow(/not an allowed safe path/i);

    delete files['../templates/private.md'];
    files['templates/aaaaaaaa.md'] = new TextEncoder().encode('a');
    files['templates/bbbbbbbb.md'] = new TextEncoder().encode('b');
    const ordinary = zipSync(files, FIXED_ZIP_OPTIONS);
    const duplicate = replaceEveryAscii(
      ordinary,
      'templates/bbbbbbbb.md',
      'templates/aaaaaaaa.md',
    );
    await expect(importResearchSupportPacket(duplicate)).rejects.toThrow(/duplicated/i);
  });

  it('rejects ZIP comments and changed file bytes as hidden or unverified data', async () => {
    const bundle = await makeLaunchReadyResearchStudyBundle();
    const archive = await exportResearchSupportPacket(bundle);
    await expect(importResearchSupportPacket(addZipComment(
      archive,
      'provider-body-or-private-chat-could-hide-here',
    ))).rejects.toThrow(/comments are not allowed/i);

    const files = unzipSync(archive);
    const templatePath = 'templates/readme.md';
    const changed = files[templatePath].slice();
    changed[changed.byteLength - 2] ^= 1;
    files[templatePath] = changed;
    await expect(importResearchSupportPacket(zipSync(files, FIXED_ZIP_OPTIONS)))
      .rejects.toThrow(/SHA-256 verification/i);
  });

  it('rejects an oversized Blob before reading attacker-controlled bytes', async () => {
    const blob = new Blob([new Uint8Array([1])]);
    Object.defineProperty(blob, 'size', {
      configurable: true,
      value: RESEARCH_SUPPORT_PACKET_LIMITS.maxArchiveBytes + 1,
    });
    const arrayBuffer = vi.spyOn(blob, 'arrayBuffer');

    await expect(importResearchSupportPacket(blob)).rejects.toThrow(/between 1 byte/i);
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('rejects exact-prompt drift even when the changed manifest is valid and hash-frozen', async () => {
    const bundle = await makeLaunchReadyResearchStudyBundle();
    const { manifest: _manifest, ...draft } = bundle.researchManifest;
    const changedManifest = await finalizeResearchManifestV1({
      ...draft,
      arms: draft.arms.map((arm) => ({
        ...arm,
        caseSteps: arm.caseSteps.map((step) => ({
          ...step,
          systemPromptSha256: 'f'.repeat(64),
        })),
      })),
    });

    await expect(exportResearchSupportPacket({
      ...bundle,
      researchManifest: changedManifest,
    })).rejects.toThrow(/does not match its frozen systemPromptSha256/i);
  });

  it('blocks packet export after the frozen browser-retention deadline', async () => {
    const expired = await makeLaunchReadyResearchStudyBundle({
      browserDeleteAfter: '2020-01-01T00:00:00Z',
      exportedCopiesDeleteAfter: '2021-01-01T00:00:00Z',
    });
    await expect(exportResearchSupportPacket(expired)).rejects.toThrow(/retention ended/i);
  });
});
