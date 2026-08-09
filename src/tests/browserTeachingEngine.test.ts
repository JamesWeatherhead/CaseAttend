// @vitest-environment jsdom

import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  streamChatResponse: vi.fn(),
}));

vi.mock('../services/aiClient', () => ({
  streamChatResponse: mocks.streamChatResponse,
}));

import {
  browserTeachingEngineContract,
  createBrowserTeachingEngine,
} from '../services/browserTeachingEngine';

const result = {
  provider: 'openrouter' as const,
  model: 'openai/gpt-4.1-mini',
  resolvedModelId: 'openai/gpt-4.1-mini-2026-08-01',
  upstreamProviderId: 'provider-a',
  latencyMs: 18,
  finishReason: 'stop' as const,
  usage: { promptTokens: 10, completionTokens: 4, totalTokens: 14 },
  promptSha256: 'a'.repeat(64),
};

describe('browser teaching engine public-core bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('crypto', webcrypto);
    mocks.streamChatResponse.mockImplementation(async (...args: unknown[]) => {
      const onChunk = args[4] as (text: string) => void;
      onChunk('Core bridge answer');
      return result;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports the stable headless contract', () => {
    expect(browserTeachingEngineContract()).toEqual({ contractVersion: '1.0' });
  });

  it('forwards the exact submitted view and emits metadata-only core events', async () => {
    const events: unknown[] = [];
    const engine = createBrowserTeachingEngine({ onCoreEvent: (event) => { events.push(event); } });
    const exactCurrentView = 'data:image/png;base64,aGVsbG8=';
    const onChunk = vi.fn();

    const response = await engine.runTurn(
      'What do you notice?',
      'chat',
      'undergrad',
      exactCurrentView,
      onChunk,
      'openrouter',
      'dermatology',
      'derm-example',
      undefined,
      'openai/gpt-4.1-mini',
    );

    expect(response).toBe(result);
    expect(mocks.streamChatResponse).toHaveBeenCalledTimes(1);
    expect(mocks.streamChatResponse.mock.calls[0][3]).toBe(exactCurrentView);
    expect(onChunk.mock.calls[0][0]).toBe('Core bridge answer');
    expect(events.map((event: any) => event.type)).toEqual(['turn_started', 'turn_succeeded']);
    const serializedEvents = JSON.stringify(events);
    expect(serializedEvents).not.toContain('What do you notice?');
    expect(serializedEvents).not.toContain(exactCurrentView);
    expect(serializedEvents).not.toContain('derm-example');
    expect(engine.diagnostics()).toEqual({ activeTurns: 0 });
    expect(JSON.stringify(engine)).toBe('{}');
  });

  it('cleans private turn context and preserves the app-safe adapter error on failure', async () => {
    const engine = createBrowserTeachingEngine();
    const safeAdapterError = Object.assign(new Error('Curated failure'), {
      code: 'network_error',
      retryable: true,
    });
    mocks.streamChatResponse.mockRejectedValueOnce(safeAdapterError);

    await expect(engine.runTurn(
      'Try once',
      'deep_think',
      'resident',
      null,
      vi.fn(),
      'openrouter',
      'radiology',
      'ct-example',
    )).rejects.toBe(safeAdapterError);

    expect(engine.diagnostics()).toEqual({ activeTurns: 0 });
  });

  it('rejects unsupported current-view data before provider inference and clears context', async () => {
    const engine = createBrowserTeachingEngine();

    await expect(engine.runTurn(
      'Inspect this view',
      'chat',
      'undergrad',
      'data:image/svg+xml;base64,PHN2Zy8+',
      vi.fn(),
      'openrouter',
      'dermatology',
      'derm-example',
    )).rejects.toMatchObject({
      code: 'configuration',
      message: 'The teaching engine is not configured for this case.',
    });

    expect(mocks.streamChatResponse).not.toHaveBeenCalled();
    expect(engine.diagnostics()).toEqual({ activeTurns: 0 });
  });
});
