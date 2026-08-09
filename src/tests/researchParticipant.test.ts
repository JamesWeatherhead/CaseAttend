import { describe, expect, it, vi } from 'vitest';
import {
  assignResearchArm,
  deriveResearchParticipantId,
  generateResearchParticipantCode,
  normalizeResearchParticipantCode,
  validateResearchParticipantCode,
  validateResearchParticipantId,
} from '../core/researchParticipant';
import { makeResearchManifest } from './researchTestFixtures';

describe('research participant identity and assignment', () => {
  it('normalizes a 20-character Crockford code without guessing ambiguous characters', () => {
    expect(normalizeResearchParticipantCode('0123-4567 89ab-cdef ghjk')).toBe('0123456789ABCDEFGHJK');
    expect(validateResearchParticipantCode('0123 4567 89AB CDEF GHJK')).toEqual({
      valid: true,
      errors: [],
      normalized: '0123456789ABCDEFGHJK',
    });
    expect(validateResearchParticipantCode('0123456789ABCDEFGHJL').valid).toBe(false);
    expect(validateResearchParticipantCode('O123456789ABCDEFGHJK').valid).toBe(false);
    expect(validateResearchParticipantCode('0123456789ABCDEFGHJ').valid).toBe(false);
  });

  it('generates only valid Crockford codes with secure browser randomness', () => {
    const code = generateResearchParticipantCode();
    expect(code).toHaveLength(20);
    expect(validateResearchParticipantCode(code)).toMatchObject({ valid: true, normalized: code });
  });

  it('derives a deterministic lowercase SHA-256 ID scoped to the exact manifest', async () => {
    const code = '0123456789ABCDEFGHJK';
    const first = await deriveResearchParticipantId('a'.repeat(64), code);
    const normalizedEquivalent = await deriveResearchParticipantId('a'.repeat(64), '0123-4567-89ab-cdef-ghjk');
    const otherManifest = await deriveResearchParticipantId('b'.repeat(64), code);

    expect(first).toBe(normalizedEquivalent);
    expect(first).not.toBe(otherManifest);
    expect(validateResearchParticipantId(first)).toBe(true);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it('uses the declared fixed arm', async () => {
    const manifest = await makeResearchManifest();
    const participantId = await deriveResearchParticipantId(manifest, '0123456789ABCDEFGHJK');

    await expect(assignResearchArm(manifest, participantId)).resolves.toEqual({
      armId: 'arm-1',
      method: 'fixed',
    });
  });

  it('makes deterministic weighted assignments from the exact manifest and participant ID', async () => {
    const manifest = await makeResearchManifest({ armCount: 3 });
    const participantId = await deriveResearchParticipantId(manifest, '0123456789ABCDEFGHJK');
    const first = await assignResearchArm(manifest, participantId);
    const second = await assignResearchArm(manifest, participantId);

    expect(second).toEqual(first);
    expect(manifest.arms.map((arm) => arm.id)).toContain(first.armId);
    expect(first.method).toBe('sha256-weighted-v1');
  });

  it('re-hashes a rejected weighted sample instead of introducing modulo bias', async () => {
    const manifest = await makeResearchManifest({ armCount: 3 });
    const originalDigest = globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle);
    let assignmentDigestCalls = 0;
    const digestSpy = vi.spyOn(globalThis.crypto.subtle, 'digest').mockImplementation(
      async (algorithm, data) => {
        const input = new TextDecoder().decode(data as ArrayBuffer);
        if (input.startsWith('caseattend/arm-assignment/v1\0')) {
          assignmentDigestCalls += 1;
          const forced = new Uint8Array(32);
          if (assignmentDigestCalls === 1) forced.fill(0xff);
          return forced.buffer;
        }
        return originalDigest(algorithm, data);
      },
    );
    try {
      await expect(assignResearchArm(manifest, 'a'.repeat(64))).resolves.toEqual({
        armId: 'arm-1',
        method: 'sha256-weighted-v1',
      });
      expect(assignmentDigestCalls).toBe(2);
    } finally {
      digestSpy.mockRestore();
    }
  });

  it('fails closed for a modified manifest or malformed participant ID', async () => {
    const manifest = await makeResearchManifest({ armCount: 2 });
    const modified = structuredClone(manifest);
    if (modified.assignment.method !== 'sha256-weighted-v1') {
      throw new Error('Expected the two-arm fixture to use weighted assignment.');
    }
    modified.assignment.allocations[0].weight = 99;

    await expect(assignResearchArm(modified, 'a'.repeat(64))).rejects.toThrow(/invalid or modified/);
    await expect(assignResearchArm(manifest, 'participant-1')).rejects.toThrow(/lowercase 64-character/);
  });
});
