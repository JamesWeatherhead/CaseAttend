/**
 * BYOK (Bring Your Own Key) store.
 *
 * The visitor's OpenRouter key and chosen model live ONLY here, in their own
 * browser's localStorage. The key is sent straight from the browser to
 * https://openrouter.ai (browser-direct inference); it never touches our
 * servers, so we can't store, log, or leak it. Nothing in this module transmits
 * the key anywhere — it only hands it back to the caller (openrouterClient).
 *
 * Any mutation dispatches BYOK_CHANGED_EVENT on window so the UI (status bar,
 * input row, model label) updates live without prop-drilling.
 */

const KEY_STORAGE = 'caseattend_openrouter_key';
const MODEL_STORAGE = 'caseattend_openrouter_model';

// Default to a FREE, vision-capable model so a student with no OpenRouter credit
// can use CaseAttend at zero cost. The list below is PINNED (no free-text entry)
// so nobody can accidentally pick an extraordinarily expensive model.
export const DEFAULT_MODEL = 'google/gemma-4-26b-a4b-it:free';

// Curated, vision-capable presets — pinned for cost safety, free options first.
export interface ModelOption {
  id: string;
  label: string;
  note?: string;
}

export const MODEL_OPTIONS: ModelOption[] = [
  { id: 'google/gemma-4-26b-a4b-it:free', label: 'Gemma 4 (Free)', note: 'No credits needed · vision · fast' },
  { id: 'google/gemma-4-31b-it:free', label: 'Gemma 4 31B (Free)', note: 'No credits needed · vision · stronger' },
  { id: 'google/gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite', note: 'Very cheap · fast · vision' },
  { id: 'anthropic/claude-3-haiku', label: 'Claude 3 Haiku', note: 'Cheap · reliable · vision' },
];

// Fired on window whenever the key or model changes so UI can react.
export const BYOK_CHANGED_EVENT = 'caseattend:byok-changed';

function emitChange(): void {
  try {
    window.dispatchEvent(new Event(BYOK_CHANGED_EVENT));
  } catch {
    /* no window (SSR/tests) */
  }
}

export function getKey(): string | null {
  try {
    const k = localStorage.getItem(KEY_STORAGE);
    return k && k.length > 0 ? k : null;
  } catch {
    return null;
  }
}

export function hasKey(): boolean {
  return !!getKey();
}

export function setKey(key: string): void {
  try {
    localStorage.setItem(KEY_STORAGE, key.trim());
    emitChange();
  } catch {
    /* storage disabled/full — nothing we can safely do */
  }
}

export function clearKey(): void {
  try {
    localStorage.removeItem(KEY_STORAGE);
    emitChange();
  } catch {
    /* ignore */
  }
}

export function getModel(): string {
  try {
    return localStorage.getItem(MODEL_STORAGE) || DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}

export function setModel(model: string): void {
  const trimmed = model.trim();
  if (!trimmed) return;
  try {
    localStorage.setItem(MODEL_STORAGE, trimmed);
    emitChange();
  } catch {
    /* ignore */
  }
}

/** Human-friendly label for a model id (falls back to the raw id for custom entries). */
export function modelLabel(id: string): string {
  return MODEL_OPTIONS.find((m) => m.id === id)?.label || id;
}
