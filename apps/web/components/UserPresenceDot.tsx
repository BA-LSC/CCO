"use client";

type Props = {
  online: boolean;
  size?: "xs" | "sm" | "md";
};

export function UserPresenceDot({ online, size = "md" }: Props) {
  return (
    <span
      className={`user-presence-dot user-presence-dot--${size}${
        online ? " user-presence-dot--online" : ""
      }`}
      aria-label={online ? "Active now" : "Away"}
    />
  );
}
