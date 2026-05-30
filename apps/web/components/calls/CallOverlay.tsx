"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import {
  RealtimeKitProvider,
  useRealtimeKitClient,
  useRealtimeKitMeeting,
  useRealtimeKitSelector,
} from "@cloudflare/realtimekit-react";
import { CallMeetingUi } from "@/components/calls/CallMeetingUi";
import { useTheme } from "@/components/ThemeProvider";
import { shouldApplySoloCallBehavior, SOLO_CALL_AUTO_LEAVE_MS } from "@/lib/call-solo";
import { applyCcoRtkDesignSystem } from "@/lib/rtk-design-system";
import {
  type CallPanelPlacement,
  peerLooksLikeGuest,
} from "@/lib/rtk-meeting-config";

export type { CallPanelPlacement };

const INLINE_MAX_HEIGHT_PX = 320;

type SessionProps = {
  authToken: string;
  sessionParticipantCount: number;
  onLeave: () => void;
  onSoloAutoLeave?: (durationMs: number) => void;
  showSetupScreen?: boolean;
  panelRef: RefObject<HTMLDivElement | null>;
  /** Changes when the panel DOM surface moves (inline vs PiP). */
  panelSurfaceKey?: string;
  children: ReactNode;
};

type FrameProps = {
  authToken: string;
  placement: CallPanelPlacement;
  inlineAnchorRect?: DOMRect | null;
  docked?: boolean;
  embedded?: boolean;
  showSetupScreen?: boolean;
  isGuestSession?: boolean;
  panelRef: RefObject<HTMLDivElement | null>;
};

type OverlayProps = {
  authToken: string;
  sessionParticipantCount: number;
  onLeave: () => void;
  onSoloAutoLeave?: (durationMs: number) => void;
  placement?: CallPanelPlacement;
  inlineAnchorRect?: DOMRect | null;
  docked?: boolean;
  embedded?: boolean;
  showSetupScreen?: boolean;
};

function useSoloCallBehavior(
  meeting: ReturnType<typeof useRealtimeKitMeeting>["meeting"],
  panelRef: RefObject<HTMLDivElement | null>,
  sessionParticipantCount: number,
  onSoloAutoLeave?: (durationMs: number) => void,
  panelSurfaceKey = "default",
) {
  const roomJoined = useRealtimeKitSelector((m) => m.self.roomJoined);
  const participantCount = useRealtimeKitSelector((m) => m.participants.count);
  const [othersJoinedInRoom, setOthersJoinedInRoom] = useState(false);
  const sessionParticipantCountRef = useRef(sessionParticipantCount);
  const soloJoinedAtRef = useRef<number | null>(null);
  const onSoloAutoLeaveRef = useRef(onSoloAutoLeave);

  sessionParticipantCountRef.current = sessionParticipantCount;
  onSoloAutoLeaveRef.current = onSoloAutoLeave;

  useEffect(() => {
    if (!meeting) return;
    if (meeting.participants.count > 0) {
      setOthersJoinedInRoom(true);
    }

    const onParticipantJoined = () => {
      setOthersJoinedInRoom(true);
    };

    meeting.participants.joined.on("participantJoined", onParticipantJoined);
    return () => {
      meeting.participants.joined.off("participantJoined", onParticipantJoined);
    };
  }, [meeting]);

  const isSoloNow = () =>
    shouldApplySoloCallBehavior(
      sessionParticipantCountRef.current,
      meeting?.participants.count ?? 0,
      othersJoinedInRoom,
    );

  useEffect(() => {
    if (!meeting) return;
    const root = panelRef.current;
    if (!root) return;

    const leaveImmediately = () => {
      void meeting.leaveRoom();
    };

    const onLeaveClick = (event: MouseEvent) => {
      if (!isSoloNow()) return;
      const hitLeaveButton = event.composedPath().some(
        (el) => el instanceof HTMLElement && el.tagName === "RTK-LEAVE-BUTTON",
      );
      if (!hitLeaveButton) return;
      event.stopImmediatePropagation();
      event.preventDefault();
      leaveImmediately();
    };

    const onLeaveConfirmation = (event: Event) => {
      const detail = (event as CustomEvent<{ activeLeaveConfirmation?: boolean }>).detail;
      if (detail?.activeLeaveConfirmation !== true || !isSoloNow()) return;
      event.stopImmediatePropagation();
      leaveImmediately();
    };

    root.addEventListener("click", onLeaveClick, true);
    root.addEventListener("rtkStateUpdate", onLeaveConfirmation, true);
    return () => {
      root.removeEventListener("click", onLeaveClick, true);
      root.removeEventListener("rtkStateUpdate", onLeaveConfirmation, true);
    };
  }, [meeting, panelRef, panelSurfaceKey, othersJoinedInRoom, sessionParticipantCount]);

  useEffect(() => {
    if (roomJoined && isSoloNow()) {
      soloJoinedAtRef.current ??= Date.now();
      return;
    }
    soloJoinedAtRef.current = null;
  }, [meeting, roomJoined, participantCount, othersJoinedInRoom, sessionParticipantCount]);

  useEffect(() => {
    if (!meeting || !roomJoined || !isSoloNow()) return;
    const timer = setTimeout(() => {
      if (!isSoloNow()) return;
      const joinedAt = soloJoinedAtRef.current ?? Date.now() - SOLO_CALL_AUTO_LEAVE_MS;
      onSoloAutoLeaveRef.current?.(Date.now() - joinedAt);
      void meeting.leaveRoom();
    }, SOLO_CALL_AUTO_LEAVE_MS);
    return () => clearTimeout(timer);
  }, [meeting, roomJoined, participantCount, othersJoinedInRoom, sessionParticipantCount]);
}

function MeetingLifecycle({
  authToken,
  sessionParticipantCount,
  onLeave,
  onSoloAutoLeave,
  showSetupScreen,
  panelRef,
  panelSurfaceKey = "default",
}: Omit<SessionProps, "children">) {
  const { meeting } = useRealtimeKitMeeting();
  const onLeaveRef = useRef(onLeave);
  const leftRef = useRef(false);

  onLeaveRef.current = onLeave;

  useSoloCallBehavior(meeting, panelRef, sessionParticipantCount, onSoloAutoLeave, panelSurfaceKey);

  useEffect(() => {
    if (!meeting) return;
    leftRef.current = false;
    const handler = () => {
      if (leftRef.current) return;
      leftRef.current = true;
      onLeaveRef.current();
    };
    meeting.self.on("roomLeft", handler);
    return () => {
      meeting.self.off("roomLeft", handler);
    };
  }, [meeting]);

  useEffect(() => {
    if (!meeting) return;
    return () => {
      if (!leftRef.current && meeting.self.roomJoined) {
        leftRef.current = true;
        void meeting.leaveRoom();
      }
    };
  }, [meeting]);

  useEffect(() => {
    if (!meeting || showSetupScreen || meeting.self.roomJoined) return;
    void meeting.joinRoom().catch(() => {
      // RtkMeeting may already be joining; ignore duplicate attempts.
    });
  }, [meeting, showSetupScreen, authToken]);

  return null;
}

function panelStyle(
  placement: CallPanelPlacement,
  inlineAnchorRect: DOMRect | null | undefined,
  embedded: boolean,
  docked: boolean,
): CSSProperties | undefined {
  if (placement === "guest") return undefined;
  if (embedded || docked) return undefined;
  if (placement === "pip") return undefined;
  if (!inlineAnchorRect) return { visibility: "hidden" };

  const height = Math.min(
    typeof window !== "undefined" ? window.innerHeight * 0.34 : INLINE_MAX_HEIGHT_PX,
    INLINE_MAX_HEIGHT_PX,
  );

  return {
    position: "fixed",
    top: inlineAnchorRect.top,
    left: inlineAnchorRect.left,
    width: inlineAnchorRect.width,
    height,
    zIndex: 100,
  };
}

function buildPanelClassName(
  placement: CallPanelPlacement,
  docked: boolean,
  embedded: boolean,
): string {
  return [
    "call-panel",
    placement === "inline" ? "call-panel--inline" : "",
    docked ? "call-panel--inline-docked" : "",
    placement === "pip" ? "call-panel--pip" : "",
    embedded ? "call-panel--pip-embedded" : "",
    placement === "guest" ? "call-panel--guest" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Persistent RealtimeKit session — survives inline/PiP panel swaps. */
export function CallMeetingSession({
  authToken,
  sessionParticipantCount,
  onLeave,
  onSoloAutoLeave,
  showSetupScreen = false,
  panelRef,
  panelSurfaceKey,
  children,
}: SessionProps) {
  const [meeting, initMeeting] = useRealtimeKitClient();

  useEffect(() => {
    void initMeeting({
      authToken,
      defaults: { video: false, audio: true },
    });
  }, [authToken, initMeeting]);

  return (
    <RealtimeKitProvider value={meeting}>
      {children}
      <MeetingLifecycle
        authToken={authToken}
        sessionParticipantCount={sessionParticipantCount}
        onLeave={onLeave}
        onSoloAutoLeave={onSoloAutoLeave}
        showSetupScreen={showSetupScreen}
        panelRef={panelRef}
        panelSurfaceKey={panelSurfaceKey}
      />
    </RealtimeKitProvider>
  );
}

/** Visual call panel shell; safe to remount when switching inline vs PiP. */
export function CallPanelFrame({
  authToken,
  placement,
  inlineAnchorRect,
  docked = false,
  embedded = false,
  showSetupScreen = false,
  isGuestSession = false,
  panelRef,
}: FrameProps) {
  const { meeting } = useRealtimeKitMeeting();
  const { theme } = useTheme();

  const hasGuestInRoom = useRealtimeKitSelector((m) => {
    if (isGuestSession) return true;
    const peers = m.participants.joined.toArray();
    return peers.some((peer) => peerLooksLikeGuest(peer));
  });

  const enableInRoomChat = isGuestSession || hasGuestInRoom;

  useLayoutEffect(() => {
    applyCcoRtkDesignSystem(panelRef.current ?? document.documentElement);
  }, [panelRef, theme]);

  if (!meeting) return null;

  return (
    <div
      ref={panelRef}
      className={buildPanelClassName(placement, docked, embedded)}
      style={panelStyle(placement, inlineAnchorRect, embedded, docked)}
      role="region"
      aria-label="Video call"
    >
      <CallMeetingUi
        meeting={meeting}
        placement={placement}
        enableInRoomChat={enableInRoomChat}
        showSetupScreen={showSetupScreen}
        authToken={authToken}
      />
    </div>
  );
}

/** Combined session + frame for standalone pages (e.g. guest join). */
export function CallOverlay({
  authToken,
  sessionParticipantCount,
  onLeave,
  onSoloAutoLeave,
  placement = "inline",
  inlineAnchorRect,
  docked = false,
  embedded = false,
  showSetupScreen = false,
}: OverlayProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  return (
    <CallMeetingSession
      authToken={authToken}
      sessionParticipantCount={sessionParticipantCount}
      onLeave={onLeave}
      onSoloAutoLeave={onSoloAutoLeave}
      showSetupScreen={showSetupScreen}
      panelRef={panelRef}
    >
      <CallPanelFrame
        authToken={authToken}
        placement={placement}
        inlineAnchorRect={inlineAnchorRect}
        docked={docked}
        embedded={embedded}
        showSetupScreen={showSetupScreen}
        isGuestSession={placement === "guest"}
        panelRef={panelRef}
      />
    </CallMeetingSession>
  );
}
