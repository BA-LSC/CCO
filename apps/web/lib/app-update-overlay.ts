/** Imperative overlay so update feedback shows even if React has not painted yet. */
export function showAppUpdateOverlay(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById("cco-app-update-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "cco-app-update-overlay";
  overlay.className = "app-update-overlay";
  overlay.setAttribute("role", "alert");
  overlay.setAttribute("aria-live", "assertive");
  overlay.innerHTML = `
    <div class="loading-screen loading-screen-page" aria-label="Updating CCO">
      <div class="loading-screen-content">
        <div class="spinner" aria-hidden="true"></div>
        <p class="loading-screen-label">Updating CCO…</p>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}
