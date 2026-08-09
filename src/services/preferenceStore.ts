export const PREFERENCE_KEYS = {
  guidedTourCompleted: 'caseattend.guidedTour.completed',
  learnerLevel: 'caseattend_learner_level',
  provider: 'caseattend_provider',
} as const;

export type PreferenceKey = typeof PREFERENCE_KEYS[keyof typeof PREFERENCE_KEYS];

/**
 * Best-effort storage for non-sensitive interface preferences. Hardened
 * browsers and sandboxed embeds can throw even when localStorage exists, so a
 * preference must never be able to prevent CaseAttend from rendering.
 */
export function getPreference(key: PreferenceKey): string | null {
  try {
    return globalThis.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setPreference(key: PreferenceKey, value: string): boolean {
  try {
    globalThis.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removePreference(key: PreferenceKey): boolean {
  try {
    globalThis.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
