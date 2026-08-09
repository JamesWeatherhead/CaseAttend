// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { streamChatResponse } from '../services/aiClient';
import { setKey, setModel } from '../services/byokStore';
import { requireCasePackage } from '../data/caseRegistry';
import { requireLessonPlanForCase } from '../data/lessonRegistry';
import {
  fetchSystemPrompt,
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

  it('sends the exact frozen research routing policy and accepts only the locked route', async () => {
    setKey('sk-private');
    const fetchSpy = vi.fn(async (_url: string, init?: RequestInit) => new Response(JSON.stringify({
      model: 'research/vision-model',
      provider: 'research-provider',
      choices: [{ message: { content: 'Locked teaching response' }, finish_reason: 'stop' }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    await getOpenRouterResponse({
      message: 'Question',
      systemPrompt: 'Verified teaching prompt',
      imageBase64: null,
      mode: 'chat',
      model: 'ignored/by-locked-policy',
      lockedPolicy: {
        model: 'research/vision-model',
        upstreamProviderId: 'research-provider',
        temperature: 0.2,
        topP: 0.9,
        seed: 42,
        maxTokens: 2048,
        allowFallbacks: false,
        requireParameters: true,
        zeroDataRetention: true,
        dataCollection: 'deny',
      },
    });

    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      model: 'research/vision-model',
      messages: [
        { role: 'system', content: 'Verified teaching prompt' },
        { role: 'user', content: 'Question' },
      ],
      max_tokens: 2048,
      stream: false,
      temperature: 0.2,
      top_p: 0.9,
      seed: 42,
      provider: {
        only: ['research-provider'],
        order: ['research-provider'],
        allow_fallbacks: false,
        require_parameters: true,
        zdr: true,
        data_collection: 'deny',
      },
    });
  });

  it('discards a response outside the frozen research model or provider', async () => {
    setKey('sk-private');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      model: 'different/model',
      provider: 'different-provider',
      choices: [{ message: { content: 'Must not be accepted' }, finish_reason: 'stop' }],
    }), { status: 200 })));

    await expect(getOpenRouterResponse({
      message: 'Question',
      systemPrompt: 'Verified teaching prompt',
      imageBase64: null,
      mode: 'chat',
      model: 'research/vision-model',
      lockedPolicy: {
        model: 'research/vision-model',
        upstreamProviderId: 'research-provider',
        temperature: 0,
        topP: 1,
        maxTokens: 1024,
        allowFallbacks: false,
        requireParameters: true,
        zeroDataRetention: true,
        dataCollection: 'deny',
      },
    })).rejects.toMatchObject({
      code: 'protocol_deviation',
      retryable: false,
      deviation: {
        code: 'model_mismatch',
        expectedId: 'research/vision-model',
        observedId: 'different/model',
      },
    });
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

  it('ignores the mutable browser model when a frozen tutor runtime is supplied', async () => {
    setKey('sk-test-never-return');
    setModel('mutable/browser-model');
    const casePackage = await requireCasePackage('derm-bcc');
    const lessonPlan = await requireLessonPlanForCase(casePackage);
    const systemPrompt = await fetchSystemPrompt({
      modality: casePackage.domain,
      caseId: casePackage.id,
      learnerLevel: 'undergrad',
      mode: 'chat',
      hasImage: false,
      casePackage,
      lessonPlan,
    });
    let requestBody: Record<string, any> = {};
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        model: 'research/locked-model',
        provider: 'research-provider',
        choices: [{ message: { content: 'Frozen response' }, finish_reason: 'stop' }],
      }), { status: 200 });
    }));

    const result = await streamChatResponse(
      'What should I inspect?',
      'chat',
      'undergrad',
      null,
      vi.fn(),
      'openrouter',
      casePackage.domain,
      casePackage.id,
      undefined,
      undefined,
      {
        casePackage,
        lessonPlan,
        expectedSystemPromptSha256: await sha256Hex(systemPrompt),
        historyWindowMessages: 10,
        requestTemplateVersion: '1.0',
        openRouterPolicy: {
          model: 'research/locked-model',
          upstreamProviderId: 'research-provider',
          temperature: 0,
          topP: 1,
          maxTokens: 1024,
          allowFallbacks: false,
          requireParameters: true,
          zeroDataRetention: true,
          dataCollection: 'deny',
        },
      },
    );

    expect(requestBody.model).toBe('research/locked-model');
    expect(JSON.stringify(requestBody)).not.toContain('mutable/browser-model');
    expect(result).toMatchObject({
      model: 'research/locked-model',
      resolvedModelId: 'research/locked-model',
      upstreamProviderId: 'research-provider',
    });
  });

  it('fails before inference when the composed prompt differs from the frozen hash', async () => {
    setKey('sk-test-never-return');
    const casePackage = await requireCasePackage('derm-bcc');
    const lessonPlan = await requireLessonPlanForCase(casePackage);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(streamChatResponse(
      'What should I inspect?',
      'chat',
      'undergrad',
      null,
      vi.fn(),
      'openrouter',
      casePackage.domain,
      casePackage.id,
      undefined,
      undefined,
      {
        casePackage,
        lessonPlan,
        expectedSystemPromptSha256: '0'.repeat(64),
        historyWindowMessages: 10,
        requestTemplateVersion: '1.0',
        openRouterPolicy: {
          model: 'research/locked-model',
          upstreamProviderId: 'research-provider',
          temperature: 0,
          topP: 1,
          maxTokens: 1024,
          allowFallbacks: false,
          requireParameters: true,
          zeroDataRetention: true,
          dataCollection: 'deny',
        },
      },
    )).rejects.toMatchObject({ code: 'protocol_deviation' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
