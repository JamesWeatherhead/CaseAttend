import {
  verifyResearchManifestHash,
  type ResearchManifestRef,
  type ResearchManifestV1,
} from './researchManifest';

export const RESEARCH_PARTICIPANT_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ' as const;
/** Twenty Crockford Base32 characters provide 100 bits of random code entropy. */
export const RESEARCH_PARTICIPANT_CODE_LENGTH = 20 as const;
export const RESEARCH_PARTICIPANT_ID_PATTERN = /^[a-f0-9]{64}$/;

export interface ResearchParticipantCodeValidationResult {
  valid: boolean;
  errors: string[];
  normalized?: string;
}

export interface ResearchArmAssignment {
  armId: string;
  method: 'fixed' | 'sha256-weighted-v1';
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const CODE_PATTERN = new RegExp(`^[${RESEARCH_PARTICIPANT_CODE_ALPHABET}]{${RESEARCH_PARTICIPANT_CODE_LENGTH}}$`);
const ASSIGNMENT_DOMAIN = 'caseattend/arm-assignment/v1';
const PARTICIPANT_ID_DOMAIN = 'caseattend/participant-id/v1';

async function sha256Bytes(value: string): Promise<Uint8Array> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto is unavailable. Research participant derivation requires crypto.subtle.');
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return new Uint8Array(digest);
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (const byte of bytes) result = (result << 8n) | BigInt(byte);
  return result;
}

function readManifestSha(value: ResearchManifestV1 | ResearchManifestRef | string): string {
  if (typeof value === 'string') {
    if (!SHA256_PATTERN.test(value)) {
      throw new Error('Research Manifest SHA-256 must be a lowercase 64-character digest.');
    }
    return value;
  }
  const candidate = 'manifest' in value ? value.manifest.sha256 : value.sha256;
  if (!SHA256_PATTERN.test(candidate)) {
    throw new Error('Research Manifest SHA-256 must be a lowercase 64-character digest.');
  }
  return candidate;
}

/**
 * Accepts human-entered grouping separators (ASCII spaces, line breaks, and
 * hyphens), but never guesses ambiguous Crockford characters such as I/L/O/U.
 */
export function normalizeResearchParticipantCode(value: string): string {
  if (typeof value !== 'string') {
    throw new Error('Research participant code must be a string.');
  }
  const normalized = value.toUpperCase().replace(/[\t\n\r -]/g, '');
  if (normalized.length !== RESEARCH_PARTICIPANT_CODE_LENGTH) {
    throw new Error(`Research participant code must contain exactly ${RESEARCH_PARTICIPANT_CODE_LENGTH} Crockford Base32 characters.`);
  }
  if (!CODE_PATTERN.test(normalized)) {
    throw new Error(`Research participant code may use only ${RESEARCH_PARTICIPANT_CODE_ALPHABET}; ambiguous I, L, O, and U are not accepted.`);
  }
  return normalized;
}

export function validateResearchParticipantCode(value: unknown): ResearchParticipantCodeValidationResult {
  if (typeof value !== 'string') {
    return { valid: false, errors: ['Research participant code must be a string.'] };
  }
  try {
    return { valid: true, errors: [], normalized: normalizeResearchParticipantCode(value) };
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : 'Research participant code is invalid.'],
    };
  }
}

export function validateResearchParticipantId(value: unknown): value is string {
  return typeof value === 'string' && RESEARCH_PARTICIPANT_ID_PATTERN.test(value);
}

export function generateResearchParticipantCode(): string {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('Secure randomness is unavailable. Research participant codes require crypto.getRandomValues.');
  }
  const bytes = new Uint8Array(RESEARCH_PARTICIPANT_CODE_LENGTH);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => RESEARCH_PARTICIPANT_CODE_ALPHABET[byte & 31]).join('');
}

/**
 * Derives a manifest-scoped pseudonymous identifier. The entered code is never
 * returned; study teams must still disclose any possible linkage to learners.
 */
export async function deriveResearchParticipantId(
  manifest: ResearchManifestV1 | ResearchManifestRef | string,
  code: string,
): Promise<string> {
  if (typeof manifest !== 'string' && 'manifest' in manifest) {
    if (!(await verifyResearchManifestHash(manifest))) {
      throw new Error('Cannot derive a research participant ID from an invalid or modified Research Manifest.');
    }
  }
  const manifestSha256 = readManifestSha(manifest);
  const normalized = normalizeResearchParticipantCode(code);
  return hex(await sha256Bytes(`${PARTICIPANT_ID_DOMAIN}\0${manifestSha256}\0${normalized}`));
}

async function unbiasedWeightedBucket(
  manifestSha256: string,
  participantId: string,
  totalWeight: number,
): Promise<number> {
  const range = 1n << 256n;
  const total = BigInt(totalWeight);
  const acceptanceLimit = range - (range % total);
  // Rejection sampling makes every integer bucket exactly equiprobable. The
  // counter is part of the domain, so a rejection remains deterministic.
  for (let counter = 0; ; counter += 1) {
    if (!Number.isSafeInteger(counter)) throw new Error('Research arm assignment exhausted its deterministic hash counter.');
    const digest = await sha256Bytes(
      `${ASSIGNMENT_DOMAIN}\0${manifestSha256}\0${participantId}\0${counter}`,
    );
    const candidate = bytesToBigInt(digest);
    if (candidate < acceptanceLimit) return Number(candidate % total);
  }
}

export async function assignResearchArm(
  manifest: ResearchManifestV1,
  participantId: string,
): Promise<ResearchArmAssignment> {
  if (!(await verifyResearchManifestHash(manifest))) {
    throw new Error('Cannot assign a research arm from an invalid or modified Research Manifest.');
  }
  if (!validateResearchParticipantId(participantId)) {
    throw new Error('Research participant ID must be a lowercase 64-character SHA-256 digest.');
  }
  if (manifest.assignment.method === 'fixed') {
    return { armId: manifest.assignment.armId, method: 'fixed' };
  }
  const totalWeight = manifest.assignment.allocations.reduce(
    (total, allocation) => total + allocation.weight,
    0,
  );
  const bucket = await unbiasedWeightedBucket(
    manifest.manifest.sha256,
    participantId,
    totalWeight,
  );
  let cumulative = 0;
  for (const allocation of manifest.assignment.allocations) {
    cumulative += allocation.weight;
    if (bucket < cumulative) {
      return { armId: allocation.armId, method: 'sha256-weighted-v1' };
    }
  }
  throw new Error('Research arm assignment did not resolve to a declared allocation.');
}
