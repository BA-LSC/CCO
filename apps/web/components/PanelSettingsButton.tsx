"use client";

import { PanelHeaderSettingsIcon } from "@/components/PanelHeaderIcons";

type Props = {
  expanded: boolean;
  onClick: () => void;
  label?: string;
  disabled?: boolean;
};

export function PanelSettingsButton({
  expanded,
  onClick,
  label = "Channel settings",
  disabled = false,
}: Props) {
  return (
    <button
      type="button"
      className="panel-header-icon-btn"
      aria-expanded={expanded}
      aria-haspopup="true"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <PanelHeaderSettingsIcon />
    </button>
  );
}
