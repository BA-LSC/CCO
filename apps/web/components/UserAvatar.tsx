"use client";

import { useEffect, useState } from "react";

type Props = {
  displayName: string;
  avatarUrl?: string | null;
  className?: string;
};

function initials(name: string): string {
  if (!name.trim()) return "?";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function UserAvatar({ displayName, avatarUrl, className = "user-avatar" }: Props) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(avatarUrl) && !imageFailed;

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);

  return (
    <span className={className} aria-hidden>
      {showImage ? (
        <img
          src={avatarUrl!}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
        />
      ) : (
        initials(displayName)
      )}
    </span>
  );
}
