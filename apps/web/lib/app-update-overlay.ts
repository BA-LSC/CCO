export const APP_UPDATE_OVERLAY_LABEL = "Updating CCO…";

const OVERLAY_LABEL_SELECTOR = ".loading-screen-label";

/** Critical overlay styles so the update screen renders before app CSS loads. */
export const APP_UPDATE_OVERLAY_STYLE_CSS = `
.app-update-overlay{position:fixed;inset:0;z-index:10000;display:flex;background:var(--color-bg,#111620)}
.app-update-overlay .loading-screen{flex:1;display:flex;align-items:center;justify-content:center;width:100%;min-height:100vh;background:var(--color-bg,#111620)}
.app-update-overlay .loading-screen-content{display:flex;flex-direction:column;align-items:center;gap:24px}
.app-update-overlay .spinner{width:64px;height:64px;margin:0;border:5px solid var(--color-border,#2a3344);border-top-color:var(--color-primary,#5b8def);border-radius:50%;animation:cco-app-update-spin .7s linear infinite}
.app-update-overlay .loading-screen-label{margin:0;font-size:1.5rem;font-weight:600;color:var(--color-muted,#9aa3b2);letter-spacing:.03em}
@keyframes cco-app-update-spin{to{transform:rotate(360deg)}}
`.trim();

export const APP_UPDATE_OVERLAY_INNER_HTML = `
<div class="loading-screen loading-screen-page" aria-label="Updating CCO">
  <div class="loading-screen-content">
    <div class="spinner" aria-hidden="true"></div>
    <p class="loading-screen-label">${APP_UPDATE_OVERLAY_LABEL}</p>
  </div>
</div>
`.trim();

const OVERLAY_ID = "cco-app-update-overlay";
const OVERLAY_STYLE_ID = "cco-app-update-overlay-style";

function ensureOverlayStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(OVERLAY_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = OVERLAY_STYLE_ID;
  style.textContent = APP_UPDATE_OVERLAY_STYLE_CSS;
  document.head.appendChild(style);
}

/** Imperative overlay so update feedback shows even if React has not painted yet. */
export function showAppUpdateOverlay(): void {
  if (typeof document === "undefined") return;

  ensureOverlayStyles();

  let overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.className = "app-update-overlay";
    overlay.setAttribute("role", "alert");
    overlay.setAttribute("aria-live", "assertive");
    overlay.innerHTML = APP_UPDATE_OVERLAY_INNER_HTML;
    (document.body ?? document.documentElement).appendChild(overlay);
    return;
  }

  overlay.className = "app-update-overlay";
  overlay.hidden = false;
}

export function hideAppUpdateOverlay(): void {
  if (typeof document === "undefined") return;
  document.getElementById(OVERLAY_ID)?.remove();
}

/** Update the status line under the spinner while a deploy is in progress. */
export function setAppUpdateOverlayLabel(message: string): void {
  if (typeof document === "undefined") return;
  showAppUpdateOverlay();
  const label = document.querySelector(`#${OVERLAY_ID} ${OVERLAY_LABEL_SELECTOR}`);
  if (label) label.textContent = message;
}
