"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import {
  RealtimeKitProvider,
  useRealtimeKitClient,
  useRealtimeKitMeeting,
  useRealtimeKitSelector,
} from "@cloudflare/realtimekit-react";
import { CallMeetingUi } from "@/components/calls/CallMeetingUi";
import { CallParticipantAvatars } from "@/components/calls/CallParticipantAvatars";
import { useTheme } from "@/components/ThemeProvider";
import { shouldApplySoloCallBehavior } from "@/lib/call-solo";
import { applyCcoRtkDesignSystem } from "@/lib/rtk-design-system";
import {
  type CallPanelPlacement,
  peerLooksLikeGuest,
} from "@/lib/rtk-meeting-config";
import type { PipPosition } from "@/hooks/usePipPanel";

export type { CallPanelPlacement };

const SOLO_CALL_AUTO_LEAVE_MS = 5 * 60 * 1000;
const INLINE_MAX_HEIGHT_PX = 400;
const PIP_HANDLE_HEIGHT_PX = 48;
const PIP_ACTIONS_HEIGHT_PX = 36;
const PIP_WIDTH_PX = 360;

type Props = {
  authToken: string;
  sessionParticipantCount: number;
  onLeave: () => void;
  placement?: CallPanelPlacement;
  /** Measured anchor for inline placement (top of chat-panel-content). */
  inlineAnchorRect?: DOMRect | null;
  /** Fixed position for pip placement (handle is rendered separately). */
  pipAnchor?: PipPosition | null;
  pipCollapsed?: boolean;
  /** Signed-in users skip RTK setup; guests may show it. */
  showSetupScreen?: boolean;
};

function useSoloCallBehavior(
  meeting: ReturnType<typeof useRealtimeKitMeeting>["meeting"],
  panelRef: RefObject<HTMLDivElement | null>,
  sessionParticipantCount: number,
) {
  const roomJoined = useRealtimeKitSelector((m) => m.self.roomJoined);
  const participantCount = useRealtimeKitSelector((m) => m.participants.count);
  const [othersJoinedInRoom, setOthersJoinedInRoom] = useState(false);
  const sessionParticipantCountRef = useRef(sessionParticipantCount);

  sessionParticipantCountRef.current = sessionParticipantCount;

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
  }, [meeting, panelRef, othersJoinedInRoom, sessionParticipantCount]);

  useEffect(() => {
    if (!meeting || !roomJoined || !isSoloNow()) return;
    const timer = setTimeout(() => {
      if (!isSoloNow()) return;
      void meeting.leaveRoom();
    }, SOLO_CALL_AUTO_LEAVE_MS);
    return () => clearTimeout(timer);
  }, [meeting, roomJoined, participantCount, othersJoinedInRoom, sessionParticipantCount]);
}

function MeetingInner({
  authToken,
  sessionParticipantCount,
  onLeave,
  showSetupScreen,
  panelRef,
  isGuestSession,
  placement,
}: {
  authToken: string;
  sessionParticipantCount: number;
  onLeave: () => void;
  showSetupScreen: boolean;
  panelRef: RefObject<HTMLDivElement | null>;
  isGuestSession: boolean;
  placement: CallPanelPlacement;
}) {
  const { meeting } = useRealtimeKitMeeting();
  const onLeaveRef = useRef(onLeave);
  const leftRef = useRef(false);

  const hasGuestInRoom = useRealtimeKitSelector((m) => {
    if (isGuestSession) return true;
    const peers = m.participants.joined.toArray();
    return peers.some((peer) => peerLooksLikeGuest(peer));
  });

  const enableInRoomChat = isGuestSession || hasGuestInRoom;

  onLeaveRef.current = onLeave;

  useSoloCallBehavior(meeting, panelRef, sessionParticipantCount);

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

  if (!meeting) return null;

  return (
    <>
      <CallParticipantAvatars panelRef={panelRef} />
      <CallMeetingUi
        meeting={meeting}
        placement={placement}
        enableInRoomChat={enableInRoomChat}
        showSetupScreen={showSetupScreen}
        authToken={authToken}
      />
    </>
  );
}

function panelStyle(
  placement: CallPanelPlacement,
  inlineAnchorRect: DOMRect | null | undefined,
  pipAnchor: PipPosition | null | undefined,
  pipCollapsed: boolean,
): CSSProperties | undefined {
  if (placement === "guest") return undefined;

  if (placement === "pip") {
    if (!pipAnchor || pipCollapsed) return { visibility: "hidden" };
    const margin = 8;
    const width = Math.min(PIP_WIDTH_PX, window.innerWidth - margin * 2);
    const height = Math.min(240, window.innerHeight - 160);
    return {
      position: "fixed",
      left: pipAnchor.x,
      top: pipAnchor.y + PIP_HANDLE_HEIGHT_PX + PIP_ACTIONS_HEIGHT_PX,
      width,
      height,
      zIndex: 1200,
    };
  }

  if (!inlineAnchorRect) return { visibility: "hidden" };

  const height = Math.min(
    typeof window !== "undefined" ? window.innerHeight * 0.42 : INLINE_MAX_HEIGHT_PX,
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

export function CallOverlay({
  authToken,
  sessionParticipantCount,
  onLeave,
  placement = "inline",
  inlineAnchorRect,
  pipAnchor,
  pipCollapsed = false,
  showSetupScreen = false,
}: Props) {
  const [meeting, initMeeting] = useRealtimeKitClient();
  const panelRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();

  useLayoutEffect(() => {
    applyCcoRtkDesignSystem(panelRef.current ?? document.documentElement);
  }, [theme]);

  useEffect(() => {
    void initMeeting({
      authToken,
      defaults: { video: false, audio: true },
    });
  }, [authToken, initMeeting]);

  const className = [
    "call-panel",
    placement === "inline" ? "call-panel--inline" : "",
    placement === "pip" ? "call-panel--pip" : "",
    placement === "guest" ? "call-panel--guest" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={panelRef}
      className={className}
      style={panelStyle(placement, inlineAnchorRect, pipAnchor, pipCollapsed)}
      role="region"
      aria-label="Video call"
    >
      <RealtimeKitProvider value={meeting}>
        <MeetingInner
          authToken={authToken}
          sessionParticipantCount={sessionParticipantCount}
          onLeave={onLeave}
          showSetupScreen={showSetupScreen}
          panelRef={panelRef}
          isGuestSession={placement === "guest"}
          placement={placement}
        />
      </RealtimeKitProvider>
    </div>
  );
}
