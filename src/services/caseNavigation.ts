export type CaseRoute = { kind: 'library' } | { kind: 'case'; caseId: string } | { kind: 'invalid' };
const CASE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const CASE_ROUTE_CHANGED_EVENT = 'caseattend:case-route-changed';

export function parseCaseRoute(hash: string): CaseRoute {
  if (!hash.startsWith('#case/')) return { kind: 'library' };
  try {
    const caseId = decodeURIComponent(hash.slice('#case/'.length));
    return CASE_ID.test(caseId) ? { kind: 'case', caseId } : { kind: 'invalid' };
  } catch {
    return { kind: 'invalid' };
  }
}

export function caseHash(caseId: string): string {
  if (!CASE_ID.test(caseId)) throw new Error('Invalid case identifier.');
  return `#case/${caseId}`;
}

/** Share the case route without unrelated query parameters or credentials. */
export function caseLink(caseId: string, currentUrl: string): string {
  const url = new URL(currentUrl);
  return `${url.origin}${url.pathname}${caseHash(caseId)}`;
}

export function currentRouteUrl(hash: string): string {
  const url = new URL(window.location.href);
  url.searchParams.delete('code');
  return url.pathname + url.search + hash;
}

export function routeHistoryState(fromLibrary = false) {
  const state = window.history.state;
  return {
    ...(state && typeof state === 'object' ? state : {}),
    caseattendNavigation: { fromLibrary, path: window.location.pathname },
  };
}
