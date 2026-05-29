"use client";

export type CallLayoutMode = "full" | "docked" | "pip";

const LAYOUT_CYCLE: CallLayoutMode[] = ["full", "docked", "pip"];

const LAYOUT_LABELS: Record<CallLayoutMode, string> = {
  full: "Full",
  docked: "Docked",
  pip: "PiP",
};

type Props = {
  isHost: boolean;
  layoutMode: CallLayoutMode;
  onLayoutModeChange: (mode: CallLayoutMode) => void;
  onInvite: () => void;
  onEndForAll: () => void;
  onLeave: () => void;
};

function nextLayoutMode(current: CallLayoutMode): CallLayoutMode {
  const index = LAYOUT_CYCLE.indexOf(current);
  return LAYOUT_CYCLE[(index + 1) % LAYOUT_CYCLE.length] ?? "full";
}

export function CallInCallToolbar({
  isHost,
  layoutMode,
  onLayoutModeChange,
  onInvite,
  onEndForAll,
  onLeave,
}: Props) {
  return (
    <>
      <button type="button" className="btn btn-secondary btn-sm" onClick={onInvite}>
        Invite
      </button>
      {isHost ? (
        <button type="button" className="btn btn-secondary btn-sm" onClick={onEndForAll}>
          End for all
        </button>
      ) : null}
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => onLayoutModeChange(nextLayoutMode(layoutMode))}
        aria-label={`Layout: ${LAYOUT_LABELS[layoutMode]}. Click to change.`}
        title={`Layout: ${LAYOUT_LABELS[layoutMode]}`}
      >
        {LAYOUT_LABELS[layoutMode]}
      </button>
      <button type="button" className="btn btn-secondary btn-sm" onClick={onLeave}>
        Leave
      </button>
    </>
  );
}
