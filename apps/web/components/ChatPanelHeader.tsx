"use client";

import { type ReactNode } from "react";
import { useChatLayout } from "@/components/ChatLayoutContext";
import { PanelHeaderMenuIcon } from "@/components/PanelHeaderIcons";
import { usePresenceWatch } from "@/components/PresenceProvider";
import { UserAvatar } from "@/components/UserAvatar";
import { UserAvatarWithPresence } from "@/components/UserAvatarWithPresence";

type Props = {
  title: string;
  subtitle?: string;
  avatarUrl?: string | null;
  avatarUserId?: string | null;
  loading?: boolean;
  children?: ReactNode;
};

export function ChatPanelHeader({
  title,
  subtitle,
  avatarUrl,
  avatarUserId,
  loading = false,
  children,
}: Props) {
  const { openSidebar } = useChatLayout();
  usePresenceWatch(avatarUserId ? [avatarUserId] : [], Boolean(avatarUserId) && !loading);

  return (
    <header className="chat-panel-header">
      <div className="chat-panel-header-start">
        <button
          type="button"
          className="chat-sidebar-toggle"
          aria-label="Open sidebar"
          onClick={openSidebar}
        >
          <PanelHeaderMenuIcon />
        </button>
        {avatarUrl !== undefined && !loading && avatarUserId ? (
          <UserAvatarWithPresence
            userId={avatarUserId}
            displayName={title}
            avatarUrl={avatarUrl}
            className="chat-panel-header-avatar"
            size="sm"
          />
        ) : null}
        {avatarUrl !== undefined && !loading && !avatarUserId ? (
          <UserAvatar
            displayName={title}
            avatarUrl={avatarUrl}
            className="chat-panel-header-avatar"
          />
        ) : null}
        {avatarUrl !== undefined && loading && (
          <span className="chat-panel-header-avatar chat-panel-header-avatar-skeleton" aria-hidden />
        )}
        <div className="chat-panel-header-text">
          <h1 className="chat-panel-title">
            {loading ? (
              <>
                <span className="chat-panel-title-skeleton" aria-hidden />
                <span className="chat-panel-visually-hidden">Loading conversation</span>
              </>
            ) : (
              title
            )}
          </h1>
          {(loading || subtitle) && (
            <p className="chat-panel-subtitle">
              {loading ? (
                <span className="chat-panel-subtitle-skeleton" aria-hidden />
              ) : (
                subtitle
              )}
            </p>
          )}
        </div>
      </div>
      {children && (
        <div className="chat-panel-header-actions" role="toolbar" aria-label="Channel actions">
          {children}
        </div>
      )}
    </header>
  );
}
