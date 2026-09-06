/**
 * OpenRouter OAuth (PKCE) — the "Connect with OpenRouter" SSO.
 *
 * Flow:
 *  1. beginOpenRouterOAuth(): mint a PKCE verifier + S256 challenge, stash the
 *     verifier in sessionStorage, then full-page redirect to openrouter.ai/auth.
 *  2. The user approves on OpenRouter and is redirected back with ?code=...
 *  3. completeOpenRouterOAuth(): exchange {code, code_verifier} for an API key at
 *     openrouter.ai/api/v1/auth/keys, store it via byokStore, and scrub the URL.
 *
 * The minted key is scoped to this app by OpenRouter and lives only in the
 * user's browser. It is only ever sent to OpenRouter: once here to mint it, and
 * thereafter straight from the browser to openrouter.ai for inference. It never
 * touches our servers, so we cannot store, log, or leak it.
 */

import { setKey } from './byokStore';
import { CASE_ROUTE_CHANGED_EVENT, parseCaseRoute, routeHistoryState } from './caseNavigation';

const VERIFIER_STORAGE = 'caseattend_openrouter_verifier';
const RETURN_CASE_STORAGE = 'caseattend_openrouter_return_case';
const AUTH_URL = 'https://openrouter.ai/auth';
const KEYS_URL = 'https://openrouter.ai/api/v1/auth/keys';

function base64UrlEncode(bytes: Uint8Array): string {
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomVerifier(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return base64UrlEncode(arr);
}

async function challengeFromVerifier(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

// Return to the exact page the user launched from; OpenRouter appends ?code=...
function callbackUrl(): string {
  return window.location.origin + window.location.pathname;
}

/** Kick off the OAuth redirect. Resolves as the browser navigates away. */
export async function beginOpenRouterOAuth(): Promise<void> {
  const returnHash = window.location.hash;
  const verifier = randomVerifier();
  const challenge = await challengeFromVerifier(verifier);
  try {
    sessionStorage.setItem(VERIFIER_STORAGE, verifier);
    if (parseCaseRoute(returnHash).kind === 'case') sessionStorage.setItem(RETURN_CASE_STORAGE, returnHash);
    else sessionStorage.removeItem(RETURN_CASE_STORAGE);
  } catch {
    /* sessionStorage disabled — exchange may still succeed without verifier */
  }

  const params = new URLSearchParams({
    callback_url: callbackUrl(),
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  window.location.href = `${AUTH_URL}?${params.toString()}`;
}

/** Is there an OAuth ?code=... waiting in the URL from a redirect back? */
export function pendingOAuthCode(): string | null {
  try {
    return new URLSearchParams(window.location.search).get('code');
  } catch {
    return null;
  }
}

// Remove ?code= from the URL so a refresh doesn't try to re-exchange it.
function scrubUrl(): void {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('code');
    window.history.replaceState(window.history.state, document.title, url.pathname + url.search + url.hash);
  } catch {
    /* ignore */
  }
}

/**
 * Complete the exchange after redirect. Stores the key on success and always
 * scrubs the ?code from the URL. Returns a friendly outcome for the UI.
 */
export async function completeOpenRouterOAuth(): Promise<{ ok: boolean; error?: string }> {
  const code = pendingOAuthCode();
  if (!code) return { ok: false, error: 'No authorization code in URL.' };

  // The authorization code is a short-lived credential. Remove it before the
  // first await so a slow or failed exchange cannot leave it in the address
  // bar, browser history, screenshots, or a later navigation's referrer.
  scrubUrl();

  // Restore locally, before the exchange awaits. A slow response must never
  // reopen the old case after the learner has moved elsewhere. The case route
  // is not sent to the provider and cannot redirect to another origin.
  try {
    const returnHash = sessionStorage.getItem(RETURN_CASE_STORAGE);
    sessionStorage.removeItem(RETURN_CASE_STORAGE);
    if (!window.location.hash && returnHash && parseCaseRoute(returnHash).kind === 'case') {
      window.history.replaceState(routeHistoryState(), '', window.location.pathname + window.location.search + returnHash);
      window.dispatchEvent(new Event(CASE_ROUTE_CHANGED_EVENT));
    }
  } catch {
    /* Browser storage can be unavailable; connecting must remain usable. */
  }

  let verifier: string | null = null;
  try {
    verifier = sessionStorage.getItem(VERIFIER_STORAGE);
    sessionStorage.removeItem(VERIFIER_STORAGE);
  } catch {
    /* ignore */
  }

  try {
    const res = await fetch(KEYS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        code_verifier: verifier || undefined,
        code_challenge_method: 'S256',
      }),
    });

    if (!res.ok) {
      return {
        ok: false,
        // Provider bodies can echo authorization material or internal details.
        // Status alone selects a bounded, display-safe outcome.
        error: `OpenRouter sign-in failed (${res.status}). Please try connecting again.`,
      };
    }

    const data = await res.json().catch(() => null);
    const key = data?.key;
    if (!key || typeof key !== 'string') {
      return { ok: false, error: 'OpenRouter did not return a key. Please try connecting again.' };
    }

    setKey(key);
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not reach OpenRouter to finish sign-in. Check your connection and retry.' };
  }
}
