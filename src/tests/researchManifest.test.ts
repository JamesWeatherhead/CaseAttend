import { describe, expect, it } from 'vitest';
import {
  RESEARCH_MANIFEST_LIMITS,
  computeResearchInferencePolicyHash,
  computeResearchManifestHash,
  createResearchManifestV1,
  finalizeResearchManifestV1,
  getResearchManifestRef,
  validateResearchManifestDraftV1,
  validateResearchManifestV1,
  verifyResearchManifestHash,
  type ResearchManifestV1Draft,
} from '../core/researchManifest';
import { makeResearchManifest, makeResearchManifestInput } from './researchTestFixtures';

describe('Research Manifest v1', () => {
  it('creates a closed, hash-verified manifest with raw chat disabled by default', async () => {
    const manifest = await makeResearchManifest();

    expect(manifest.collection.rawChat).toEqual({ enabled: false });
    expect(manifest.collection.sessionEvents.schema).toBe('caseattend.research-record');
    expect(manifest.participantCodes).toMatchObject({
      length: 20,
      issuance: 'institution-assigned-outside-caseattend',
      linkageKeyStorage: 'outside-caseattend',
      reuseControl: 'external-study-procedure',
    });
    expect(validateResearchManifestV1(manifest)).toEqual({ valid: true, errors: [] });
    expect(await verifyResearchManifestHash(manifest)).toBe(true);
    expect(getResearchManifestRef(manifest)).toEqual({
      id: manifest.id,
      version: manifest.version,
      sha256: manifest.manifest.sha256,
    });
  });

  it('canonicalizes object key order while preserving ordered case steps', async () => {
    const manifest = await makeResearchManifest();
    const { manifest: _digest, ...draft } = manifest;
    const reordered = Object.fromEntries(Object.entries(draft).reverse()) as unknown as ResearchManifestV1Draft;

    expect(await computeResearchManifestHash(reordered)).toBe(manifest.manifest.sha256);
    const reversedSteps = structuredClone(draft);
    reversedSteps.arms[0].caseSteps = [
      ...reversedSteps.arms[0].caseSteps,
      { ...reversedSteps.arms[0].caseSteps[0], id: 'step-2' },
    ].reverse();
    expect(await computeResearchManifestHash(reversedSteps)).not.toBe(manifest.manifest.sha256);
  });

  it('detects post-finalization changes', async () => {
    const manifest = await makeResearchManifest();
    const changed = structuredClone(manifest);
    changed.arms[0].inferencePolicy.temperature = 0.7;

    expect(validateResearchManifestV1(changed).valid).toBe(true);
    expect(await verifyResearchManifestHash(changed)).toBe(false);
  });

  it('refuses to finalize a development build or a source link that is not pinned to it', async () => {
    const development = makeResearchManifestInput();
    development.application.buildRevision = 'development';
    development.application.sourceTreeUrl = 'https://github.com/example/caseattend/tree/main';
    await expect(createResearchManifestV1(development)).rejects.toThrow(/exact lowercase.*Git revision|Development builds/i);

    const floatingSource = makeResearchManifestInput();
    floatingSource.application.sourceTreeUrl = 'https://github.com/example/caseattend/tree/main';
    await expect(createResearchManifestV1(floatingSource)).rejects.toThrow('/tree/<buildRevision>');
  });

  it('recursively rejects unknown fields rather than hash-covering an ambiguous extension', async () => {
    const manifest = await makeResearchManifest();
    const changed = structuredClone(manifest) as typeof manifest & Record<string, unknown>;
    (changed.arms[0].inferencePolicy.provider as unknown as Record<string, unknown>).secretPolicy = 'surprise';
    (changed.tasks.pre[0].response as unknown as Record<string, unknown>).freeText = true;
    (changed.participantInformation.vlmDisclosure as unknown as Record<string, unknown>).html = '<b>trusted</b>';
    (changed.manifest as unknown as Record<string, unknown>).createdAt = 'today';

    const result = validateResearchManifestV1(changed);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('secretPolicy'),
      expect.stringContaining('freeText'),
      expect.stringContaining('html'),
      expect.stringContaining('createdAt'),
    ]));
  });

  it('permits chat and deep_think but rejects search', () => {
    const input = makeResearchManifestInput();
    const draft = {
      ...input,
      schema: 'caseattend.research-manifest' as const,
      schemaVersion: '1.0' as const,
      participantCodes: {
        format: 'crockford-base32-v1' as const,
        length: 20 as const,
        derivation: 'sha256-manifest-code-v1' as const,
        issuance: 'institution-assigned-outside-caseattend' as const,
        linkageKeyStorage: 'outside-caseattend' as const,
        reuseControl: 'external-study-procedure' as const,
      },
      collection: { ...input.collection, rawChat: { enabled: false as const } },
    };
    (draft.arms[0].caseSteps[0] as unknown as { mode: string }).mode = 'search';

    const result = validateResearchManifestDraftV1(draft);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("arms[0].caseSteps[0].mode must be 'chat' or 'deep_think'; Research Manifest v1 does not permit search.");
  });

  it('requires a fully frozen model, provider, sampling, viewer, and capture policy', async () => {
    const manifest = await makeResearchManifest();
    const { manifest: _digest, ...draft } = structuredClone(manifest);
    const policy = draft.arms[0].inferencePolicy as unknown as Record<string, unknown>;
    delete policy.topP;
    (policy.provider as Record<string, unknown>).allowFallbacks = true;
    (policy.provider as Record<string, unknown>).policyUrl = 'http://provider.example/privacy';
    (draft.arms[0].capturePolicy as unknown as Record<string, unknown>).source = 'original-frame';
    (draft.arms[0].viewerPolicy as unknown as Record<string, unknown>).experimentalTool = true;

    const result = validateResearchManifestDraftV1(draft);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('topP'),
      expect.stringContaining('allowFallbacks'),
      expect.stringContaining('policyUrl'),
      expect.stringContaining('capturePolicy.source'),
      expect.stringContaining('experimentalTool'),
    ]));
    await expect(finalizeResearchManifestV1(draft)).rejects.toThrow('Cannot finalize an invalid Research Manifest v1');
  });

  it('computes a separate deterministic hash for the exact inference policy', async () => {
    const manifest = await makeResearchManifest();
    const policy = manifest.arms[0].inferencePolicy;
    const first = await computeResearchInferencePolicyHash(policy);
    const reordered = Object.fromEntries(Object.entries(policy).reverse()) as unknown as typeof policy;

    expect(await computeResearchInferencePolicyHash(reordered)).toBe(first);
    await expect(computeResearchInferencePolicyHash({
      ...policy,
      provider: { ...policy.provider, allowFallbacks: true as false },
    })).rejects.toThrow('invalid Research Inference Policy');
  });

  it('enforces 1-8 arms, 1-32 ordered steps, and exact weighted arm coverage', async () => {
    const tooManyArms = makeResearchManifestInput({ armCount: RESEARCH_MANIFEST_LIMITS.maxArms + 1 });
    await expect(createResearchManifestV1(tooManyArms)).rejects.toThrow('arms must contain 1-8 study arms');

    const input = makeResearchManifestInput({ armCount: 2 });
    input.arms[0].caseSteps = [];
    input.assignment = {
      method: 'sha256-weighted-v1',
      allocations: [{ armId: 'arm-1', weight: 1 }, { armId: 'arm-1', weight: 1 }],
    };
    await expect(createResearchManifestV1(input)).rejects.toThrow(/1-32 ordered case steps|every declared arm exactly once/);
  });

  it('requires explicit raw-chat disclosure and exact browser-only data flow', async () => {
    const input = makeResearchManifestInput();
    input.collection.rawChat = {
      enabled: true,
      purpose: 'Analyze teaching dialogue.',
      includes: ['learner-text'],
      participantDisclosure: 'The study team will receive the words you enter.',
      accessRoles: ['research-team'],
    };
    input.dataManagement.accessRoles = [...input.dataManagement.accessRoles, 'research-team'];
    const manifest = await createResearchManifestV1(input);
    expect(manifest.collection.rawChat.enabled).toBe(true);

    const changed = structuredClone(manifest);
    changed.dataManagement.automaticRemoteSync = true as false;
    changed.collection.currentViewCapture.exported = true as false;
    changed.dataManagement.dataFlow.inference.authentication.sentTo = 'caseattend-proxy' as 'openrouter-only';
    const result = validateResearchManifestV1(changed);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('automaticRemoteSync'),
      expect.stringContaining('currentViewCapture.exported'),
      expect.stringContaining('authentication.sentTo'),
    ]));
  });

  it('rejects a canonical manifest above the packet-safe byte limit', async () => {
    const input = makeResearchManifestInput();
    input.participantInformation.procedures = 'x'.repeat(RESEARCH_MANIFEST_LIMITS.maxCanonicalBytes);
    await expect(createResearchManifestV1(input)).rejects.toThrow(/cannot exceed|canonical JSON/);
  });
});
