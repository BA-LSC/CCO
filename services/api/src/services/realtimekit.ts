import { cfRealtimeKitRequest, CloudflareApiError } from "./cloudflare-api";
import {
  getPresetNames,
  resolveRealtimeKitConfig,
  type RealtimeKitConfig,
} from "./org-realtimekit";
import { getConfiguredOrganization } from "./org-oauth";

type MeetingResult = {
  id: string;
  title?: string;
};

type ParticipantResult = {
  id: string;
  token: string;
};

export class RealtimeKitError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "RealtimeKitError";
  }
}

async function realtimeKitAppRequest<T>(
  config: RealtimeKitConfig,
  path: string,
  init?: RequestInit,
): Promise<T> {
  try {
    return await cfRealtimeKitRequest<T>(
      config.apiToken,
      `/accounts/${config.accountId}/realtime/kit/${config.appId}${path}`,
      init,
    );
  } catch (err) {
    if (err instanceof CloudflareApiError) {
      throw new RealtimeKitError(err.message, err.status);
    }
    throw err;
  }
}

export async function createRealtimeKitMeeting(
  title: string,
  config?: RealtimeKitConfig,
): Promise<MeetingResult> {
  const resolved = config ?? (await resolveRealtimeKitConfig());
  if (!resolved) throw new RealtimeKitError("RealtimeKit is not configured");

  const meeting = await realtimeKitAppRequest<MeetingResult | undefined>(resolved, "/meetings", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
  if (!meeting?.id) {
    throw new RealtimeKitError("Unexpected RealtimeKit meeting create response");
  }
  return meeting;
}

export async function addRealtimeKitParticipant(
  params: {
    meetingId: string;
    name: string;
    presetName: string;
    customParticipantId: string;
  },
  config?: RealtimeKitConfig,
): Promise<ParticipantResult> {
  const resolved = config ?? (await resolveRealtimeKitConfig());
  if (!resolved) throw new RealtimeKitError("RealtimeKit is not configured");

  const participant = await realtimeKitAppRequest<ParticipantResult | undefined>(
    resolved,
    `/meetings/${params.meetingId}/participants`,
    {
      method: "POST",
      body: JSON.stringify({
        name: params.name,
        preset_name: params.presetName,
        custom_participant_id: params.customParticipantId,
      }),
    },
  );
  if (!participant?.id || !participant.token) {
    throw new RealtimeKitError("Unexpected RealtimeKit participant create response");
  }
  return participant;
}

export async function refreshRealtimeKitParticipantToken(
  params: {
    meetingId: string;
    participantId: string;
  },
  config?: RealtimeKitConfig,
): Promise<{ token: string }> {
  const resolved = config ?? (await resolveRealtimeKitConfig());
  if (!resolved) throw new RealtimeKitError("RealtimeKit is not configured");

  const refreshed = await realtimeKitAppRequest<{ token?: string } | undefined>(
    resolved,
    `/meetings/${params.meetingId}/participants/${params.participantId}/token`,
    { method: "POST" },
  );
  if (!refreshed?.token) {
    throw new RealtimeKitError("Unexpected RealtimeKit participant token response");
  }
  return { token: refreshed.token };
}

export async function presetForRole(role: "host" | "member" | "guest"): Promise<string> {
  const org = await getConfiguredOrganization();
  const presets = getPresetNames(org);
  if (role === "host") return presets.host;
  if (role === "guest") return presets.guest;
  return presets.member;
}

export async function isRealtimeKitConfigured(): Promise<boolean> {
  return (await resolveRealtimeKitConfig()) != null;
}

/** Drop active RealtimeKit sessions for the given participant identities. */
export async function kickRealtimeKitParticipantsFromSession(params: {
  meetingId: string;
  customParticipantIds?: string[];
  participantIds?: string[];
}): Promise<void> {
  const config = await resolveRealtimeKitConfig();
  if (!config) return;

  const customParticipantIds = params.customParticipantIds?.filter(Boolean) ?? [];
  const participantIds = params.participantIds?.filter(Boolean) ?? [];
  if (customParticipantIds.length === 0 && participantIds.length === 0) return;

  try {
    await realtimeKitAppRequest(config, `/meetings/${params.meetingId}/active-session/kick`, {
      method: "POST",
      body: JSON.stringify({
        custom_participant_ids: customParticipantIds,
        participant_ids: participantIds,
      }),
    });
  } catch (err) {
    console.warn("RealtimeKit kick participants failed:", err);
  }
}

/** End the active RealtimeKit session for everyone still connected. */
export async function endRealtimeKitMeetingSession(meetingId: string): Promise<void> {
  const config = await resolveRealtimeKitConfig();
  if (!config) return;

  try {
    await realtimeKitAppRequest(config, `/meetings/${meetingId}/active-session/kick-all`, {
      method: "POST",
    });
  } catch (err) {
    console.warn("RealtimeKit kick-all failed:", err);
  }
}

/** Prevent new joins after a CCO call ends. */
export async function deactivateRealtimeKitMeeting(meetingId: string): Promise<void> {
  const config = await resolveRealtimeKitConfig();
  if (!config) return;

  try {
    await realtimeKitAppRequest(config, `/meetings/${meetingId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "INACTIVE" }),
    });
  } catch (err) {
    console.warn("RealtimeKit deactivate meeting failed:", err);
  }
}
