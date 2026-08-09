declare const __CASEATTEND_APP_VERSION__: string | undefined;
declare const __CASEATTEND_BUILD_REVISION__: string | undefined;
declare const __CASEATTEND_SOURCE_TREE_URL__: string | undefined;

/** Build-time application version recorded in reproducibility events. */
export const APP_VERSION = typeof __CASEATTEND_APP_VERSION__ === 'string'
  ? __CASEATTEND_APP_VERSION__
  : '0.4.0';

/** Exact source revision used for frozen research manifests. */
export const BUILD_REVISION = typeof __CASEATTEND_BUILD_REVISION__ === 'string'
  ? __CASEATTEND_BUILD_REVISION__
  : 'development';

/** Revision-specific public source link recorded in support packets. */
export const SOURCE_TREE_URL = typeof __CASEATTEND_SOURCE_TREE_URL__ === 'string'
  ? __CASEATTEND_SOURCE_TREE_URL__
  : 'https://github.com/JamesWeatherhead/CaseAttend/tree/main';

export const HAS_REPRODUCIBLE_BUILD_REVISION = BUILD_REVISION !== 'development';
