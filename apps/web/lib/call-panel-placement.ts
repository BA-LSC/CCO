export type CallPanelPlacementMode = "none" | "inline" | "pip";

export function resolveCallPanelPlacement(params: {
  inCall: boolean;
  homeConversationId: string | null;
  activeConversationId: string | null;
}): CallPanelPlacementMode {
  if (!params.inCall || !params.homeConversationId) return "none";
  if (params.activeConversationId === params.homeConversationId) return "inline";
  return "pip";
}
