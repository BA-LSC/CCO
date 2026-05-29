"use client";

import { useMemo } from "react";
import { useRealtimeKitSelector } from "@cloudflare/realtimekit-react";
import type { useRealtimeKitMeeting } from "@cloudflare/realtimekit-react";
import { useChatLayout } from "@/components/ChatLayoutContext";
import { resolveMemberAvatarUrl } from "@/lib/member-avatar";

export type CallAvatarMember = {
  id: string;
  avatarUrl?: string | null;
};

type Meeting = ReturnType<typeof useRealtimeKitMeeting>["meeting"];

type PeerLike = {
  customParticipantId?: string;
  picture?: string;
};

export function useCallParticipantAvatars(
  meeting: Meeting,
  members?: CallAvatarMember[],
) {
  const { session } = useChatLayout();
  const peers = useRealtimeKitSelector((m) => m.participants.joined.toArray());

  return useMemo(() => {
    const map = new Map<string, string>();
    const memberById = new Map(members?.map((member) => [member.id, member]) ?? []);

    const addPeer = (peer: PeerLike) => {
      const customId = peer.customParticipantId;
      if (!customId || customId.startsWith("guest:")) return;

      if (peer.picture) {
        map.set(customId, peer.picture);
        return;
      }

      const member = memberById.get(customId);
      const url = member
        ? resolveMemberAvatarUrl({ id: member.id, avatarUrl: member.avatarUrl }, session)
        : customId === session?.userId
          ? session?.avatarUrl
          : undefined;

      if (url) map.set(customId, url);
    };

    for (const peer of peers) {
      addPeer(peer);
    }

    if (meeting?.self?.customParticipantId) {
      addPeer(meeting.self);
    }

    return map;
  }, [meeting, members, peers, session]);
}
