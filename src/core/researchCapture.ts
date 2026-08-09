export const RESEARCH_CAPTURE_PIPELINE_VERSION = 'caseattend-canvas-jpeg-v1' as const;
export const RESEARCH_CAPTURE_MIME_TYPE = 'image/jpeg' as const;

const JPEG_DATA_URL_PREFIX = 'data:image/jpeg;base64,';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MAX_CAPTURE_BYTES = 32 * 1024 * 1024;
const MAX_CAPTURE_AXIS = 8192;

export interface ResearchCaptureInput {
  image: string;
  mimeType?: 'image/jpeg';
  width?: number;
  height?: number;
  capturePipelineVersion?: 'caseattend-canvas-jpeg-v1';
}

export interface ResearchSubmittedViewFingerprint {
  submittedViewSha256: string;
  mimeType: typeof RESEARCH_CAPTURE_MIME_TYPE;
  width: number;
  height: number;
  capturePipelineVersion: typeof RESEARCH_CAPTURE_PIPELINE_VERSION;
}

function decodeCanonicalJpegDataUrl(value: string): Uint8Array {
  if (!value.startsWith(JPEG_DATA_URL_PREFIX)) {
    throw new Error('Research capture requires a browser-generated JPEG data URL.');
  }
  const encoded = value.slice(JPEG_DATA_URL_PREFIX.length);
  if (!encoded || encoded.length > Math.ceil(MAX_CAPTURE_BYTES / 3) * 4 + 4) {
    throw new Error('Research capture is empty or exceeds the 32 MiB byte limit.');
  }
  if (encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new Error('Research capture has invalid base64 encoding.');
  }
  let decoded: string;
  try {
    decoded = atob(encoded);
  } catch {
    throw new Error('Research capture has invalid base64 encoding.');
  }
  if (decoded.length === 0 || decoded.length > MAX_CAPTURE_BYTES) {
    throw new Error('Research capture is empty or exceeds the 32 MiB byte limit.');
  }
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  // The canvas encoder must produce an actual JPEG, not merely a matching URL.
  if (bytes.length < 4
    || bytes[0] !== 0xff
    || bytes[1] !== 0xd8
    || bytes[bytes.length - 2] !== 0xff
    || bytes[bytes.length - 1] !== 0xd9) {
    throw new Error('Research capture is not a complete JPEG image.');
  }
  return bytes;
}

function assertDimension(value: number | undefined, label: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value ?? 0) <= 0 || (value ?? 0) > MAX_CAPTURE_AXIS) {
    throw new Error(`Research capture ${label} must be an integer from 1 to ${MAX_CAPTURE_AXIS}.`);
  }
}

/**
 * Hash the exact JPEG bytes submitted to inference while returning no pixels,
 * data URL, prompt, or learner text. Research records may retain this result;
 * they must never retain the input object.
 */
export async function fingerprintResearchCapture(
  capture: ResearchCaptureInput,
): Promise<ResearchSubmittedViewFingerprint> {
  if (capture.mimeType !== RESEARCH_CAPTURE_MIME_TYPE) {
    throw new Error('Research capture MIME type does not match the frozen JPEG policy.');
  }
  if (capture.capturePipelineVersion !== RESEARCH_CAPTURE_PIPELINE_VERSION) {
    throw new Error('Research capture pipeline does not match the frozen study.');
  }
  assertDimension(capture.width, 'width');
  assertDimension(capture.height, 'height');
  const bytes = decodeCanonicalJpegDataUrl(capture.image);
  const digestInput = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(digestInput).set(bytes);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', digestInput));
  const submittedViewSha256 = [...digest]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  if (!SHA256_PATTERN.test(submittedViewSha256)) {
    throw new Error('Research capture digest could not be computed.');
  }
  return {
    submittedViewSha256,
    mimeType: RESEARCH_CAPTURE_MIME_TYPE,
    width: capture.width,
    height: capture.height,
    capturePipelineVersion: RESEARCH_CAPTURE_PIPELINE_VERSION,
  };
}
