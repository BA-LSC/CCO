import {
  createDefaultConfig,
  extendConfig,
  type UIConfig,
} from "@cloudflare/realtimekit-react-ui";

export type CallPanelPlacement = "inline" | "pip" | "guest";

const CHAT_UI_REMOVAL: UIConfig = {
  root: {
    "div#controlbar-right": { remove: ["rtk-chat-toggle"] },
    "rtk-more-toggle.activeMoreMenu.sm": { remove: ["rtk-chat-toggle"] },
    "rtk-more-toggle.activeMoreMenu.md": { remove: ["rtk-chat-toggle"] },
  },
};

function compactControlbarRemoval(enableInRoomChat: boolean): UIConfig {
  const remove = [
    "rtk-polls-toggle",
    "rtk-plugins-toggle",
    ...(enableInRoomChat ? [] : ["rtk-chat-toggle"]),
  ];
  return {
    root: {
      "div#controlbar-right": { remove },
      "rtk-more-toggle.activeMoreMenu.sm": { remove },
      "rtk-more-toggle.activeMoreMenu.md": { remove },
    },
  };
}

export function peerLooksLikeGuest(peer: {
  customParticipantId?: string;
  presetName?: string;
}): boolean {
  if (peer.customParticipantId?.startsWith("guest:")) return true;
  const preset = peer.presetName?.toLowerCase() ?? "";
  return preset.includes("guest");
}

export function buildRtkMeetingConfig({
  enableInRoomChat,
  placement,
}: {
  enableInRoomChat: boolean;
  placement: CallPanelPlacement;
}): UIConfig {
  const base = createDefaultConfig();
  if (placement === "inline" || placement === "pip") {
    return extendConfig(compactControlbarRemoval(enableInRoomChat), base);
  }
  if (!enableInRoomChat) {
    return extendConfig(CHAT_UI_REMOVAL, base);
  }
  return base;
}
