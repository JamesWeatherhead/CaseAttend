import { describe, expect, it } from 'vitest';
import {
  fingerprintResearchCapture,
  RESEARCH_CAPTURE_MIME_TYPE,
  RESEARCH_CAPTURE_PIPELINE_VERSION,
} from '../core/researchCapture';

function jpegDataUrl(payload: readonly number[]): string {
  const bytes = Uint8Array.from([0xff, 0xd8, ...payload, 0xff, 0xd9]);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

describe('research capture fingerprint', () => {
  it('hashes the exact submitted JPEG bytes without returning pixels', async () => {
    const first = await fingerprintResearchCapture({
      image: jpegDataUrl([1, 2, 3]),
      mimeType: RESEARCH_CAPTURE_MIME_TYPE,
      width: 640,
      height: 480,
      capturePipelineVersion: RESEARCH_CAPTURE_PIPELINE_VERSION,
    });
    const second = await fingerprintResearchCapture({
      image: jpegDataUrl([1, 2, 4]),
      mimeType: RESEARCH_CAPTURE_MIME_TYPE,
      width: 640,
      height: 480,
      capturePipelineVersion: RESEARCH_CAPTURE_PIPELINE_VERSION,
    });

    expect(first.submittedViewSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.submittedViewSha256).not.toBe(second.submittedViewSha256);
    expect(first).toEqual({
      submittedViewSha256: first.submittedViewSha256,
      mimeType: 'image/jpeg',
      width: 640,
      height: 480,
      capturePipelineVersion: 'caseattend-canvas-jpeg-v1',
    });
    expect(JSON.stringify(first)).not.toContain('data:image');
  });

  it.each([
    { image: 'data:image/png;base64,/9j/2Q==', mimeType: 'image/jpeg' as const, width: 1, height: 1, capturePipelineVersion: RESEARCH_CAPTURE_PIPELINE_VERSION },
    { image: 'data:image/jpeg;base64,Zm9v', mimeType: 'image/jpeg' as const, width: 1, height: 1, capturePipelineVersion: RESEARCH_CAPTURE_PIPELINE_VERSION },
    { image: jpegDataUrl([]), mimeType: undefined, width: 1, height: 1, capturePipelineVersion: RESEARCH_CAPTURE_PIPELINE_VERSION },
    { image: jpegDataUrl([]), mimeType: 'image/jpeg' as const, width: 0, height: 1, capturePipelineVersion: RESEARCH_CAPTURE_PIPELINE_VERSION },
    { image: jpegDataUrl([]), mimeType: 'image/jpeg' as const, width: 1, height: 1, capturePipelineVersion: undefined },
  ])('fails closed for incomplete or mismatched capture metadata', async (capture) => {
    await expect(fingerprintResearchCapture(capture)).rejects.toThrow(/Research capture/);
  });
});
