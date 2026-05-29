"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  useRealtimeKitMeeting,
  useRealtimeKitSelector,
} from "@cloudflare/realtimekit-react";
import { useCallParticipantAvatars } from "@/hooks/useCallParticipantAvatars";
import { useParticipantAudioSpeaking } from "@/hooks/useParticipantAudioSpeaking";
import { useSpeakingOutline } from "@/hooks/useSpeakingOutline";
import {
  buildCallParticipantTiles,
  isCallTileSelf,
} from "@/lib/call-participant-tiles";

type CallPeer = {
  id: string;
  name?: string;
  picture?: string;
  customParticipantId?: string;
  videoEnabled?: boolean;
  audioEnabled?: boolean;
  audioTrack?: MediaStreamTrack;
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
  audioTrack,
  audioEnabled,
}: {
  peer: CallPeer;
  avatarUrl?: string;
  isSelf: boolean;
  audioTrack?: MediaStreamTrack;
  audioEnabled: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const displayName = peer.name?.trim() || "Participant";
  const showVideo = Boolean(peer.videoEnabled);
  const isMuted = !audioEnabled;
  const isSpeaking = useParticipantAudioSpeaking(audioTrack, audioEnabled);
  const { showOutline, isPulsing } = useSpeakingOutline(isSpeaking);

  const mutedBoxClass = isMuted ? " call-participant-box--muted" : "";
  const speakingBoxClass =
    !isMuted && showOutline
      ? isPulsing
        ? " call-participant-box--speaking"
        : " call-participant-box--speaking-out"
      : "";
  const speakingAvatarClass =
    !isMuted && showOutline
      ? isPulsing
        ? " call-participant-box__avatar--speaking"
        : " call-participant-box__avatar--speaking-out"
      : "";

  useEffect(() => {
    const element = videoRef.current;
    if (!element || !showVideo || !peer.registerVideoElement) return;

    peer.registerVideoElement(element);
    return () => {
      peer.deregisterVideoElement?.(element);
    };
  }, [peer, showVideo]);

  return (
    <div className={`call-participant-box${mutedBoxClass}${speakingBoxClass}`}>
      {showVideo ? (
        <video
          ref={videoRef}
          className="call-participant-box__video"
          autoPlay
          playsInline
          muted={isSelf}
        />
      ) : (
        <div
          className={`call-participant-box__avatar${speakingAvatarClass}`}
          aria-hidden={!avatarUrl}
        >
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
  const selfAudioTrack = useRealtimeKitSelector((m) => m.self?.audioTrack);
  const selfAudioEnabled = useRealtimeKitSelector((m) => m.self?.audioEnabled ?? false);
  const roomJoined = useRealtimeKitSelector((m) => m.self.roomJoined);
  const avatarMap = useCallParticipantAvatars(meeting);

  const participants = useMemo(
    () =>
      buildCallParticipantTiles(
        joined as CallPeer[],
        self as unknown as CallPeer | undefined,
        roomJoined,
      ) as CallPeer[],
    [joined, self, roomJoined],
  );

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
            isSelf={isCallTileSelf(peer, self as unknown as CallPeer | undefined)}
            audioTrack={peer.id === self?.id ? selfAudioTrack : peer.audioTrack}
            audioEnabled={peer.id === self?.id ? selfAudioEnabled : Boolean(peer.audioEnabled)}
          />
        );
      })}
    </div>
  );
}
