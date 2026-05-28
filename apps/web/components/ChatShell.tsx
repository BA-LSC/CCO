"use client";

import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { ChatLayoutProvider } from "@/components/ChatLayoutContext";
import { ChatSidebar } from "@/components/ChatSidebar";
import { AppUnreadSync } from "@/components/AppUnreadSync";
import { AddToHomeScreenBanner } from "@/components/AddToHomeScreenBanner";
import { DeployRouteOverlay } from "@/components/DeployRouteOverlay";
import { EnableNotificationsBanner } from "@/components/EnableNotificationsBanner";
import { WebPushRegistrar } from "@/components/WebPushRegistrar";
import { isStandaloneDisplay } from "@/lib/add-to-homescreen";
import {
  isChatIndexPath,
  isPersistableChatPath,
  readLastChatPath,
  saveLastChatPath,
} from "@/lib/last-chat-path";

type Props = {
  children: ReactNode;
};

function hideSidebarForPath(pathname: string): boolean {
  return pathname.startsWith("/settings");
}

export function ChatShell({ children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const hideSidebar = hideSidebarForPath(pathname);

  useEffect(() => {
    if (isPersistableChatPath(pathname)) {
      saveLastChatPath(pathname);
    }
  }, [pathname]);

  useEffect(() => {
    if (!isStandaloneDisplay()) return;
    if (!isChatIndexPath(pathname)) return;
    const lastPath = readLastChatPath();
    if (lastPath) router.replace(lastPath);
  }, [pathname, router]);

  return (
    <ChatLayoutProvider>
      <WebPushRegistrar />
      <AppUnreadSync />
      <div className={`chat-shell${hideSidebar ? " chat-shell--no-sidebar" : ""}`}>
        {!hideSidebar ? <ChatSidebar /> : null}
        <main className="chat-main">
          <DeployRouteOverlay />
          <AddToHomeScreenBanner />
          <EnableNotificationsBanner />
          {children}
        </main>
      </div>
    </ChatLayoutProvider>
  );
}
