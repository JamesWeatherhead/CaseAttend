// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { streamChatResponse } from '../services/aiClient';
import { setKey, setModel } from '../services/byokStore';
import {
  getOpenRouterResponse,
  SafeInferenceError,
} from '../services/openrouterClient';

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

describe('safe browser-direct inference metadata', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('returns only normalized provider metadata beside the chunks', async () => {
    const apiKey = 'sk-test-never-return';
    setKey(apiKey);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      id: 'raw-provider-id',
      model: 'provider/rewritten-model',
      provider: 'provider-upstream',
      choices: [{
        message: { content: 'A concise teaching response.' },
        finish_reason: 'stop',
        provider_private: 'do-not-return',
      }],
      usage: {
        prompt_tokens: 21,
        completion_tokens: 5,
        total_tokens: 26,
        cost: 999,
      },
      raw_private: 'do-not-return',
    }), { status: 200 })));

    const result = await getOpenRouterResponse({
      message: 'Question',
      systemPrompt: 'Verified teaching prompt',
      imageBase64: null,
      mode: 'chat',
      model: 'test/vision-model',
    });

    expect(result.chunks.at(-1)).toEqual({ done: true });
    expect(result.metadata).toMatchObject({
      provider: 'openrouter',
      model: 'test/vision-model',
      resolvedModelId: 'provider/rewritten-model',
      upstreamProviderId: 'provider-upstream',
      finishReason: 'stop',
      usage: { promptTokens: 21, completionTokens: 5, totalTokens: 26 },
    });
    expect(result.metadata.latencyMs).toEqual(expect.any(Number));
    expect(Object.keys(result.metadata).sort()).toEqual([
      'finishReason',
      'latencyMs',
      'model',
      'provider',
      'resolvedModelId',
      'upstreamProviderId',
      'usage',
    ]);
    expect(JSON.stringify(result.metadata)).not.toContain(apiKey);
    expect(JSON.stringify(result.metadata)).not.toContain('raw-provider-id');
    expect(JSON.stringify(result.metadata)).not.toContain('do-not-return');
  });

  it('drops URL-shaped model and provider identifiers from safe metadata', async () => {
    setKey('sk-private');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      model: 'https://provider.example/model',
      provider: 'provider://private-route',
      choices: [{ message: { content: 'Teaching response' }, finish_reason: 'stop' }],
    }), { status: 200 })));

    const result = await getOpenRouterResponse({
      message: 'Question',
      systemPrompt: 'Verified teaching prompt',
      imageBase64: null,
      mode: 'chat',
      model: 'https://models.example/requested',
    });

    expect(result.metadata.model).toBe('unknown');
    expect(result.metadata).not.toHaveProperty('resolvedModelId');
    expect(result.metadata).not.toHaveProperty('upstreamProviderId');
  });

  it('uses typed curated errors without reading or exposing provider bodies', async () => {
    setKey('sk-private');
    const response = new Response('provider-private-detail', { status: 403 });
    const textSpy = vi.spyOn(response, 'text');
    vi.stubGlobal('fetch', vi.fn(async () => response));

    let caught: unknown;
    try {
      await getOpenRouterResponse({
        message: 'Question',
        systemPrompt: 'Prompt',
        imageBase64: null,
        mode: 'chat',
        model: 'test/model',
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(SafeInferenceError);
    expect(caught).toMatchObject({ code: 'forbidden', httpStatus: 403, retryable: false });
    expect((caught as Error).message).toBe('This model is not available to your key (403). Try a Free model in Connect.');
    expect((caught as Error).message).not.toContain('provider-private-detail');
    expect(textSpy).not.toHaveBeenCalled();
  });

  it('threads caller cancellation into fetch as a typed safe error', async () => {
    setKey('sk-private');
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      return new Response();
    }));

    await expect(getOpenRouterResponse({
      message: 'Question',
      systemPrompt: 'Prompt',
      imageBase64: null,
      mode: 'chat',
      model: 'test/model',
      signal: controller.signal,
    })).rejects.toMatchObject({
      code: 'request_aborted',
      retryable: true,
      message: 'AI request cancelled.',
    });
  });

  it('returns the SHA-256 of the exact verified provider prompt from aiClient', async () => {
    setKey('sk-test-never-return');
    setModel('test/vision-model');
    let promptSent = '';
    const onChunk = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      const requestBody = JSON.parse(String(init?.body));
      promptSent = requestBody.messages[0].content;
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'Teaching response' }, finish_reason: 'length' }],
        model: 'resolved/vision-model',
        provider: 'upstream-provider',
        usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
      }), { status: 200 });
    }));

    const result = await streamChatResponse(
      'What should I inspect?',
      'chat',
      'undergrad',
      null,
      onChunk,
      'openrouter',
      'dermatology',
      'derm-bcc',
    );

    expect(promptSent).toContain('FIXED PUBLIC SAFETY POLICY');
    expect(result.promptSha256).toBe(await sha256Hex(promptSent));
    expect(result).toMatchObject({
      provider: 'openrouter',
      model: 'test/vision-model',
      resolvedModelId: 'resolved/vision-model',
      upstreamProviderId: 'upstream-provider',
      finishReason: 'length',
      usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 },
    });
    expect(Object.keys(result).sort()).toEqual([
      'finishReason',
      'latencyMs',
      'model',
      'promptSha256',
      'provider',
      'resolvedModelId',
      'upstreamProviderId',
      'usage',
    ]);
    expect(JSON.stringify(result)).not.toContain('sk-test-never-return');
    expect(JSON.stringify(result)).not.toContain('Teaching response');
    expect(onChunk).toHaveBeenCalledWith('Teaching response');
  });
});
