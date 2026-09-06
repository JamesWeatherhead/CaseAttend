// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  beginOpenRouterOAuth,
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

  it('keeps the case return route in this browser and sends a clean callback to OpenRouter', async () => {
    const location = { origin: 'https://caseattend.example', pathname: '/learn', hash: '#case/fundus-normal', href: 'https://caseattend.example/learn?unrelated=1#case/fundus-normal' };
    vi.stubGlobal('window', { location });
    await beginOpenRouterOAuth();
    const authorization = new URL(location.href);
    expect(authorization.origin).toBe('https://openrouter.ai');
    expect(authorization.searchParams.get('callback_url')).toBe('https://caseattend.example/learn');
    expect(authorization.href).not.toContain('fundus-normal');
    expect(sessionStorage.getItem('caseattend_openrouter_return_case')).toBe('#case/fundus-normal');
    location.hash = '';
    await beginOpenRouterOAuth();
    expect(sessionStorage.getItem('caseattend_openrouter_return_case')).toBeNull();
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

  it('restores the ordinary case before a slow exchange and never replays it after navigation', async () => {
    const exchange = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn(() => exchange.promise));
    sessionStorage.setItem('caseattend_openrouter_return_case', '#case/fundus-normal');
    window.history.replaceState({ unrelated: 'preserved' }, '', '/learn?code=sentinel');
    const changed = vi.fn();
    window.addEventListener('caseattend:case-route-changed', changed);

    const completion = completeOpenRouterOAuth();
    expect(window.location.hash).toBe('#case/fundus-normal');
    expect(window.location.search).toBe('');
    expect(window.history.state).toMatchObject({ unrelated: 'preserved', caseattendNavigation: { fromLibrary: false } });
    expect(sessionStorage.getItem('caseattend_openrouter_return_case')).toBeNull();
    expect(changed).toHaveBeenCalledTimes(1);

    window.history.pushState({}, '', '/learn#case/another-case');
    exchange.resolve(new Response('', { status: 400 }));
    expect((await completion).ok).toBe(false);
    expect(window.location.hash).toBe('#case/another-case');
    expect(changed).toHaveBeenCalledTimes(1);
    window.removeEventListener('caseattend:case-route-changed', changed);
  });

  it.each(['https://example.test/', '#case/%', '#research/session', '#case/a?code=sentinel'])('discards an invalid saved return route: %s', async route => {
    sessionStorage.setItem('caseattend_openrouter_return_case', route);
    window.history.replaceState({ preserved: true }, '', '/learn?code=sentinel');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 400 })));
    await completeOpenRouterOAuth();
    expect(window.location.hash).toBe('');
    expect(window.history.state).toEqual({ preserved: true });
    expect(sessionStorage.getItem('caseattend_openrouter_return_case')).toBeNull();
  });

  it('preserves an existing case route and history marker while scrubbing the code', async () => {
    sessionStorage.setItem('caseattend_openrouter_return_case', '#case/old-case');
    const state = { caseattendNavigation: { fromLibrary: true, path: '/learn' }, extra: 1 };
    window.history.replaceState(state, '', '/learn?code=sentinel#case/current-case');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 400 })));
    await completeOpenRouterOAuth();
    expect(window.location.hash).toBe('#case/current-case');
    expect(window.history.state).toEqual(state);
    expect(sessionStorage.getItem('caseattend_openrouter_return_case')).toBeNull();
  });
});
