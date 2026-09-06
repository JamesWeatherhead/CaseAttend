import { IntroCacheAuthoringError, type IntroCacheGenerationRequest } from './introCacheAuthoring';

export async function generateIntroCacheLazily(request: IntroCacheGenerationRequest) {
  request.signal?.throwIfAborted();
  const { generateAuthoredIntroCacheWithOpenRouter } = await import('./openrouterClient').catch(() => {
    request.signal?.throwIfAborted();
    throw new IntroCacheAuthoringError({
      code: 'provider_error',
      message: 'The answer-generation tools could not be loaded. Save or export your case, check your connection, and reload the page before generating answers again.',
      retryable: false,
    });
  });
  // Leaving the editor may cancel while the provider code is downloading.
  request.signal?.throwIfAborted();
  return generateAuthoredIntroCacheWithOpenRouter(request);
}
