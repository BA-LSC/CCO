export const ADMIN_UPDATE_STATUS_EVENT = "cco:admin-update-status";
export const ADMIN_UPDATE_AVAILABLE_STORAGE_KEY = "cco:admin-update-available";

export type AdminUpdateStatusDetail = {
  updateAvailable: boolean;
};

export function readCachedAdminUpdateAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(ADMIN_UPDATE_AVAILABLE_STORAGE_KEY) === "1";
}

export function writeCachedAdminUpdateAvailable(updateAvailable: boolean): void {
  if (typeof window === "undefined") return;
  if (updateAvailable) {
    window.sessionStorage.setItem(ADMIN_UPDATE_AVAILABLE_STORAGE_KEY, "1");
  } else {
    window.sessionStorage.removeItem(ADMIN_UPDATE_AVAILABLE_STORAGE_KEY);
  }
}

export function dispatchAdminUpdateStatus(detail: AdminUpdateStatusDetail): void {
  writeCachedAdminUpdateAvailable(detail.updateAvailable);
  window.dispatchEvent(
    new CustomEvent<AdminUpdateStatusDetail>(ADMIN_UPDATE_STATUS_EVENT, { detail }),
  );
}

export function subscribeAdminUpdateStatus(
  handler: (detail: AdminUpdateStatusDetail) => void,
): () => void {
  const listener = (event: Event) => {
    const custom = event as CustomEvent<AdminUpdateStatusDetail>;
    handler(custom.detail);
  };
  window.addEventListener(ADMIN_UPDATE_STATUS_EVENT, listener);
  return () => window.removeEventListener(ADMIN_UPDATE_STATUS_EVENT, listener);
}
