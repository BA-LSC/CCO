export const FOCUS_COMPOSER_EVENT = "cco:focus-composer";

export function requestComposerFocus(): void {
  window.dispatchEvent(new CustomEvent(FOCUS_COMPOSER_EVENT));
}

export function subscribeComposerFocusRequest(handler: () => void): () => void {
  window.addEventListener(FOCUS_COMPOSER_EVENT, handler);
  return () => window.removeEventListener(FOCUS_COMPOSER_EVENT, handler);
}
