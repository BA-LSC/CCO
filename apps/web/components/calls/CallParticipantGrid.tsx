"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  useRealtimeKitMeeting,
  useRealtimeKitSelector,
} from "@cloudflare/realtimekit-react";
import { useCallParticipantAvatars } from "@/hooks/useCallParticipantAvatars";

type CallPeer = {
  id: string;
  name?: string;
  picture?: string;
  customParticipantId?: string;
  videoEnabled?: boolean;
  registerVideoElement?: (element: HTMLVideoElement, isPreview?: boolean) => void;
  deregisterVideoElement?: (element?: HTMLVideoElement, isPreview?: boolean) => void;
};

function peerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]!.charAt(0)}${parts[1]!.charAt(0)}`.toUpperCase();
}

function CallParticipantBox({
  peer,
  avatarUrl,
  isSelf,
}: {
  peer: CallPeer;
  avatarUrl?: string;
  isSelf: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const displayName = peer.name?.trim() || "Participant";
  const showVideo = Boolean(peer.videoEnabled);

  useEffect(() => {
    const element = videoRef.current;
    if (!element || !showVideo || !peer.registerVideoElement) return;

    peer.registerVideoElement(element);
    return () => {
      peer.deregisterVideoElement?.(element);
    };
  }, [peer, showVideo]);

  return (
    <div className="call-participant-box">
      {showVideo ? (
        <video
          ref={videoRef}
          className="call-participant-box__video"
          autoPlay
          playsInline
          muted={isSelf}
        />
      ) : (
        <div className="call-participant-box__avatar" aria-hidden={!avatarUrl}>
          {avatarUrl ? (
            <img src={avatarUrl} alt="" />
          ) : (
            <span className="call-participant-box__initials">{peerInitials(displayName)}</span>
          )}
        </div>
      )}
      <span className="call-participant-box__name">
        {isSelf ? "You" : displayName}
      </span>
    </div>
  );
}

/** Participant preview tiles for everyone in the call, including when video is off. */
export function CallParticipantGrid() {
  const { meeting } = useRealtimeKitMeeting();
  const joined = useRealtimeKitSelector((m) => m.participants.joined.toArray());
  const self = useRealtimeKitSelector((m) => m.self);
  const roomJoined = useRealtimeKitSelector((m) => m.self.roomJoined);
  const avatarMap = useCallParticipantAvatars(meeting);

  const participants = useMemo(() => {
    const peers = [...joined] as CallPeer[];
    if (self?.id && !peers.some((peer) => peer.id === self.id)) {
      peers.unshift(self as unknown as CallPeer);
    }
    return peers;
  }, [joined, self]);

  if (!meeting || !roomJoined || participants.length === 0) return null;

  const gridClass =
    participants.length === 1
      ? "call-participant-grid call-participant-grid--solo"
      : participants.length === 2
        ? "call-participant-grid call-participant-grid--duo"
        : "call-participant-grid";

  return (
    <div className={gridClass}>
      {participants.map((peer) => {
        const customId = peer.customParticipantId;
        const avatarUrl =
          (customId ? avatarMap.get(customId) : undefined) ??
          (peer.picture?.trim() ? peer.picture : undefined);

        return (
          <CallParticipantBox
            key={peer.id}
            peer={peer}
            avatarUrl={avatarUrl}
            isSelf={peer.id === self?.id}
          />
        );
      })}
    </div>
  );
}
