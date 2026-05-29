"use client";

import { useMemo } from "react";
import {
  useRealtimeKitMeeting,
  useRealtimeKitSelector,
} from "@cloudflare/realtimekit-react";
import { RtkSimpleGrid } from "@cloudflare/realtimekit-react-ui";

/** Participant tiles for all joined peers (including self), even when video is off. */
export function CallParticipantGrid() {
  const { meeting } = useRealtimeKitMeeting();
  const joined = useRealtimeKitSelector((m) => m.participants.joined.toArray());
  const self = useRealtimeKitSelector((m) => m.self);

  const participants = useMemo(() => {
    const peers = [...joined];
    if (self?.id && !peers.some((peer) => peer.id === self.id)) {
      peers.unshift(self as unknown as (typeof joined)[number]);
    }
    return peers;
  }, [joined, self]);

  if (!meeting || participants.length === 0) return null;

  return (
    <RtkSimpleGrid
      meeting={meeting}
      participants={participants}
      aspectRatio="16:9"
      gap={8}
    />
  );
}
