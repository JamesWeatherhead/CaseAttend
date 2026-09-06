import { useCallback, useEffect, useRef, useState } from 'react';
import type { CasePackageV1 } from '../core/casePackage';
import { getCasePackage } from '../data/caseRegistry';
import { CASE_SESSION_EXIT_EVENT } from '../services/sessionRecorder';
import { CASE_ROUTE_CHANGED_EVENT, caseHash, currentRouteUrl, parseCaseRoute, routeHistoryState } from '../services/caseNavigation';

type RouteStatus = 'ready' | 'loading' | 'invalid' | 'missing' | 'error';

export function useCaseNavigation(setSelectedCase: (value: CasePackageV1 | null) => void) {
  const [status, setStatus] = useState<RouteStatus>('ready');
  const enabled = useRef(true);
  const mounted = useRef(false);
  const request = useRef(0);
  const appliedHash = useRef<string | null>(null);
  const backPending = useRef(false);
  // This ref owns ordinary cases only; participant packages never enter routing.
  const selected = useRef<CasePackageV1 | null>(null);
  const select = useCallback((value: CasePackageV1 | null) => {
    if (selected.current && selected.current !== value) {
      window.dispatchEvent(new Event(CASE_SESSION_EXIT_EVENT));
    }
    selected.current = value;
    setSelectedCase(value);
  }, [setSelectedCase]);

  const neutralize = useCallback(() => {
    window.history.replaceState(routeHistoryState(), '', currentRouteUrl(''));
    appliedHash.current = '';
  }, []);

  const applyLocation = useCallback(() => {
    backPending.current = false;
    if (!enabled.current) {
      neutralize();
      return;
    }
    const hash = window.location.hash;
    if (appliedHash.current === hash) return;
    appliedHash.current = hash;
    const generation = ++request.current;
    const route = parseCaseRoute(hash);
    select(null);
    if (route.kind === 'library') { setStatus('ready'); return; }
    if (route.kind === 'invalid') { setStatus('invalid'); return; }
    setStatus('loading');
    void getCasePackage(route.caseId).then(casePackage => {
      if (!mounted.current || !enabled.current || request.current !== generation) return;
      if (!casePackage) { setStatus('missing'); return; }
      select(casePackage);
      setStatus('ready');
    }).catch(() => {
      if (mounted.current && enabled.current && request.current === generation) setStatus('error');
    });
  }, [neutralize, select]);

  useEffect(() => {
    mounted.current = true;
    applyLocation();
    window.addEventListener('popstate', applyLocation);
    window.addEventListener('hashchange', applyLocation);
    window.addEventListener(CASE_ROUTE_CHANGED_EVENT, applyLocation);
    return () => {
      mounted.current = false;
      request.current += 1;
      appliedHash.current = null;
      window.removeEventListener('popstate', applyLocation);
      window.removeEventListener('hashchange', applyLocation);
      window.removeEventListener(CASE_ROUTE_CHANGED_EVENT, applyLocation);
    };
  }, [applyLocation]);

  const suspend = useCallback(() => {
    enabled.current = false;
    request.current += 1;
    select(null);
    setStatus('ready');
    neutralize();
  }, [neutralize, select]);

  const resume = useCallback(() => {
    request.current += 1;
    neutralize();
    enabled.current = true;
    select(null);
    setStatus('ready');
  }, [neutralize, select]);

  const open = useCallback((casePackage: CasePackageV1) => {
    enabled.current = true;
    request.current += 1;
    const hash = caseHash(casePackage.id);
    const fromLibrary = parseCaseRoute(window.location.hash).kind === 'library';
    if (window.location.hash !== hash) {
      window.history.pushState(routeHistoryState(fromLibrary), '', currentRouteUrl(hash));
    }
    appliedHash.current = hash;
    select(casePackage);
    setStatus('ready');
  }, [select]);

  const back = useCallback(() => {
    if (backPending.current) return;
    request.current += 1;
    const marker = window.history.state?.caseattendNavigation;
    if (marker?.fromLibrary === true && marker.path === window.location.pathname) {
      // Only app-created case entries can return to a known library entry.
      // Keep the current screen until the asynchronous traversal completes.
      backPending.current = true;
      window.history.back();
    } else {
      neutralize();
      select(null);
      setStatus('ready');
    }
  }, [neutralize, select]);

  const retry = useCallback(() => {
    appliedHash.current = null;
    applyLocation();
  }, [applyLocation]);

  return { status, open, back, retry, suspend, resume };
}
