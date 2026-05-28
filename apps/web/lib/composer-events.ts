export const FOCUS_COMPOSER_EVENT = "cco:focus-composer";

const FOCUS_RETRY_MS = [0, 50, 150, 350, 600];

export function requestComposerFocus(): void {
  for (const delay of FOCUS_RETRY_MS) {
    if (delay === 0) {
      window.dispatchEvent(new CustomEvent(FOCUS_COMPOSER_EVENT));
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent(FOCUS_COMPOSER_EVENT));
      });
      continue;
    }
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent(FOCUS_COMPOSER_EVENT));
    }, delay);
  }
}

export function subscribeComposerFocusRequest(handler: () => void): () => void {
  window.addEventListener(FOCUS_COMPOSER_EVENT, handler);
  return () => window.removeEventListener(FOCUS_COMPOSER_EVENT, handler);
}
