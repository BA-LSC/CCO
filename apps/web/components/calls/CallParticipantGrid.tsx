"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  useRealtimeKitMeeting,
  useRealtimeKitSelector,
} from "@cloudflare/realtimekit-react";
import { useCallParticipantAvatars } from "@/hooks/useCallParticipantAvatars";
import { useParticipantAudioSpeaking } from "@/hooks/useParticipantAudioSpeaking";
import { useRtkMirrorVideoPref } from "@/hooks/useRtkMirrorVideoPref";
import { useSpeakingOutline } from "@/hooks/useSpeakingOutline";
import {
  buildCallParticipantTiles,
  buildCallScreenShareTiles,
  isCallTileSelf,
  type CallScreenSharePeer,
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
  mirrorSelfVideo,
}: {
  peer: CallPeer;
  avatarUrl?: string;
  isSelf: boolean;
  audioTrack?: MediaStreamTrack;
  audioEnabled: boolean;
  mirrorSelfVideo: boolean;
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

  useEffect(() => {
    const element = videoRef.current;
    if (!element || !showVideo || !peer.registerVideoElement) return;

    peer.registerVideoElement(element, isSelf);
    return () => {
      peer.deregisterVideoElement?.(element, isSelf);
    };
  }, [peer, showVideo, isSelf]);

  return (
    <div className={`call-participant-box${mutedBoxClass}${speakingBoxClass}`}>
      {showVideo ? (
        <video
          ref={videoRef}
          className={`call-participant-box__video${
            mirrorSelfVideo ? " call-participant-box__video--mirror" : ""
          }`}
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

function CallScreenShareBox({
  peer,
  isSelf,
}: {
  peer: CallScreenSharePeer;
  isSelf: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const displayName = peer.name?.trim() || "Participant";
  const label = isSelf ? "Your screen" : `${displayName}'s screen`;

  useEffect(() => {
    const element = videoRef.current;
    const track = peer.screenShareTracks?.video ?? null;
    if (!element || !peer.screenShareEnabled || !track) {
      if (element) element.srcObject = null;
      return;
    }

    const attach = () => {
      const stream = new MediaStream();
      stream.addTrack(track);
      element.srcObject = stream;
      void element.play().catch(() => {
        // Autoplay may be blocked until user gesture; ignore.
      });
    };

    attach();
    const onUpdate = () => attach();
    peer.addListener?.("screenShareUpdate", onUpdate);
    return () => {
      peer.removeListener?.("screenShareUpdate", onUpdate);
      element.srcObject = null;
    };
  }, [
    peer,
    peer.screenShareEnabled,
    peer.screenShareTracks?.video?.id,
  ]);

  if (!peer.screenShareEnabled || !peer.screenShareTracks?.video) {
    return null;
  }

  return (
    <div className="call-participant-box call-participant-box--screenshare">
      <video
        ref={videoRef}
        className="call-participant-box__video call-participant-box__video--screenshare"
        autoPlay
        playsInline
        muted
      />
      <span className="call-participant-box__name">{label}</span>
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
  const mirrorVideo = useRtkMirrorVideoPref();
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

  const screenShares = useMemo(
    () =>
      buildCallScreenShareTiles(
        joined as CallScreenSharePeer[],
        self as unknown as CallScreenSharePeer | undefined,
        roomJoined,
      ),
    [joined, self, roomJoined],
  );

  const tileCount = participants.length + screenShares.length;

  if (!meeting || !roomJoined || tileCount === 0) return null;

  const gridClass =
    tileCount === 1
      ? "call-participant-grid call-participant-grid--solo"
      : tileCount === 2
        ? "call-participant-grid call-participant-grid--duo"
        : "call-participant-grid";

  return (
    <div className={gridClass}>
      {participants.map((peer) => {
        const customId = peer.customParticipantId;
        const avatarUrl =
          (customId ? avatarMap.get(customId) : undefined) ??
          (peer.picture?.trim() ? peer.picture : undefined);

        const tileIsSelf = isCallTileSelf(peer, self as unknown as CallPeer | undefined);

        return (
          <CallParticipantBox
            key={peer.id}
            peer={peer}
            avatarUrl={avatarUrl}
            isSelf={tileIsSelf}
            mirrorSelfVideo={tileIsSelf && mirrorVideo}
            audioTrack={peer.id === self?.id ? selfAudioTrack : peer.audioTrack}
            audioEnabled={peer.id === self?.id ? selfAudioEnabled : Boolean(peer.audioEnabled)}
          />
        );
      })}
      {screenShares.map(({ peer, isSelf }) => (
        <CallScreenShareBox
          key={`screenshare-${peer.id}`}
          peer={peer}
          isSelf={isSelf}
        />
      ))}
    </div>
  );
}
