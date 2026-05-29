"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import type { useRealtimeKitClient } from "@cloudflare/realtimekit-react";
import {
  RtkControlbar,
  RtkDialogManager,
  RtkMeeting,
  RtkNotifications,
  RtkParticipantsAudio,
  RtkSidebar,
  RtkUiProvider,
} from "@cloudflare/realtimekit-react-ui";
import { CallParticipantGrid } from "@/components/calls/CallParticipantGrid";
import {
  buildRtkMeetingConfig,
  type CallPanelPlacement,
} from "@/lib/rtk-meeting-config";

type Props = {
  meeting: ReturnType<typeof useRealtimeKitClient>[0];
  placement: CallPanelPlacement;
  enableInRoomChat: boolean;
  showSetupScreen: boolean;
  authToken: string;
};

export function CallMeetingUi({
  meeting,
  placement,
  enableInRoomChat,
  showSetupScreen,
  authToken,
}: Props) {
  const rtkRef = useRef<HTMLRtkMeetingElement>(null);
  const meetingConfig = useMemo(
    () => buildRtkMeetingConfig({ enableInRoomChat, placement }),
    [enableInRoomChat, placement],
  );

  useLayoutEffect(() => {
    if (showSetupScreen || !rtkRef.current) return;
    rtkRef.current.showSetupScreen = false;
  }, [showSetupScreen, meeting, authToken]);

  if (!meeting) return null;

  const panelClass = `call-panel-meeting${enableInRoomChat ? "" : " call-panel-meeting--no-chat"}`;

  if (placement === "guest") {
    return (
      <div className={panelClass}>
        <RtkMeeting
          key={authToken}
          ref={rtkRef}
          mode="fill"
          meeting={meeting}
          showSetupScreen={showSetupScreen}
          loadConfigFromPreset={false}
          config={meetingConfig}
        />
      </div>
    );
  }

  return (
    <div className={`call-meeting-ui ${panelClass}`}>
      <RtkUiProvider
        key={authToken}
        meeting={meeting}
        config={meetingConfig}
        mode="fill"
        showSetupScreen={false}
      >
        <div className="call-meeting-ui__body">
          <CallParticipantGrid />
          {enableInRoomChat ? <RtkSidebar /> : null}
        </div>
        <RtkControlbar />
        <RtkParticipantsAudio />
        <RtkDialogManager />
        <RtkNotifications />
      </RtkUiProvider>
    </div>
  );
}
