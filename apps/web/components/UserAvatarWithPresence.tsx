"use client";

import { UserAvatar } from "@/components/UserAvatar";
import { UserPresenceDot } from "@/components/UserPresenceDot";
import { usePresence } from "@/components/PresenceProvider";

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
  const { isUserOnline } = usePresence();
  const online = showPresence && userId ? isUserOnline(userId) : false;

  return (
    <span className={`avatar-with-presence avatar-with-presence--${size}`}>
      <UserAvatar displayName={displayName} avatarUrl={avatarUrl} className={className} />
      {showPresence && userId ? (
        <UserPresenceDot online={online} size={size} />
      ) : null}
    </span>
  );
}
