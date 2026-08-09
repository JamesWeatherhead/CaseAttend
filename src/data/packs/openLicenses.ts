import type { CaseLicense } from '../../core/casePackage';

/**
 * Shared license deeds for the built-in open-content packs. The per-item license
 * evidence URL (the Commons "#Licensing" anchor) is recorded separately on each
 * case; these constants describe the reuse terms the item page asserts.
 */

export const CC0: CaseLicense = {
  name: 'CC0 1.0 Universal',
  spdxId: 'CC0-1.0',
  url: 'https://creativecommons.org/publicdomain/zero/1.0/',
};

/** Author dedication to the public domain (Wikimedia "PD-self"). */
export const PD_SELF: CaseLicense = {
  name: 'Public domain (author dedication, PD-self)',
  url: 'https://creativecommons.org/publicdomain/mark/1.0/',
};

/** Work of the U.S. federal government (CDC, NIH, NCI), public domain. */
export const PD_USGOV: CaseLicense = {
  name: 'Public domain (U.S. federal government work)',
  url: 'https://www.usa.gov/government-works',
};
