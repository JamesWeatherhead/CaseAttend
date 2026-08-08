
import { Study, Series, DicomWebConfig, DiagnosticStep } from "../types";
import { LOCAL_STUDY, LOCAL_SERIES } from "../data/localData";
import { PATHOLOGY_STUDY, PATHOLOGY_SERIES, PATHOLOGY_STUDY_ID } from "../data/pathologyData";
import { CXR_STUDIES, CXR_SERIES_MAP, CXR_STUDY_IDS } from "../data/cxrData";
import { DERM_STUDIES, DERM_SERIES_MAP, DERM_STUDY_IDS } from "../data/dermatologyData";

/**
 * FETCH STUDIES
 * Returns studies for the selected modality.
 */
export const searchDicomWebStudies = async (config: DicomWebConfig, query?: string): Promise<Study[]> => {
  return [LOCAL_STUDY, PATHOLOGY_STUDY, ...CXR_STUDIES, ...DERM_STUDIES];
};

/**
 * FETCH SERIES
 * Returns series for the given study.
 */
export const fetchDicomWebSeries = async (config: DicomWebConfig, studyUid: string): Promise<Series[]> => {
  if (studyUid === PATHOLOGY_STUDY_ID) {
    return PATHOLOGY_SERIES;
  }
  if (CXR_STUDY_IDS.includes(studyUid)) {
    return CXR_SERIES_MAP[studyUid] || [];
  }
  if (DERM_STUDY_IDS.includes(studyUid)) {
    return DERM_SERIES_MAP[studyUid] || [];
  }
  return LOCAL_SERIES;
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
  config: DicomWebConfig, 
  onStepUpdate: (stepId: string, status: DiagnosticStep['status'], message?: string) => void
): Promise<boolean> => {
  
  onStepUpdate('1-local-check', 'RUNNING');
  
  try {
    // Check if we can load the first image of the first series
    if (!LOCAL_SERIES.length || !LOCAL_SERIES[0].instances.length) {
         throw new Error("No series configured in data/localData.ts.");
    }

    const testUrl = LOCAL_SERIES[0].instances[0];
    const response = await fetch(testUrl);
    
    if (response.ok) {
       onStepUpdate('1-local-check', 'PASS', `Assets verified at ${testUrl}`);
       return true;
    } else {
       throw new Error(`HTTP ${response.status} fetching ${testUrl}`);
    }
  } catch (e: any) {
    onStepUpdate('1-local-check', 'FAIL', `Assets missing. Check URL in data/localData.ts. Error: ${e.message}`);
    return false;
  }
};
