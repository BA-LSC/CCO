"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useChatLayout } from "@/components/ChatLayoutContext";
import { PanelHeaderMenuIcon } from "@/components/PanelHeaderIcons";
import { fetchSetupStatus } from "@/lib/setup";

type Props = {
  banner?: ReactNode;
};

export function EmptyChatPane({ banner }: Props) {
  const { openSidebar, session } = useChatLayout();
  const [setupChurchName, setSetupChurchName] = useState<string | null>(null);
  const [menuPulse, setMenuPulse] = useState(true);

  useEffect(() => {
    void fetchSetupStatus().then((status) => {
      if (status.churchName) setSetupChurchName(status.churchName);
    });
  }, []);

  const churchName = session?.organizationName?.trim() || setupChurchName;

  return (
    <div className="empty-chat-pane">
      <div className="empty-chat-pane-top">
        <header className="empty-chat-pane-header">
          <button
            type="button"
            className={`chat-sidebar-toggle empty-chat-pane-menu${menuPulse ? " empty-chat-pane-menu--pulse" : ""}`}
            aria-label="Open menu"
            onClick={() => {
              setMenuPulse(false);
              openSidebar();
            }}
          >
            <PanelHeaderMenuIcon />
          </button>
          {churchName ? (
            <span className="empty-chat-pane-brand">{churchName}</span>
          ) : null}
        </header>
        {banner ? <div className="empty-chat-pane-banner-slot">{banner}</div> : null}
      </div>

      <div className="empty-chat-pane-body">
        <div className="empty-chat-pane-mobile">
          <div className="empty-chat-pane-guide">
            <div className="empty-chat-pane-arrow" aria-hidden>
              <svg
                className="empty-chat-pane-arrow-icon"
                viewBox="0 0 80 80"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M68 68C52 52 34 30 16 14"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                <path
                  d="M16 14H26M16 14V24"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h2 id="empty-chat-welcome" className="empty-chat-pane-title">
              Welcome to CCO
            </h2>
            <p className="empty-chat-pane-welcome">
              To get started, tap the menu in the top left to navigate to your different
              conversations.
            </p>
          </div>
        </div>

        <div className="empty-chat-pane-desktop">
          <h2>Select a conversation</h2>
          <p>Choose a group, message, or team from the sidebar to start chatting.</p>
        </div>
      </div>
    </div>
  );
}
