import {
  createDefaultConfig,
  type UIConfig,
} from "@cloudflare/realtimekit-react-ui";

export type CallPanelPlacement = "inline" | "pip" | "guest";

type RootChild = string | [string, Record<string, unknown>?];

const CONTROLBAR_CHILD_KEYS = [
  "div#controlbar-right",
  "div#controlbar-center",
  "div#controlbar-mobile",
  "rtk-more-toggle.activeMoreMenu",
  "rtk-more-toggle.activeMoreMenu.sm",
  "rtk-more-toggle.activeMoreMenu.md",
] as const;

const CCO_CONTROLBAR_REMOVAL = [
  "rtk-chat-toggle",
  "rtk-polls-toggle",
  "rtk-plugins-toggle",
  "rtk-participants-toggle",
  "rtk-leave-button",
] as const;

const CCO_HIDDEN_CONTROLBAR_STYLES: NonNullable<UIConfig["styles"]> = {
  "rtk-chat-toggle": { display: "none" },
  "rtk-polls-toggle": { display: "none" },
  "rtk-plugins-toggle": { display: "none" },
  "rtk-participants-toggle": { display: "none" },
  "rtk-leave-button": { display: "none" },
};

function tagName(child: RootChild): string {
  return typeof child === "string" ? child : child[0];
}

function filterRootChildren(children: unknown, remove: ReadonlySet<string>): unknown {
  if (!Array.isArray(children)) return children;
  return children.filter((child) => !remove.has(tagName(child as RootChild)));
}

function applyControlbarFilter(config: UIConfig, remove: ReadonlySet<string>): UIConfig {
  const root = config.root;
  if (!root) return config;

  for (const key of CONTROLBAR_CHILD_KEYS) {
    if (key in root) {
      root[key] = filterRootChildren(root[key], remove) as (typeof root)[typeof key];
    }
  }

  return config;
}

function buildCompactControlbarConfig(): UIConfig {
  const config = applyControlbarFilter(
    createDefaultConfig(),
    new Set<string>(CCO_CONTROLBAR_REMOVAL),
  );
  config.styles = {
    ...config.styles,
    ...CCO_HIDDEN_CONTROLBAR_STYLES,
  };
  return config;
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
  if (placement === "inline" || placement === "pip") {
    return buildCompactControlbarConfig();
  }
  if (!enableInRoomChat) {
    return applyControlbarFilter(createDefaultConfig(), new Set(["rtk-chat-toggle"]));
  }
  return createDefaultConfig();
}

/** @internal Test helper */
export function listControlbarTags(config: UIConfig, key: (typeof CONTROLBAR_CHILD_KEYS)[number]): string[] {
  const children = config.root?.[key];
  if (!Array.isArray(children)) return [];
  return children.map((child) => tagName(child as RootChild));
}
