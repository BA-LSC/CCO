"use client";

import { usePresence } from "@/components/PresenceProvider";

type Props = {
  userId: string;
  className?: string;
};

export function UserStatusMessage({ userId, className = "sidebar-item-preview" }: Props) {
  const { getUserStatus } = usePresence();
  const message = getUserStatus(userId)?.message?.trim();
  if (!message) return null;
  return <span className={className}>{message}</span>;
}
