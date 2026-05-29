"use client";

import {
  ConversationCallHeaderButton,
  ConversationCallShell,
  useConversationCall,
} from "@/components/calls/ConversationCallContext";

export { ConversationCallHeaderButton, ConversationCallShell, useConversationCall };

/** @deprecated Use ConversationCallShell + ConversationCallHeaderButton */
export function ConversationCallKit({ disabled }: { conversationId?: string; disabled?: boolean }) {
  return <ConversationCallHeaderButton disabled={disabled} />;
}
