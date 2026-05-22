"use client";

import { usePathname } from "next/navigation";
import { type ReactNode } from "react";
import { ChatLayoutProvider } from "@/components/ChatLayoutContext";
import { ChatSidebar } from "@/components/ChatSidebar";
import { WebPushRegistrar } from "@/components/WebPushRegistrar";

type Props = {
  children: ReactNode;
};

function hideSidebarForPath(pathname: string): boolean {
  return pathname.startsWith("/settings");
}

export function ChatShell({ children }: Props) {
  const pathname = usePathname();
  const hideSidebar = hideSidebarForPath(pathname);

  return (
    <ChatLayoutProvider>
      <WebPushRegistrar />
      <div className={`chat-shell${hideSidebar ? " chat-shell--no-sidebar" : ""}`}>
        {!hideSidebar ? <ChatSidebar /> : null}
        <main className="chat-main">{children}</main>
      </div>
    </ChatLayoutProvider>
  );
}
