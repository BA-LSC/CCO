"use client";

import { usePathname } from "next/navigation";
import { usePwaSidebarSwipe } from "@/hooks/usePwaSidebarSwipe";
import { isPwaSidebarSwipeEnabled } from "@/lib/pwa-sidebar-swipe";

function hideSidebarForPath(pathname: string): boolean {
  return pathname.startsWith("/settings");
}

export function PwaSidebarSwipe() {
  const pathname = usePathname();
  const enabled = isPwaSidebarSwipeEnabled() && !hideSidebarForPath(pathname);
  usePwaSidebarSwipe(enabled);
  return null;
}
