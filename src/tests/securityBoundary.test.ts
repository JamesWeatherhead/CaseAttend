// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionEventV1 } from '../core/sessionEvents';
import { exportSessionEventsCsv, exportSessionEventsJsonl } from '../core/sessionExports';
import { streamChatResponse } from '../services/aiClient';
import { setKey, setModel } from '../services/byokStore';
import { SessionRecorder } from '../services/sessionRecorder';
import { SessionStore } from '../services/sessionStore';

const SENTINEL_KEY = 'sk-sentinel-must-only-be-an-openrouter-header';

function startEvent(): SessionEventV1 {
  return {
    schema: 'caseattend.session-event',
    schemaVersion: '1.0',
    appVersion: '0.2.0',
    eventId: '10000000-0000-4000-8000-000000000001',
    sessionId: '20000000-0000-4000-8000-000000000002',
    sequence: 0,
    occurredAt: '2026-08-09T12:00:00.000Z',
    casePackageRef: {
      id: 'derm-bcc',
      schemaVersion: '1.0',
      sha256: 'a'.repeat(64),
    },
    lessonPlanRef: {
      id: 'derm-bcc-lesson',
      version: '1.0.0',
      sha256: 'b'.repeat(64),
    },
    event: { type: 'session_started', startReason: 'case_opened' },
  };
}

describe('browser-only credential and session-data boundary', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('places the key only in the exact OpenRouter Authorization header', async () => {
    setKey(SENTINEL_KEY);
    setModel('test/vision-model');
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'Teaching response' }, finish_reason: 'stop' }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    const inferenceResult = await streamChatResponse(
      'sentinel learner chat text',
      'chat',
      'undergrad',
      'data:image/png;base64,sentinel-image-pixels',
      vi.fn(),
      'openrouter',
      'dermatology',
      'derm-bcc',
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [requestUrl, requestInit] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(requestUrl).toBe('https://openrouter.ai/api/v1/chat/completions');
    const headers = requestInit.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${SENTINEL_KEY}`);
    expect(requestUrl).not.toContain(SENTINEL_KEY);
    expect(String(requestInit.body)).not.toContain(SENTINEL_KEY);
    for (const [name, value] of Object.entries(headers)) {
      if (name !== 'Authorization') expect(value).not.toContain(SENTINEL_KEY);
    }

    const store = new SessionStore({ indexedDB: null });
    const seed = startEvent();
    const ids = [
      seed.sessionId,
      seed.eventId,
      '30000000-0000-4000-8000-000000000003',
      '40000000-0000-4000-8000-000000000004',
      '50000000-0000-4000-8000-000000000005',
    ];
    const recorder = SessionRecorder.start({
      casePackageRef: seed.casePackageRef,
      lessonPlanRef: seed.lessonPlanRef,
    }, 'case_opened', undefined, {
      store,
      createId: () => ids.shift() ?? crypto.randomUUID(),
      now: () => seed.occurredAt,
      appVersion: seed.appVersion,
    });
    const turnId = '60000000-0000-4000-8000-000000000006';
    await recorder.record({
      type: 'learner_message_submitted',
      turnId,
      inputSource: 'typed',
      learnerLevel: 'undergrad',
      mode: 'chat',
    });
    await recorder.record({
      type: 'model_response_completed',
      turnId,
      promptSha256: inferenceResult.promptSha256,
      gateway: 'openrouter',
      requestedModelId: inferenceResult.model,
      ...(inferenceResult.resolvedModelId
        ? { resolvedModelId: inferenceResult.resolvedModelId }
        : {}),
      ...(inferenceResult.upstreamProviderId
        ? { upstreamProviderId: inferenceResult.upstreamProviderId }
        : {}),
      latencyMs: inferenceResult.latencyMs,
      ...(inferenceResult.usage ? { usage: inferenceResult.usage } : {}),
      ...(inferenceResult.finishReason
        ? { finishReason: inferenceResult.finishReason }
        : {}),
    });
    const events = await store.listEvents();
    const jsonl = exportSessionEventsJsonl(events);
    const csv = exportSessionEventsCsv(events);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    for (const output of [JSON.stringify(inferenceResult), JSON.stringify(events), jsonl, csv]) {
      expect(output).not.toContain(SENTINEL_KEY);
      expect(output).not.toContain('sentinel learner chat text');
      expect(output).not.toContain('sentinel-image-pixels');
      expect(output).not.toContain('Authorization');
    }
  });
});
