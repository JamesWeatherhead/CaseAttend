import { unzipSync, zipSync, type Zippable } from 'fflate';
import { canonicalizeJson } from '../core/casePackage';
import { composeLessonPrompt } from '../core/lessonPlan';
import {
  getResearchManifestRef,
  validateResearchManifestV1,
  verifyResearchManifestHash,
  type ResearchManifestRef,
  type ResearchManifestV1,
} from '../core/researchManifest';
import type { PortableCasePackageV1 } from '../core/portableCasePackage';
import {
  createResearchStudyBundleV1,
  validateResearchStudyBundleV1,
  type ResearchStudyBundleV1,
} from '../core/researchStudyBundle';
import {
  exportPortableCaseArchive,
  importPortableCaseArchive,
  PORTABLE_CASE_ARCHIVE_LIMITS,
} from './portableCaseArchive';

export const RESEARCH_SUPPORT_PACKET_SCHEMA = 'caseattend.research-support-packet' as const;
export const RESEARCH_SUPPORT_PACKET_VERSION = '1.0' as const;
export const RESEARCH_SUPPORT_PACKET_EXTENSION = '.caseattend-research.zip' as const;
export const RESEARCH_SUPPORT_PACKET_MIME_TYPE =
  'application/vnd.caseattend.research-support+zip' as const;
export const RESEARCH_SUPPORT_TEMPLATE_LABEL =
  'CaseAttend research support template — not an IRB, HIPAA, or FERPA determination.' as const;

export const RESEARCH_SUPPORT_PACKET_LIMITS = Object.freeze({
  maxArchiveBytes: 256 * 1024 * 1024,
  maxTotalUncompressedBytes: 240 * 1024 * 1024,
  maxPacketManifestBytes: 512 * 1024,
  maxResearchManifestBytes: 2 * 1024 * 1024,
  maxTemplateBytes: 512 * 1024,
  maxPromptBytes: 512 * 1024,
  maxCaseArchiveBytes: PORTABLE_CASE_ARCHIVE_LIMITS.maxArchiveBytes,
  maxEntries: 160,
});

const PACKET_MANIFEST_PATH = 'packet-manifest.json';
const RESEARCH_MANIFEST_PATH = 'config/research-manifest.json';
const CHECKSUMS_PATH = 'checksums.sha256';
const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const ZIP64_SENTINEL_16 = 0xffff;
const ZIP64_SENTINEL_32 = 0xffffffff;
const MAX_COMPRESSION_RATIO = 200;
const MIN_PACKET_ENTRY_COUNT = 14;
const MIN_PACKET_DESCRIPTOR_COUNT = MIN_PACKET_ENTRY_COUNT - 1;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const SAFE_ENTRY_PATH = /^(?:packet-manifest\.json|checksums\.sha256|config\/research-manifest\.json|templates\/[a-z0-9-]+\.md|prompts\/[a-z0-9-]+--[a-z0-9-]+\.txt|cases\/[a-z0-9-]+--[a-f0-9]{12}\.caseattend)$/;
const textEncoder = new TextEncoder();

const TEMPLATE_PATHS = [
  'templates/readme.md',
  'templates/protocol-summary.md',
  'templates/data-flow.md',
  'templates/data-dictionary.md',
  'templates/provider-model-list.md',
  'templates/risk-mitigation-notes.md',
  'templates/participant-information-sheet.md',
  'templates/retention-deletion-plan.md',
  'templates/analysis-export-plan.md',
] as const;

type ResearchSupportPacketRole =
  | 'research-manifest'
  | 'support-template'
  | 'exact-prompt'
  | 'portable-case-archive'
  | 'checksums';

export interface ResearchSupportPacketFileV1 {
  path: string;
  sha256: string;
  byteLength: number;
  mediaType: 'application/json' | 'text/markdown' | 'text/plain' | 'application/vnd.caseattend.case+zip';
  role: ResearchSupportPacketRole;
}

export interface ResearchSupportPacketManifestV1 {
  schema: typeof RESEARCH_SUPPORT_PACKET_SCHEMA;
  schemaVersion: typeof RESEARCH_SUPPORT_PACKET_VERSION;
  supportTemplateLabel: typeof RESEARCH_SUPPORT_TEMPLATE_LABEL;
  researchManifestRef: ResearchManifestRef;
  files: readonly ResearchSupportPacketFileV1[];
}

export interface ResearchSupportPacketImportV1 {
  packetManifest: ResearchSupportPacketManifestV1;
  bundle: ResearchStudyBundleV1;
  templates: Readonly<Record<string, string>>;
  exactPrompts: Readonly<Record<string, string>>;
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
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${path}.${key} is not allowed in a CaseAttend research support packet.`);
    }
  }
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
    throw new Error('Research packet entry names must be non-empty ASCII paths.');
  }
  return String.fromCharCode(...bytes);
}

function safeEntryPath(path: string): boolean {
  return !path.startsWith('/')
    && !path.includes('\\')
    && !path.includes('//')
    && !path.split('/').some((component) => component === '.' || component === '..')
    && SAFE_ENTRY_PATH.test(path);
}

function entryByteLimit(path: string): number {
  if (path === PACKET_MANIFEST_PATH) return RESEARCH_SUPPORT_PACKET_LIMITS.maxPacketManifestBytes;
  if (path === RESEARCH_MANIFEST_PATH) return RESEARCH_SUPPORT_PACKET_LIMITS.maxResearchManifestBytes;
  if (path === CHECKSUMS_PATH) return RESEARCH_SUPPORT_PACKET_LIMITS.maxTemplateBytes;
  if (path.startsWith('templates/')) return RESEARCH_SUPPORT_PACKET_LIMITS.maxTemplateBytes;
  if (path.startsWith('prompts/')) return RESEARCH_SUPPORT_PACKET_LIMITS.maxPromptBytes;
  return RESEARCH_SUPPORT_PACKET_LIMITS.maxCaseArchiveBytes;
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

/** Reject hidden, duplicated, traversing, oversized, or ambiguous ZIP data before inflation. */
function inspectZipEntries(bytes: Uint8Array): ZipEntryMetadata[] {
  if (
    bytes.byteLength === 0
    || bytes.byteLength > RESEARCH_SUPPORT_PACKET_LIMITS.maxArchiveBytes
  ) {
    throw new Error(
      `Research support packets must be between 1 byte and ${RESEARCH_SUPPORT_PACKET_LIMITS.maxArchiveBytes} bytes.`,
    );
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(view);
  if (view.getUint16(eocdOffset + 20, true) !== 0) {
    throw new Error('ZIP comments are not allowed in a research support packet.');
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
    throw new Error('ZIP64 research support packets are not supported.');
  }
  if (
    totalEntryCount < MIN_PACKET_ENTRY_COUNT
    || totalEntryCount > RESEARCH_SUPPORT_PACKET_LIMITS.maxEntries
  ) {
    throw new Error(
      `A research support packet must contain ${MIN_PACKET_ENTRY_COUNT} to ${RESEARCH_SUPPORT_PACKET_LIMITS.maxEntries} entries.`,
    );
  }
  if (centralOffset + centralSize !== eocdOffset) {
    throw new Error('ZIP central directory bounds are inconsistent.');
  }

  const entries: ZipEntryMetadata[] = [];
  const paths = new Set<string>();
  const localOffsets = new Set<number>();
  let totalUncompressed = 0;
  let offset = centralOffset;
  for (let index = 0; index < totalEntryCount; index += 1) {
    if (offset + 46 > eocdOffset || view.getUint32(offset, true) !== ZIP_CENTRAL_SIGNATURE) {
      throw new Error('ZIP central directory is malformed.');
    }
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const crc32 = view.getUint32(offset + 16, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const centralEntryEnd = offset + 46 + nameLength + extraLength + commentLength;
    if (centralEntryEnd > eocdOffset) throw new Error('ZIP central directory entry is truncated.');
    if (extraLength !== 0 || commentLength !== 0) {
      throw new Error('ZIP entry extra fields and comments are not allowed.');
    }
    if ((flags & 0x0001) !== 0) throw new Error('Encrypted ZIP entries are not supported.');
    if ((flags & 0x0008) !== 0) throw new Error('ZIP data descriptors are not allowed.');
    if ((flags & ~(0x0006 | 0x0800)) !== 0) {
      throw new Error('A ZIP entry uses unsupported general-purpose flags.');
    }
    if (method !== 0 && method !== 8) {
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
      throw new Error(`Research packet entry '${path}' is not an allowed safe path.`);
    }
    if (paths.has(path)) throw new Error(`Research packet entry '${path}' is duplicated.`);
    if (localOffsets.has(localHeaderOffset)) {
      throw new Error('ZIP entries cannot share a local file header.');
    }
    paths.add(path);
    localOffsets.add(localHeaderOffset);
    const byteLimit = entryByteLimit(path);
    if (uncompressedSize === 0 || uncompressedSize > byteLimit) {
      throw new Error(`Research packet entry '${path}' exceeds its ${byteLimit}-byte limit.`);
    }
    if (
      compressedSize > 0
      && uncompressedSize > 1_048_576
      && uncompressedSize / compressedSize > MAX_COMPRESSION_RATIO
    ) {
      throw new Error(`Research packet entry '${path}' has an unsafe compression ratio.`);
    }
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > RESEARCH_SUPPORT_PACKET_LIMITS.maxTotalUncompressedBytes) {
      throw new Error('The research packet exceeds its total uncompressed size limit.');
    }

    if (
      localHeaderOffset + 30 > centralOffset
      || view.getUint32(localHeaderOffset, true) !== ZIP_LOCAL_SIGNATURE
    ) {
      throw new Error(`Research packet entry '${path}' has an invalid local header.`);
    }
    const localFlags = view.getUint16(localHeaderOffset + 6, true);
    const localMethod = view.getUint16(localHeaderOffset + 8, true);
    const localCrc32 = view.getUint32(localHeaderOffset + 14, true);
    const localCompressedSize = view.getUint32(localHeaderOffset + 18, true);
    const localUncompressedSize = view.getUint32(localHeaderOffset + 22, true);
    const localNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    if (localExtraLength !== 0) {
      throw new Error(`Research packet entry '${path}' cannot contain a local extra field.`);
    }
    const localNameEnd = localHeaderOffset + 30 + localNameLength;
    const dataOffset = localNameEnd + localExtraLength;
    if (dataOffset + compressedSize > centralOffset) {
      throw new Error(`Research packet entry '${path}' points outside its data bounds.`);
    }
    const localPath = decodeAsciiPath(bytes.subarray(localHeaderOffset + 30, localNameEnd));
    if (localPath !== path || localFlags !== flags || localMethod !== method) {
      throw new Error(`Research packet entry '${path}' has conflicting ZIP metadata.`);
    }
    if (
      localCrc32 !== crc32
      || localCompressedSize !== compressedSize
      || localUncompressedSize !== uncompressedSize
    ) {
      throw new Error(`Research packet entry '${path}' has conflicting integrity metadata.`);
    }
    entries.push({
      path,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      dataEnd: dataOffset + compressedSize,
    });
    offset = centralEntryEnd;
  }
  if (offset !== eocdOffset || !paths.has(PACKET_MANIFEST_PATH)) {
    throw new Error('The packet must contain exactly one packet-manifest.json entry.');
  }
  const localRanges = [...entries].sort(
    (left, right) => left.localHeaderOffset - right.localHeaderOffset,
  );
  if (localRanges[0].localHeaderOffset !== 0) {
    throw new Error('A research packet cannot contain bytes before its first ZIP entry.');
  }
  for (let index = 1; index < localRanges.length; index += 1) {
    if (localRanges[index].localHeaderOffset !== localRanges[index - 1].dataEnd) {
      throw new Error('Research packet ZIP entries must be contiguous without hidden data.');
    }
  }
  if (localRanges.at(-1)?.dataEnd !== centralOffset) {
    throw new Error('A research packet cannot contain hidden data before its central directory.');
  }
  return entries;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const exact = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', exact);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function decodeUtf8(bytes: Uint8Array, path: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${path} must contain valid UTF-8.`);
  }
}

function parseJsonObject(bytes: Uint8Array, path: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(decodeUtf8(bytes, path));
  } catch (error) {
    if (error instanceof Error && /UTF-8/.test(error.message)) throw error;
    throw new Error(`${path} must contain valid JSON.`);
  }
  if (!isRecord(value)) throw new Error(`${path} must contain one JSON object.`);
  return value;
}

function manifestValidationError(errors: readonly string[]): Error {
  return new Error(
    `Cannot export an invalid research manifest:\n${errors.map((error) => `- ${error}`).join('\n')}`,
  );
}

function bundleManifest(bundle: ResearchStudyBundleV1): ResearchManifestV1 {
  return (bundle as unknown as { researchManifest: ResearchManifestV1 }).researchManifest;
}

function bundleCases(bundle: ResearchStudyBundleV1): readonly PortableCasePackageV1[] {
  return (bundle as unknown as { portableCases: readonly PortableCasePackageV1[] }).portableCases;
}

function assertBrowserLocalPacketPolicy(manifest: ResearchManifestV1, now: Date): void {
  if (
    manifest.collection.currentViewCapture.storedInSessionEvents !== false
    || manifest.collection.currentViewCapture.exported !== false
  ) {
    throw new Error('Research support packets cannot include captured current-view images.');
  }
  if (
    Number.isNaN(now.getTime())
    || Date.parse(now.toISOString()) >= Date.parse(manifest.dataManagement.browserDeleteAfter)
  ) {
    throw new Error(
      `Research retention ended at ${manifest.dataManagement.browserDeleteAfter}. Packet export is blocked; follow the configured deletion plan.`,
    );
  }
}

function portableCasePath(portable: PortableCasePackageV1): string {
  const { id, manifest } = portable.casePackage;
  if (!SAFE_ID.test(id) || !SHA256_PATTERN.test(manifest.sha256)) {
    throw new Error('A portable research case has an unsafe ID or manifest digest.');
  }
  return `cases/${id}--${manifest.sha256.slice(0, 12)}.caseattend`;
}

function exactPromptPath(armId: string, caseStepId: string): string {
  if (!SAFE_ID.test(armId) || !SAFE_ID.test(caseStepId)) {
    throw new Error('Research arm and case-step IDs must be safe lowercase kebab-case.');
  }
  return `prompts/${armId}--${caseStepId}.txt`;
}

function caseForStep(
  cases: readonly PortableCasePackageV1[],
  caseRef: { id: string; sha256: string },
  lessonRef: { id: string; version: string; sha256: string },
): PortableCasePackageV1 {
  const match = cases.find((candidate) => (
    candidate.casePackage.id === caseRef.id
    && candidate.casePackage.manifest.sha256 === caseRef.sha256
    && candidate.lessonPlan.id === lessonRef.id
    && candidate.lessonPlan.version === lessonRef.version
    && candidate.lessonPlan.manifest.sha256 === lessonRef.sha256
  ));
  if (!match) {
    throw new Error(`The exact portable case for research step '${caseRef.id}' is missing.`);
  }
  return match;
}

async function exactPrompts(
  manifest: ResearchManifestV1,
  cases: readonly PortableCasePackageV1[],
): Promise<Map<string, Uint8Array>> {
  const prompts = new Map<string, Uint8Array>();
  for (const arm of [...manifest.arms].sort((left, right) => left.id.localeCompare(right.id))) {
    for (const step of [...arm.caseSteps].sort((left, right) => left.id.localeCompare(right.id))) {
      const portable = caseForStep(cases, step.casePackageRef, step.lessonPlanRef);
      const composed = await composeLessonPrompt(portable.lessonPlan, {
        learnerLevel: step.learnerLevel,
        mode: step.mode,
        hasImage: true,
        caseContext: {
          id: portable.casePackage.id,
          title: portable.casePackage.title,
          vignette: portable.casePackage.vignette,
          neutralDescription: portable.casePackage.neutralDescription,
          domain: portable.casePackage.domain,
        },
      });
      const promptBytes = textEncoder.encode(composed.providerPrompt);
      const promptSha256 = await sha256Hex(promptBytes);
      if (promptSha256 !== step.systemPromptSha256) {
        throw new Error(
          `Exact prompt '${arm.id}/${step.id}' does not match its frozen systemPromptSha256.`,
        );
      }
      if (promptBytes.byteLength > RESEARCH_SUPPORT_PACKET_LIMITS.maxPromptBytes) {
        throw new Error(`Exact prompt '${arm.id}/${step.id}' exceeds the packet prompt limit.`);
      }
      const path = exactPromptPath(arm.id, step.id);
      if (prompts.has(path)) throw new Error(`Exact prompt path '${path}' is duplicated.`);
      prompts.set(path, promptBytes);
    }
  }
  return prompts;
}

function templateHeading(title: string): string {
  return `# ${title}\n\n> ${RESEARCH_SUPPORT_TEMPLATE_LABEL}\n\n`;
}

function jsonFence(value: unknown): string {
  return `\n\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`;
}

function markdownTemplates(manifest: ResearchManifestV1): Map<string, Uint8Array> {
  const providerRows = manifest.arms.map((arm) => ({
    armId: arm.id,
    armLabel: arm.label,
    gateway: arm.inferencePolicy.gateway,
    endpoint: arm.inferencePolicy.endpoint,
    requestedModelId: arm.inferencePolicy.requestedModelId,
    provider: arm.inferencePolicy.provider.only[0],
    providerPolicyUrl: arm.inferencePolicy.provider.policyUrl,
    temperature: arm.inferencePolicy.temperature,
    topP: arm.inferencePolicy.topP,
    maxTokens: arm.inferencePolicy.maxTokens,
    seed: arm.inferencePolicy.seed ?? null,
    allowFallbacks: arm.inferencePolicy.provider.allowFallbacks,
    requireParameters: arm.inferencePolicy.provider.requireParameters,
    zeroDataRetention: arm.inferencePolicy.provider.zeroDataRetention,
    dataCollection: arm.inferencePolicy.provider.dataCollection,
  }));
  const docs: Record<(typeof TEMPLATE_PATHS)[number], string> = {
    'templates/readme.md': `${templateHeading('CaseAttend Research Support Packet')}
This editable packet describes frozen study manifest **${manifest.id}** version **${manifest.version}**.

It supports preparation for institutional review. The investigator and institution remain responsible for determining whether the activity is human-subjects research, exempt, or subject to IRB, HIPAA, FERPA, contractual, state, local, or other requirements.

The exact machine-readable manifest, provider prompts, and portable teaching cases are included beside these templates. Editing a Markdown template does not change the frozen study manifest.`,
    'templates/protocol-summary.md': `${templateHeading('Protocol Summary')}
## Study identity

- Title: ${manifest.title}
- Manifest ID: ${manifest.id}
- Version: ${manifest.version}
- Application: ${manifest.application.name} ${manifest.application.version}
- Build revision: ${manifest.application.buildRevision}
- Deployment origin: ${manifest.deployment.origin}

## Editable protocol fields
${jsonFence(manifest.protocol)}

## Arms and assignment
${jsonFence({ arms: manifest.arms, assignment: manifest.assignment, tasks: manifest.tasks })}`,
    'templates/data-flow.md': `${templateHeading('Data Flow')}
## Frozen flow

\`\`\`mermaid
flowchart TD
  L["Participant browser"] -->|"system prompt, learner message, current view image"| G["OpenRouter"]
  G --> P["Locked upstream provider"]
  P -->|"model response"| L
  L -->|"allowlisted event metadata only"| I["Browser IndexedDB"]
  I -->|"manual file export"| R["Research team"]
\`\`\`

The browser-only key boundary protects the OpenRouter credential. It does **not** prevent the current view, system prompt, or learner message from being transmitted to OpenRouter and the locked upstream provider when the participant sends.

${jsonFence(manifest.dataManagement.dataFlow)}`,
    'templates/data-dictionary.md': `${templateHeading('Data Dictionary')}
## Stored research records

The browser-local recorder accepts only closed event types and enumerated IDs/numbers. It rejects raw learner text, raw model text, screenshots, image bytes, free-text notes, participant codes, credentials, and unknown fields.

| Group | Fields | Content boundary |
|---|---|---|
| Run | manifest digest, pseudonymous participant digest, arm ID, timestamps, status | No roster or participant code |
| Capture | case-step ID, image/image-stack kind, frame index/count, submitted-view SHA-256, JPEG dimensions, capture-pipeline version, annotation counts/revision | No image or thumbnail bytes |
| Learner turn | case-step ID, typed/retry/hint source, chat/deep-think mode, optional hint ID | No learner message |
| Model turn | system-prompt/config SHA-256, model/provider IDs, latency, token counts, finish reason, allowlisted failure code/status/retry flag | No learner message, provider error body, prompt body, image, or model response text |
| Outcome | task/objective/criterion/option IDs, numeric score and duration | No free-text answer |

## Participant-code boundary
${jsonFence(manifest.participantCodes)}

## Manifest collection policy
${jsonFence(manifest.collection)}`,
    'templates/provider-model-list.md': `${templateHeading('Model and Third-Party Provider List')}
Each arm locks one requested model and one upstream provider route. Fallbacks are disabled and exact parameters are required. Hosted model outputs can still change over time; these locks improve reproducibility but do not make provider behavior deterministic.

${jsonFence(providerRows)}`,
    'templates/risk-mitigation-notes.md': `${templateHeading('Risk and Mitigation Notes')}
Review and adapt these notes with the institution:

- Pseudonymous participant IDs remain coded data, not anonymous data. Keep the linkage roster outside CaseAttend.
- Learner messages and the current view are transmitted for inference even though raw chat and images are not stored in the research log or exported.
- Do not use identifiable patient or student data in the public browser-local deployment.
- Browser storage is available to people with access to the same browser profile; avoid shared profiles.
- Model/provider drift is reduced through frozen routing and sampling parameters and must be monitored as a possible protocol deviation.
- Exported copies are outside CaseAttend's deletion control; maintain the institution's access and deletion procedure.
- CaseAttend does not determine IRB, HIPAA, FERPA, consent, authorization, waiver, de-identification, or data-use-agreement status.

Official starting points: [OHRP 45 CFR 46](https://www.hhs.gov/ohrp/regulations-and-policy/regulations/45-cfr-46/index.html) and [U.S. Department of Education privacy guidance](https://studentprivacy.ed.gov/privacy-and-data-sharing).`,
    'templates/participant-information-sheet.md': `${templateHeading('Participant Information / Consent-Language Template')}
This file is editable language for institutional review; it is not consent documentation and does not replace the institution's approved process.

${jsonFence(manifest.participantInformation)}`,
    'templates/retention-deletion-plan.md': `${templateHeading('Retention and Deletion Plan')}
- Browser deletion deadline: ${manifest.dataManagement.browserDeleteAfter}
- Exported-copy deletion deadline: ${manifest.dataManagement.exportedCopiesDeleteAfter}
- Browser storage: ${manifest.dataManagement.browserStorage}
- Automatic remote sync: ${manifest.dataManagement.automaticRemoteSync ? 'yes' : 'no'}
- Study export: ${manifest.dataManagement.studyExport}
- Access roles: ${manifest.dataManagement.accessRoles.join(', ')}

## Frozen deletion instructions

${manifest.dataManagement.deletionInstructions}

Browser-local deletion cannot recall an already downloaded or shared copy. Document who confirms deletion of each exported copy.`,
    'templates/analysis-export-plan.md': `${templateHeading('Analysis and Export Plan')}
## Frozen task and export configuration
${jsonFence({ tasks: manifest.tasks, exportFormats: manifest.dataManagement.exportFormats })}

The machine-readable event export should be treated as restricted pseudonymous data. Define exclusions for protocol deviations, missing records, incomplete runs, and retention-expired data before analysis. Public reporting should use appropriately reviewed aggregate disclosure controls rather than row-level participant data.`,
  };
  const encoded = new Map<string, Uint8Array>();
  for (const path of TEMPLATE_PATHS) {
    const text = docs[path];
    if (!text.includes(RESEARCH_SUPPORT_TEMPLATE_LABEL)) {
      throw new Error(`Support template '${path}' is missing its required label.`);
    }
    const bytes = textEncoder.encode(`${text.trimEnd()}\n`);
    if (bytes.byteLength > RESEARCH_SUPPORT_PACKET_LIMITS.maxTemplateBytes) {
      throw new Error(`Support template '${path}' exceeds the packet template limit.`);
    }
    encoded.set(path, bytes);
  }
  return encoded;
}

function mediaTypeAndRole(path: string): Pick<ResearchSupportPacketFileV1, 'mediaType' | 'role'> {
  if (path === RESEARCH_MANIFEST_PATH) {
    return { mediaType: 'application/json', role: 'research-manifest' };
  }
  if (path === CHECKSUMS_PATH) return { mediaType: 'text/plain', role: 'checksums' };
  if (path.startsWith('templates/')) {
    return { mediaType: 'text/markdown', role: 'support-template' };
  }
  if (path.startsWith('prompts/')) return { mediaType: 'text/plain', role: 'exact-prompt' };
  return { mediaType: 'application/vnd.caseattend.case+zip', role: 'portable-case-archive' };
}

async function fileDescriptor(
  path: string,
  bytes: Uint8Array,
): Promise<ResearchSupportPacketFileV1> {
  return {
    path,
    sha256: await sha256Hex(bytes),
    byteLength: bytes.byteLength,
    ...mediaTypeAndRole(path),
  };
}

function checksumText(files: readonly ResearchSupportPacketFileV1[]): string {
  return `${files.map((file) => `${file.sha256}  ${file.path}`).join('\n')}\n`;
}

function parsePacketManifest(bytes: Uint8Array): ResearchSupportPacketManifestV1 {
  const value = parseJsonObject(bytes, PACKET_MANIFEST_PATH);
  rejectUnknownKeys(
    value,
    ['schema', 'schemaVersion', 'supportTemplateLabel', 'researchManifestRef', 'files'],
    'packetManifest',
  );
  if (value.schema !== RESEARCH_SUPPORT_PACKET_SCHEMA) {
    throw new Error(`packetManifest.schema must be '${RESEARCH_SUPPORT_PACKET_SCHEMA}'.`);
  }
  if (value.schemaVersion !== RESEARCH_SUPPORT_PACKET_VERSION) {
    throw new Error(`packetManifest.schemaVersion must be '${RESEARCH_SUPPORT_PACKET_VERSION}'.`);
  }
  if (value.supportTemplateLabel !== RESEARCH_SUPPORT_TEMPLATE_LABEL) {
    throw new Error('The packet must identify every Markdown document as a support template.');
  }
  if (!isRecord(value.researchManifestRef)) {
    throw new Error('packetManifest.researchManifestRef must be an object.');
  }
  rejectUnknownKeys(value.researchManifestRef, ['id', 'version', 'sha256'], 'packetManifest.researchManifestRef');
  const ref = value.researchManifestRef;
  if (
    typeof ref.id !== 'string'
    || !SAFE_ID.test(ref.id)
    || typeof ref.version !== 'string'
    || !SEMVER_PATTERN.test(ref.version)
    || typeof ref.sha256 !== 'string'
    || !SHA256_PATTERN.test(ref.sha256)
  ) {
    throw new Error('packetManifest.researchManifestRef is invalid.');
  }
  if (
    !Array.isArray(value.files)
    || value.files.length < MIN_PACKET_DESCRIPTOR_COUNT
    || value.files.length > RESEARCH_SUPPORT_PACKET_LIMITS.maxEntries - 1
  ) {
    throw new Error(
      `packetManifest.files must contain ${MIN_PACKET_DESCRIPTOR_COUNT} to ${RESEARCH_SUPPORT_PACKET_LIMITS.maxEntries - 1} descriptors.`,
    );
  }
  const seenPaths = new Set<string>();
  const files = value.files.map((candidate, index): ResearchSupportPacketFileV1 => {
    if (!isRecord(candidate)) throw new Error(`packetManifest.files[${index}] must be an object.`);
    rejectUnknownKeys(candidate, ['path', 'sha256', 'byteLength', 'mediaType', 'role'], `packetManifest.files[${index}]`);
    if (
      typeof candidate.path !== 'string'
      || !safeEntryPath(candidate.path)
      || candidate.path === PACKET_MANIFEST_PATH
      || typeof candidate.sha256 !== 'string'
      || !SHA256_PATTERN.test(candidate.sha256)
      || !Number.isSafeInteger(candidate.byteLength)
      || (candidate.byteLength as number) <= 0
      || (candidate.byteLength as number) > entryByteLimit(candidate.path)
    ) {
      throw new Error(`packetManifest.files[${index}] contains invalid path or integrity metadata.`);
    }
    const expected = mediaTypeAndRole(candidate.path);
    if (candidate.mediaType !== expected.mediaType || candidate.role !== expected.role) {
      throw new Error(`packetManifest.files[${index}] media type and role do not match its path.`);
    }
    if (seenPaths.has(candidate.path)) {
      throw new Error(`packetManifest file '${candidate.path}' is duplicated.`);
    }
    seenPaths.add(candidate.path);
    return {
      path: candidate.path,
      sha256: candidate.sha256,
      byteLength: candidate.byteLength as number,
      mediaType: expected.mediaType,
      role: expected.role,
    };
  });
  const requiredPaths = [RESEARCH_MANIFEST_PATH, CHECKSUMS_PATH, ...TEMPLATE_PATHS];
  for (const path of requiredPaths) {
    if (!seenPaths.has(path)) throw new Error(`Research packet is missing required file '${path}'.`);
  }
  return {
    schema: RESEARCH_SUPPORT_PACKET_SCHEMA,
    schemaVersion: RESEARCH_SUPPORT_PACKET_VERSION,
    supportTemplateLabel: RESEARCH_SUPPORT_TEMPLATE_LABEL,
    researchManifestRef: {
      id: ref.id as string,
      version: ref.version as string,
      sha256: ref.sha256 as string,
    },
    files: files.sort((left, right) => left.path.localeCompare(right.path)),
  };
}

/** Create a deterministic, editable, integrity-checked research support packet. */
export async function exportResearchSupportPacket(
  bundle: ResearchStudyBundleV1,
): Promise<Uint8Array> {
  const snapshot = structuredClone(bundle);
  const bundleValidation = await validateResearchStudyBundleV1(snapshot);
  if (!bundleValidation.valid) {
    throw new Error(
      `Cannot export an invalid research study bundle:\n${bundleValidation.errors.map((error) => `- ${error}`).join('\n')}`,
    );
  }
  const manifest = bundleManifest(snapshot);
  const manifestValidation = validateResearchManifestV1(manifest);
  if (!manifestValidation.valid) throw manifestValidationError(manifestValidation.errors);
  if (!(await verifyResearchManifestHash(manifest))) {
    throw new Error('The research manifest hash does not match its frozen content.');
  }
  assertBrowserLocalPacketPolicy(manifest, new Date());

  const files = new Map<string, Uint8Array>();
  const researchManifestBytes = textEncoder.encode(canonicalizeJson(manifest));
  if (researchManifestBytes.byteLength > RESEARCH_SUPPORT_PACKET_LIMITS.maxResearchManifestBytes) {
    throw new Error('The exact research manifest exceeds the packet configuration limit.');
  }
  files.set(RESEARCH_MANIFEST_PATH, researchManifestBytes);
  for (const [path, bytes] of markdownTemplates(manifest)) files.set(path, bytes);
  for (const [path, bytes] of await exactPrompts(manifest, bundleCases(snapshot))) files.set(path, bytes);
  for (const portable of [...bundleCases(snapshot)].sort((left, right) => (
    portableCasePath(left).localeCompare(portableCasePath(right))
  ))) {
    const path = portableCasePath(portable);
    if (files.has(path)) throw new Error(`Portable case archive path '${path}' is duplicated.`);
    const archive = await exportPortableCaseArchive(portable);
    if (archive.byteLength > RESEARCH_SUPPORT_PACKET_LIMITS.maxCaseArchiveBytes) {
      throw new Error(`Portable case archive '${path}' exceeds the packet case limit.`);
    }
    files.set(path, archive);
  }

  const baseDescriptors: ResearchSupportPacketFileV1[] = [];
  for (const [path, bytes] of [...files].sort(([left], [right]) => left.localeCompare(right))) {
    baseDescriptors.push(await fileDescriptor(path, bytes));
  }
  const checksumsBytes = textEncoder.encode(checksumText(baseDescriptors));
  files.set(CHECKSUMS_PATH, checksumsBytes);
  const descriptors = [...baseDescriptors, await fileDescriptor(CHECKSUMS_PATH, checksumsBytes)]
    .sort((left, right) => left.path.localeCompare(right.path));
  const packetManifest: ResearchSupportPacketManifestV1 = {
    schema: RESEARCH_SUPPORT_PACKET_SCHEMA,
    schemaVersion: RESEARCH_SUPPORT_PACKET_VERSION,
    supportTemplateLabel: RESEARCH_SUPPORT_TEMPLATE_LABEL,
    researchManifestRef: getResearchManifestRef(manifest),
    files: descriptors,
  };
  const packetManifestBytes = textEncoder.encode(canonicalizeJson(packetManifest));
  if (packetManifestBytes.byteLength > RESEARCH_SUPPORT_PACKET_LIMITS.maxPacketManifestBytes) {
    throw new Error('packet-manifest.json exceeds its allowed size.');
  }
  files.set(PACKET_MANIFEST_PATH, packetManifestBytes);
  const totalBytes = [...files.values()].reduce((total, value) => total + value.byteLength, 0);
  if (totalBytes > RESEARCH_SUPPORT_PACKET_LIMITS.maxTotalUncompressedBytes) {
    throw new Error('The research support packet exceeds its total uncompressed size limit.');
  }
  const zipFiles: Zippable = {};
  for (const [path, bytes] of [...files].sort(([left], [right]) => left.localeCompare(right))) {
    zipFiles[path] = bytes;
  }
  const archive = zipSync(zipFiles, {
    level: 6,
    mtime: new Date('1980-01-01T00:00:00.000Z'),
    os: 3,
    attrs: 0o644 << 16,
  });
  inspectZipEntries(archive);
  return archive;
}

async function archiveInputBytes(
  input: Uint8Array | ArrayBuffer | Blob,
): Promise<Uint8Array> {
  if (typeof Blob !== 'undefined' && input instanceof Blob) {
    if (
      input.size === 0
      || input.size > RESEARCH_SUPPORT_PACKET_LIMITS.maxArchiveBytes
    ) {
      throw new Error(
        `Research support packets must be between 1 byte and ${RESEARCH_SUPPORT_PACKET_LIMITS.maxArchiveBytes} bytes.`,
      );
    }
    return new Uint8Array(await input.arrayBuffer());
  }
  return asUint8Array(input as Uint8Array | ArrayBuffer);
}

/** Import, hash-check, and reconstruct only the declared research support files. */
export async function importResearchSupportPacket(
  input: Uint8Array | ArrayBuffer | Blob,
): Promise<ResearchSupportPacketImportV1> {
  const bytes = await archiveInputBytes(input);
  const inspected = inspectZipEntries(bytes);
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error('The research support packet could not be decompressed safely.');
  }
  const inspectedPaths = inspected.map((entry) => entry.path).sort();
  const extractedPaths = Object.keys(files).sort();
  if (
    inspectedPaths.length !== extractedPaths.length
    || inspectedPaths.some((path, index) => path !== extractedPaths[index])
  ) {
    throw new Error('The research packet entry list changed during decompression.');
  }
  const packetManifestBytes = files[PACKET_MANIFEST_PATH];
  if (!packetManifestBytes) throw new Error('The packet is missing packet-manifest.json.');
  const packetManifest = parsePacketManifest(packetManifestBytes);
  const expectedPaths = new Set([
    PACKET_MANIFEST_PATH,
    ...packetManifest.files.map((file) => file.path),
  ]);
  for (const path of extractedPaths) {
    if (!expectedPaths.has(path)) {
      throw new Error(`Research packet entry '${path}' is not declared by packet-manifest.json.`);
    }
  }
  if (expectedPaths.size !== extractedPaths.length) {
    const missing = [...expectedPaths].find((path) => !Object.hasOwn(files, path));
    throw new Error(`Research packet entry '${missing ?? 'unknown'}' is declared but missing.`);
  }
  for (const descriptor of packetManifest.files) {
    const entry = files[descriptor.path];
    if (!entry || entry.byteLength !== descriptor.byteLength) {
      throw new Error(`Research packet entry '${descriptor.path}' has the wrong byte length.`);
    }
    if (await sha256Hex(entry) !== descriptor.sha256) {
      throw new Error(`Research packet entry '${descriptor.path}' failed SHA-256 verification.`);
    }
  }
  const baseDescriptors = packetManifest.files.filter((file) => file.path !== CHECKSUMS_PATH);
  if (decodeUtf8(files[CHECKSUMS_PATH], CHECKSUMS_PATH) !== checksumText(baseDescriptors)) {
    throw new Error('checksums.sha256 does not exactly match the packet file descriptors.');
  }

  const researchManifestValue = parseJsonObject(
    files[RESEARCH_MANIFEST_PATH],
    RESEARCH_MANIFEST_PATH,
  );
  const manifestValidation = validateResearchManifestV1(researchManifestValue);
  if (!manifestValidation.valid) throw manifestValidationError(manifestValidation.errors);
  const manifest = researchManifestValue as unknown as ResearchManifestV1;
  if (!(await verifyResearchManifestHash(manifest))) {
    throw new Error('The imported research manifest hash does not match its content.');
  }
  const manifestRef = getResearchManifestRef(manifest);
  if (canonicalizeJson(manifestRef) !== canonicalizeJson(packetManifest.researchManifestRef)) {
    throw new Error('The packet manifest does not reference the exact imported research manifest.');
  }
  assertBrowserLocalPacketPolicy(manifest, new Date(0));

  const portableCases: PortableCasePackageV1[] = [];
  for (const descriptor of packetManifest.files.filter(
    (file) => file.role === 'portable-case-archive',
  )) {
    const portable = await importPortableCaseArchive(files[descriptor.path]);
    if (portableCasePath(portable) !== descriptor.path) {
      throw new Error(`Portable case archive '${descriptor.path}' does not match its case digest.`);
    }
    portableCases.push(portable);
  }
  const bundle = await createResearchStudyBundleV1(manifest, portableCases);
  const expectedPrompts = await exactPrompts(manifest, portableCases);
  const promptDescriptors = packetManifest.files.filter((file) => file.role === 'exact-prompt');
  if (expectedPrompts.size !== promptDescriptors.length) {
    throw new Error('The packet does not contain the exact frozen prompt set.');
  }
  const exactPromptText: Record<string, string> = {};
  for (const descriptor of promptDescriptors) {
    const expected = expectedPrompts.get(descriptor.path);
    if (!expected || await sha256Hex(expected) !== descriptor.sha256) {
      throw new Error(`Exact prompt '${descriptor.path}' does not match the frozen study bundle.`);
    }
    exactPromptText[descriptor.path] = decodeUtf8(files[descriptor.path], descriptor.path);
  }
  const templates: Record<string, string> = {};
  for (const descriptor of packetManifest.files.filter((file) => file.role === 'support-template')) {
    const text = decodeUtf8(files[descriptor.path], descriptor.path);
    if (!text.includes(RESEARCH_SUPPORT_TEMPLATE_LABEL)) {
      throw new Error(`Support template '${descriptor.path}' is missing the required disclaimer.`);
    }
    templates[descriptor.path] = text;
  }
  return {
    packetManifest,
    bundle,
    templates,
    exactPrompts: exactPromptText,
  };
}

export function researchSupportPacketBlob(bytes: Uint8Array): Blob {
  return new Blob([asUint8Array(bytes).buffer], { type: RESEARCH_SUPPORT_PACKET_MIME_TYPE });
}
