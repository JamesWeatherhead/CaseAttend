declare const __CASEATTEND_APP_VERSION__: string | undefined;

/** Build-time application version recorded in reproducibility events. */
export const APP_VERSION = typeof __CASEATTEND_APP_VERSION__ === 'string'
  ? __CASEATTEND_APP_VERSION__
  : '0.3.0';
