import { describe, expect, it, vi } from 'vitest';
import { generateIntroCacheLazily } from '../services/deferredIntroCacheGeneration';
import type { IntroCacheGenerationRequest } from '../services/introCacheAuthoring';

const mocks = vi.hoisted(() => {
  let finishImport!: () => void;
  let markStarted!: () => void;
  return {
    importGate: new Promise<void>(resolve => { finishImport = resolve; }),
    importStarted: new Promise<void>(resolve => { markStarted = resolve; }),
    finishImport: () => finishImport(),
    markStarted: () => markStarted(),
    generate: vi.fn(async () => ({ id: 'synthetic-cache' })),
  };
});
vi.mock('../services/openrouterClient', async () => {
  mocks.markStarted();
  await mocks.importGate;
  return { generateAuthoredIntroCacheWithOpenRouter: mocks.generate };
});

describe('deferred authoring generation', () => {
  it('makes no provider call after cancellation during loading, and forwards an active request unchanged', async () => {
    const cancelled = new AbortController();
    cancelled.abort();
    await expect(generateIntroCacheLazily({ signal: cancelled.signal } as IntroCacheGenerationRequest)).rejects.toMatchObject({ name: 'AbortError' });
    const controller = new AbortController();
    const work = generateIntroCacheLazily({ signal: controller.signal } as IntroCacheGenerationRequest);
    const rejected = expect(work).rejects.toMatchObject({ name: 'AbortError' });
    await mocks.importStarted;
    controller.abort();
    mocks.finishImport();
    await rejected;
    expect(mocks.generate).not.toHaveBeenCalled();
    const request = { signal: new AbortController().signal } as IntroCacheGenerationRequest;
    await generateIntroCacheLazily(request);
    expect(mocks.generate).toHaveBeenCalledExactlyOnceWith(request);
  });

  it('gives safe reload guidance when the module download fails', async () => {
    vi.resetModules();
    vi.doMock('../services/openrouterClient', () => { throw new Error('Failed import: internal module URL'); });
    const { generateIntroCacheLazily: generate } = await import('../services/deferredIntroCacheGeneration');
    await expect(generate({} as IntroCacheGenerationRequest)).rejects.toMatchObject({
      code: 'provider_error',
      retryable: false,
      message: 'The answer-generation tools could not be loaded. Save or export your case, check your connection, and reload the page before generating answers again.',
    });
  });
});
