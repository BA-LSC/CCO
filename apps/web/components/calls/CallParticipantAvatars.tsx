"use client";

import { useEffect, type RefObject } from "react";
import { useRealtimeKitMeeting } from "@cloudflare/realtimekit-react";
import {
  useCallParticipantAvatars,
  type CallAvatarMember,
} from "@/hooks/useCallParticipantAvatars";

type PeerHost = {
  participant?: {
    customParticipantId?: string;
    picture?: string;
    name?: string;
  };
};

function queryDeep(root: ParentNode, selector: string): Element[] {
  const found: Element[] = [];
  const walk = (node: ParentNode) => {
    node.querySelectorAll(selector).forEach((el) => found.push(el));
    node.querySelectorAll("*").forEach((el) => {
      if (el.shadowRoot) walk(el.shadowRoot);
    });
  };
  walk(root);
  return found;
}

function resolveCustomParticipantId(element: Element): string | null {
  const direct =
    element.getAttribute("data-custom-participant-id") ??
    element.getAttribute("data-customparticipantid");
  if (direct) return direct;

  const host = element as PeerHost;
  const fromProp = host.participant?.customParticipantId;
  if (fromProp) return fromProp;

  const nested = element.querySelector("[data-custom-participant-id]");
  return nested?.getAttribute("data-custom-participant-id") ?? null;
}

function applyAvatarToHost(host: PeerHost, url: string) {
  const current = host.participant;
  if (!current) return;
  host.participant = { ...current, picture: url };
}

function applyAvatars(root: HTMLElement | Document, avatarMap: Map<string, string>) {
  if (avatarMap.size === 0) return;

  for (const tile of queryDeep(root, "rtk-participant-tile")) {
    const customId = resolveCustomParticipantId(tile);
    if (!customId) continue;
    const url = avatarMap.get(customId);
    if (!url) continue;

    applyAvatarToHost(tile as PeerHost, url);
    for (const avatar of queryDeep(tile, "rtk-avatar")) {
      applyAvatarToHost(avatar as PeerHost, url);
    }
  }

  for (const avatar of queryDeep(root, "rtk-avatar")) {
    const customId = resolveCustomParticipantId(avatar);
    if (!customId) continue;
    const url = avatarMap.get(customId);
    if (!url) continue;
    applyAvatarToHost(avatar as PeerHost, url);
  }
}

type Props = {
  panelRef?: RefObject<HTMLElement | null>;
  members?: CallAvatarMember[];
};

export function CallParticipantAvatars({ panelRef, members }: Props) {
  const { meeting } = useRealtimeKitMeeting();
  const avatarMap = useCallParticipantAvatars(meeting, members);

  useEffect(() => {
    const root = panelRef?.current ?? document;
    const run = () => applyAvatars(root, avatarMap);

    run();

    const observer = new MutationObserver(run);
    observer.observe(root instanceof Document ? document.body : root, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    return () => observer.disconnect();
  }, [avatarMap, panelRef, meeting]);

  return null;
}
