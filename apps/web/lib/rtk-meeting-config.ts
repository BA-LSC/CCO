import {
  createDefaultConfig,
  type UIConfig,
} from "@cloudflare/realtimekit-react-ui";

export type CallPanelPlacement = "inline" | "pip" | "guest";

type RootChild = string | [string, Record<string, unknown>?];

const CONTROLBAR_CHILD_KEYS = [
  "div#controlbar-left",
  "div#controlbar-right",
  "div#controlbar-center",
  "div#controlbar-mobile",
  "rtk-more-toggle.activeMoreMenu",
  "rtk-more-toggle.activeMoreMenu.sm",
  "rtk-more-toggle.activeMoreMenu.md",
] as const;

const MORE_MENU_KEYS = [
  "rtk-more-toggle.activeMoreMenu",
  "rtk-more-toggle.activeMoreMenu.sm",
  "rtk-more-toggle.activeMoreMenu.md",
] as const;

const SETTINGS_IN_MORE_MENU: RootChild = [
  "rtk-settings-toggle",
  { variant: "horizontal", slot: "more-elements" },
];

const CCO_CONTROLBAR_REMOVAL = [
  "rtk-chat-toggle",
  "rtk-polls-toggle",
  "rtk-plugins-toggle",
  "rtk-participants-toggle",
  "rtk-leave-button",
  "rtk-livestream-toggle",
  "rtk-webinar-stage-toggle",
  "rtk-stage-toggle",
  "rtk-ai-toggle",
] as const;

const CCO_HIDDEN_CONTROLBAR_STYLES: NonNullable<UIConfig["styles"]> = {
  "rtk-chat-toggle": { display: "none" },
  "rtk-polls-toggle": { display: "none" },
  "rtk-plugins-toggle": { display: "none" },
  "rtk-participants-toggle": { display: "none" },
  "rtk-leave-button": { display: "none" },
  "rtk-livestream-toggle": { display: "none" },
  "rtk-webinar-stage-toggle": { display: "none" },
  "rtk-stage-toggle": { display: "none" },
  "rtk-ai-toggle": { display: "none" },
};

const CONTROLBAR_SECTION_KEYS = [
  "div#controlbar-left",
  "div#controlbar-center",
  "div#controlbar-right",
] as const;

const CCO_CONTROLBAR_TOGGLE_VARS = {
  "--rtk-controlbar-button-background-color": "transparent",
  "--rtk-controlbar-button-icon-size": "18px",
  minWidth: "34px",
} as const;

const CCO_CONTROLBAR_TOGGLE_KEYS = [
  "rtk-settings-toggle",
  "rtk-screen-share-toggle",
  "rtk-livestream-toggle",
  "rtk-mic-toggle",
  "rtk-camera-toggle",
  "rtk-webinar-stage-toggle",
  "rtk-stage-toggle",
  "rtk-more-toggle",
  "rtk-ai-toggle",
] as const;

const COMPACT_CONTROLBAR_BUTTON_PROPS = { size: "sm" } as const;

const PIP_CONTROLBAR_BUTTON_PROPS = COMPACT_CONTROLBAR_BUTTON_PROPS;

const PIP_CONTROLBAR_TOGGLE_VARS = {
  ...CCO_CONTROLBAR_TOGGLE_VARS,
  "--rtk-controlbar-button-icon-size": "18px",
  minWidth: "32px",
} as const;

const CCO_CONTROLBAR_STYLES: NonNullable<UIConfig["styles"]> = {
  "rtk-controlbar": {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
    padding: "0",
    gap: "0",
    backgroundColor: "transparent",
  },
  "div#controlbar-center": {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: "2px",
    width: "auto",
    maxWidth: "100%",
  },
  "div#controlbar-left": { display: "none" },
  "div#controlbar-right": { display: "none" },
  "rtk-settings-toggle": CCO_CONTROLBAR_TOGGLE_VARS,
  "rtk-screen-share-toggle": CCO_CONTROLBAR_TOGGLE_VARS,
  "rtk-livestream-toggle": CCO_CONTROLBAR_TOGGLE_VARS,
  "rtk-mic-toggle": CCO_CONTROLBAR_TOGGLE_VARS,
  "rtk-camera-toggle": CCO_CONTROLBAR_TOGGLE_VARS,
  "rtk-webinar-stage-toggle": CCO_CONTROLBAR_TOGGLE_VARS,
  "rtk-stage-toggle": CCO_CONTROLBAR_TOGGLE_VARS,
  "rtk-more-toggle": CCO_CONTROLBAR_TOGGLE_VARS,
  "rtk-ai-toggle": CCO_CONTROLBAR_TOGGLE_VARS,
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

/** One centered row — avoids empty 3-column grid with controls stuck on the left. */
function applyCcoControlbarLayout(config: UIConfig): UIConfig {
  const root = config.root;
  if (!root) return config;

  const merged: string[] = [];
  for (const key of CONTROLBAR_SECTION_KEYS) {
    const children = root[key];
    if (!Array.isArray(children)) continue;
    for (const child of children) {
      const tag = tagName(child as RootChild);
      if (!merged.includes(tag)) merged.push(tag);
    }
  }
  if (merged.length === 0) return config;

  const controlbar = root["rtk-controlbar"];
  if (controlbar && typeof controlbar === "object" && !Array.isArray(controlbar)) {
    root["rtk-controlbar"] = {
      ...controlbar,
      children: ["div#controlbar-center"],
    };
  }
  root["div#controlbar-center"] = merged;
  return config;
}

/** Settings live in the overflow menu, not the primary controlbar row. */
function moveSettingsToggleToMoreMenu(config: UIConfig): UIConfig {
  const root = config.root;
  if (!root) return config;

  for (const key of CONTROLBAR_SECTION_KEYS) {
    if (key in root) {
      root[key] = filterRootChildren(root[key], new Set(["rtk-settings-toggle"]));
    }
  }

  const center = root["div#controlbar-center"];
  if (Array.isArray(center)) {
    root["div#controlbar-center"] = filterRootChildren(center, new Set(["rtk-settings-toggle"]));
  }

  for (const key of MORE_MENU_KEYS) {
    const children = root[key];
    if (!Array.isArray(children)) continue;
    const tags = children.map((child) => tagName(child as RootChild));
    if (tags.includes("rtk-settings-toggle")) continue;
    root[key] = [SETTINGS_IN_MORE_MENU, ...(children as RootChild[])];
  }

  return config;
}

function buildCompactControlbarStyles(): NonNullable<UIConfig["styles"]> {
  return {
    ...CCO_CONTROLBAR_STYLES,
    ...CCO_HIDDEN_CONTROLBAR_STYLES,
  };
}

const PIP_CONTROLBAR_TOGGLE_STYLES: Pick<
  NonNullable<UIConfig["styles"]>,
  (typeof CCO_CONTROLBAR_TOGGLE_KEYS)[number]
> = {
  "rtk-settings-toggle": PIP_CONTROLBAR_TOGGLE_VARS,
  "rtk-screen-share-toggle": PIP_CONTROLBAR_TOGGLE_VARS,
  "rtk-livestream-toggle": PIP_CONTROLBAR_TOGGLE_VARS,
  "rtk-mic-toggle": PIP_CONTROLBAR_TOGGLE_VARS,
  "rtk-camera-toggle": PIP_CONTROLBAR_TOGGLE_VARS,
  "rtk-webinar-stage-toggle": PIP_CONTROLBAR_TOGGLE_VARS,
  "rtk-stage-toggle": PIP_CONTROLBAR_TOGGLE_VARS,
  "rtk-more-toggle": PIP_CONTROLBAR_TOGGLE_VARS,
  "rtk-ai-toggle": PIP_CONTROLBAR_TOGGLE_VARS,
};

function buildPipControlbarStyles(): NonNullable<UIConfig["styles"]> {
  return {
    ...buildCompactControlbarStyles(),
    ...PIP_CONTROLBAR_TOGGLE_STYLES,
    "rtk-controlbar": {
      ...CCO_CONTROLBAR_STYLES["rtk-controlbar"],
      width: "100%",
      gap: "0",
      padding: "0",
      backgroundColor: "transparent",
    },
    "div#controlbar-center": {
      ...CCO_CONTROLBAR_STYLES["div#controlbar-center"],
      gap: "0px",
      flexWrap: "nowrap",
      width: "100%",
      maxWidth: "100%",
      justifyContent: "center",
    },
  };
}

function withSmallControlbarButtons(children: unknown): unknown {
  if (!Array.isArray(children)) return children;
  return children.map((child) => {
    if (typeof child === "string") {
      return [child, PIP_CONTROLBAR_BUTTON_PROPS] as RootChild;
    }
    const [tag, props = {}] = child as [string, Record<string, unknown>?];
    return [tag, { ...props, ...PIP_CONTROLBAR_BUTTON_PROPS }] as RootChild;
  });
}

function applyCompactControlbarButtons(config: UIConfig): UIConfig {
  const root = config.root;
  if (!root) return config;

  const center = root["div#controlbar-center"];
  if (Array.isArray(center)) {
    root["div#controlbar-center"] = withSmallControlbarButtons(center) as typeof center;
  }
  return config;
}

function buildCompactControlbarConfig(): UIConfig {
  const config = applyCompactControlbarButtons(
    moveSettingsToggleToMoreMenu(
      applyCcoControlbarLayout(
        applyControlbarFilter(createDefaultConfig(), new Set<string>(CCO_CONTROLBAR_REMOVAL)),
      ),
    ),
  );
  config.styles = {
    ...config.styles,
    ...buildCompactControlbarStyles(),
  };
  return config;
}

function buildPipControlbarConfig(): UIConfig {
  const config = buildCompactControlbarConfig();
  config.styles = {
    ...config.styles,
    ...buildPipControlbarStyles(),
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
  if (placement === "pip") {
    return buildPipControlbarConfig();
  }
  if (placement === "inline") {
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
