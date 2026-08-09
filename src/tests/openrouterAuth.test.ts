// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  completeOpenRouterOAuth,
  pendingOAuthCode,
} from '../services/openrouterAuth';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('OpenRouter OAuth credential boundary', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/learn');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('scrubs the authorization code before the exchange can settle', async () => {
    const exchange = deferred<Response>();
    const fetchSpy = vi.fn(() => exchange.promise);
    vi.stubGlobal('fetch', fetchSpy);
    window.history.replaceState({}, '', '/learn?keep=1&code=oauth-code-sentinel#case');

    const completion = completeOpenRouterOAuth();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(pendingOAuthCode()).toBeNull();
    expect(window.location.pathname).toBe('/learn');
    expect(window.location.search).toBe('?keep=1');
    expect(window.location.hash).toBe('#case');
    expect(window.location.href).not.toContain('oauth-code-sentinel');

    exchange.resolve(new Response(JSON.stringify({ key: 'sk-browser-only-result' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    await expect(completion).resolves.toEqual({ ok: true });
    expect(localStorage.getItem('caseattend_openrouter_key')).toBe('sk-browser-only-result');
  });

  it('never reads or displays a failed provider response body', async () => {
    const providerBody = 'oauth-code-sentinel sk-provider-body-secret internal-debug-detail';
    const response = new Response(providerBody, { status: 400 });
    const textSpy = vi.spyOn(response, 'text');
    const jsonSpy = vi.spyOn(response, 'json');
    vi.stubGlobal('fetch', vi.fn(async () => response));
    window.history.replaceState({}, '', '/learn?code=oauth-code-sentinel');

    const result = await completeOpenRouterOAuth();

    expect(result).toEqual({
      ok: false,
      error: 'OpenRouter sign-in failed (400). Please try connecting again.',
    });
    expect(JSON.stringify(result)).not.toContain(providerBody);
    expect(JSON.stringify(result)).not.toContain('oauth-code-sentinel');
    expect(JSON.stringify(result)).not.toContain('sk-provider-body-secret');
    expect(textSpy).not.toHaveBeenCalled();
    expect(jsonSpy).not.toHaveBeenCalled();
    expect(window.location.href).not.toContain('oauth-code-sentinel');
  });

  it('does not start an exchange when the callback has no code', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    window.history.replaceState({}, '', '/learn?keep=1');

    await expect(completeOpenRouterOAuth()).resolves.toEqual({
      ok: false,
      error: 'No authorization code in URL.',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(window.location.search).toBe('?keep=1');
  });
});
