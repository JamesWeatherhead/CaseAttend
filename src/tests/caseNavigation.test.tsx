// @vitest-environment jsdom
import React, { useState } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CasePackageV1 } from '../core/casePackage';
import { useCaseNavigation } from '../hooks/useCaseNavigation';
import { caseHash, caseLink, parseCaseRoute } from '../services/caseNavigation';
import { CASE_SESSION_EXIT_EVENT } from '../services/sessionRecorder';

const getCasePackage = vi.hoisted(() => vi.fn());
vi.mock('../data/caseRegistry', () => ({ getCasePackage }));
const a = { id: 'case-a' } as CasePackageV1;
const b = { id: 'case-b' } as CasePackageV1;
function harness() {
  const [selected, select] = useState<CasePackageV1 | null>(null);
  return { selected, navigation: useCaseNavigation(select) };
}
function navigate(hash: string) {
  act(() => {
    window.history.pushState({}, '', '/' + hash);
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}
function deferred() {
  let resolve!: (value: CasePackageV1 | null) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<CasePackageV1 | null>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('ordinary case navigation', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
    getCasePackage.mockReset().mockImplementation(async id => id === a.id ? a : id === b.id ? b : null);
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('accepts case identifiers and removes query parameters from share links', () => {
    expect(parseCaseRoute('#case/case-a')).toEqual({ kind: 'case', caseId: 'case-a' });
    expect(parseCaseRoute('#help')).toEqual({ kind: 'library' });
    for (const hash of ['#case/', '#case/%', '#case/../other', '#case/a%2Fb', '#case/a?code=value']) {
      expect(parseCaseRoute(hash)).toEqual({ kind: 'invalid' });
    }
    expect(caseLink('case-a', 'https://example.test/learn?code=secret&campaign=abc#old'))
      .toBe('https://example.test/learn#case/case-a');
    expect(() => caseHash('../case')).toThrow();
  });

  it('opens a direct link in StrictMode and returns to the library without leaving the site', async () => {
    window.history.replaceState({ unrelated: 42 }, '', '/#case/case-a');
    const back = vi.spyOn(window.history, 'back');
    const { result } = renderHook(harness, { wrapper: ({ children }) => <React.StrictMode>{children}</React.StrictMode> });
    await waitFor(() => expect(result.current.selected).toBe(a));
    act(() => result.current.navigation.back());
    expect(result.current.selected).toBeNull();
    expect(window.location.hash).toBe('');
    expect(back).not.toHaveBeenCalled();
    expect(window.history.state.unrelated).toBe(42);
  });

  it('supports browser Back and Forward with one resolution per destination', async () => {
    const { result } = renderHook(harness);
    act(() => result.current.navigation.open(a));
    expect(window.location.hash).toBe('#case/case-a');
    act(() => window.history.back());
    await waitFor(() => expect(result.current.selected).toBeNull());
    act(() => window.history.forward());
    await waitFor(() => expect(result.current.selected).toBe(a));
    expect(getCasePackage).toHaveBeenCalledTimes(1);
    act(() => result.current.navigation.back());
    await waitFor(() => expect(window.location.hash).toBe(''));
  });

  it('keeps the current case visible until in-app Back has actually traversed', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const { result } = renderHook(harness);
    act(() => result.current.navigation.open(a));
    act(() => { result.current.navigation.back(); result.current.navigation.back(); });
    expect(result.current.selected).toBe(a);
    expect(back).toHaveBeenCalledTimes(1);
    navigate('');
    expect(result.current.selected).toBeNull();
    act(() => result.current.navigation.open(b));
    expect(window.location.hash).toBe('#case/case-b');
  });

  it('ignores an earlier resolution when a newer case opens', async () => {
    const pending = deferred();
    getCasePackage.mockImplementation(id => id === a.id ? pending.promise : Promise.resolve(b));
    const { result } = renderHook(harness);
    navigate('#case/case-a');
    navigate('#case/case-b');
    await waitFor(() => expect(result.current.selected).toBe(b));
    await act(async () => pending.resolve(a));
    expect(result.current.selected).toBe(b);
    expect(getCasePackage).toHaveBeenCalledTimes(2);
  });

  it('invalidates pending work and ignores attempted routes throughout a protected workspace', async () => {
    const pending = deferred();
    getCasePackage.mockReturnValue(pending.promise);
    const { result } = renderHook(harness);
    navigate('#case/case-a');
    act(() => result.current.navigation.suspend());
    await act(async () => pending.resolve(a));
    navigate('#case/case-b');
    expect(result.current.selected).toBeNull();
    expect(window.location.hash).toBe('');
    expect(getCasePackage).toHaveBeenCalledTimes(1);
    act(() => result.current.navigation.resume());
    expect(result.current.selected).toBeNull();
    expect(result.current.navigation.status).toBe('ready');
  });

  it('keeps unavailable and invalid links distinct and can retry after a local case is imported', async () => {
    const { result } = renderHook(harness);
    navigate('#case/missing');
    await waitFor(() => expect(result.current.navigation.status).toBe('missing'));
    getCasePackage.mockResolvedValue(a);
    act(() => result.current.navigation.retry());
    await waitFor(() => expect(result.current.selected).toBe(a));
    navigate('#case/%');
    expect(result.current.navigation.status).toBe('invalid');
    expect(result.current.selected).toBeNull();
  });

  it('recovers from a failed registry read and notifies session exit only for owned ordinary cases', async () => {
    getCasePackage.mockRejectedValueOnce(new Error('storage unavailable'));
    const exit = vi.fn();
    window.addEventListener(CASE_SESSION_EXIT_EVENT, exit);
    const { result } = renderHook(harness);
    navigate('#case/case-a');
    await waitFor(() => expect(result.current.navigation.status).toBe('error'));
    act(() => result.current.navigation.retry());
    await waitFor(() => expect(result.current.selected).toBe(a));
    act(() => result.current.navigation.suspend());
    act(() => result.current.navigation.resume());
    expect(exit).toHaveBeenCalledTimes(1);
    window.removeEventListener(CASE_SESSION_EXIT_EVENT, exit);
  });
});
