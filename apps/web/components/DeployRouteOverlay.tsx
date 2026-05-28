"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { hideAppUpdateOverlay } from "@/lib/app-update-overlay";
import {
  isDeployPending,
  resumeAppUpdateUi,
  setDeployOverlaySuppressed,
} from "@/lib/app-update";

function isAdminSettingsPath(pathname: string): boolean {
  return pathname === "/settings/admin" || pathname.startsWith("/settings/admin/");
}

/** Show the full-screen update overlay on chat routes; inline UI only on Admin Settings. */
export function DeployRouteOverlay() {
  const pathname = usePathname();

  useEffect(() => {
    if (!isDeployPending()) return;

    const onAdmin = isAdminSettingsPath(pathname);
    setDeployOverlaySuppressed(onAdmin);
    if (onAdmin) {
      hideAppUpdateOverlay();
      return;
    }
    resumeAppUpdateUi();
  }, [pathname]);

  return null;
}
