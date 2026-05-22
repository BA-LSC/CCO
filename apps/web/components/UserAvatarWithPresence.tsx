"use client";

import { UserAvatar } from "@/components/UserAvatar";
import { UserPresenceDot } from "@/components/UserPresenceDot";
import { resolvePresenceDotState, usePresence } from "@/components/PresenceProvider";

type Props = {
  userId?: string | null;
  displayName: string;
  avatarUrl?: string | null;
  className?: string;
  size?: "xs" | "sm" | "md";
  showPresence?: boolean;
};

export function UserAvatarWithPresence({
  userId,
  displayName,
  avatarUrl,
  className = "user-avatar",
  size = "md",
  showPresence = true,
}: Props) {
  const { isUserOnline, getUserStatus } = usePresence();
  const online = showPresence && userId ? isUserOnline(userId) : false;
  const status = showPresence && userId ? getUserStatus(userId) : null;
  const dotState = status ? resolvePresenceDotState(status.preset, online) : "offline";

  return (
    <span className={`avatar-with-presence avatar-with-presence--${size}`}>
      <UserAvatar displayName={displayName} avatarUrl={avatarUrl} className={className} />
      {showPresence && userId ? (
        <UserPresenceDot state={dotState} size={size} title={status?.message} />
      ) : null}
    </span>
  );
}
