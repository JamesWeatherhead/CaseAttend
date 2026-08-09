
import type { CasePackageV1 } from '../core/casePackage';
import {
  casePackageToSeries,
  listCasePackages,
  requireCasePackage,
} from '../data/caseRegistry';
import type { Series, DicomWebConfig, DiagnosticStep } from '../types';
import { casePackageStore } from './casePackageStore';

/**
 * FETCH STUDIES
 * Returns studies for the selected modality.
 */
export const searchDicomWebStudies = async (
  _config: DicomWebConfig,
  query?: string,
): Promise<readonly CasePackageV1[]> => {
  const packages = await listCasePackages();
  const normalizedQuery = query?.trim().toLowerCase();
  if (!normalizedQuery) return packages;
  return packages.filter((casePackage) =>
    `${casePackage.title} ${casePackage.vignette} ${casePackage.presentation.subtitle}`
      .toLowerCase()
      .includes(normalizedQuery),
  );
};

/**
 * FETCH SERIES
 * Returns series for the given study.
 */
export const fetchDicomWebSeries = async (
  _config: DicomWebConfig,
  studyUid: string,
): Promise<Series[]> => {
  const casePackage = await requireCasePackage(studyUid);
  return casePackageToSeries(casePackage);
};

// IN-MEMORY CACHE
// Stores the Blob data for images we've already downloaded.
// This prevents re-fetching from the network when scrolling back and forth.
const imageCache = new Map<string, Blob>();
const pendingRequests = new Map<string, Promise<Blob>>();

/**
 * FETCH IMAGE BLOB
 * Fetches the PNG file from the public folder or remote URL.
 * Includes Caching and Request Deduplication.
 */
export const fetchDicomImageBlob = async (config: DicomWebConfig, url: string): Promise<Blob> => {
  // 1. Check Cache
  if (imageCache.has(url)) {
    return imageCache.get(url)!;
  }

  // 2. Check Pending Requests (Deduplication)
  // If we are already fetching this URL (e.g. from a prefetch), return that promise
  if (pendingRequests.has(url)) {
    return pendingRequests.get(url)!;
  }

  // 3. Perform Fetch
  const fetchPromise = (async () => {
    try {
      if (url.startsWith('case://assets/')) {
        const blob = await casePackageStore.getAssetBlob(url);
        imageCache.set(url, blob);
        return blob;
      }
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Status: ${response.status} (${response.statusText})`);
      }
      const blob = await response.blob();
      
      // Store in cache
      imageCache.set(url, blob);
      return blob;
    } catch (e: any) {
      console.error(`Failed to load asset: ${url}`, e);
      throw new Error(`Could not load image: ${url}`);
    } finally {
      // Clean up pending request map
      pendingRequests.delete(url);
    }
  })();

  pendingRequests.set(url, fetchPromise);
  return fetchPromise;
};

/**
 * PREFETCH HELPER
 * Fire-and-forget method to load images into the cache in the background.
 */
export const prefetchImage = (url: string) => {
    if (!imageCache.has(url) && !pendingRequests.has(url)) {
        // We trigger the fetch but catch errors silently so they don't disrupt the main thread
        fetchDicomImageBlob({ url: '', name: '' }, url).catch(() => {});
    }
};

/**
 * CONNECTION DIAGNOSTICS
 * Check if the assets are accessible.
 */
export const runConnectionDiagnostics = async (
  _config: DicomWebConfig,
  onStepUpdate: (stepId: string, status: DiagnosticStep['status'], message?: string) => void
): Promise<boolean> => {
  
  onStepUpdate('1-local-check', 'RUNNING');
  
  try {
    const firstCase = (await listCasePackages())[0];
    if (!firstCase) throw new Error('The Case Package registry is empty.');
    const firstSeries = casePackageToSeries(firstCase)[0];
    const testUrl = firstSeries?.instances[0];
    if (!testUrl) throw new Error(`Case Package ${firstCase.id} has no viewer artifact.`);
    const response = await fetch(testUrl);
    
    if (response.ok) {
       onStepUpdate('1-local-check', 'PASS', `Assets verified at ${testUrl}`);
       return true;
    } else {
       throw new Error(`HTTP ${response.status} fetching ${testUrl}`);
    }
  } catch (e: any) {
    onStepUpdate('1-local-check', 'FAIL', `Built-in Case Package asset check failed. Error: ${e.message}`);
    return false;
  }
};
