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

export async function createRealtimeKitMeeting(title: string): Promise<MeetingResult> {
  const config = await resolveRealtimeKitConfig();
  if (!config) throw new RealtimeKitError("RealtimeKit is not configured");

  const meeting = await realtimeKitAppRequest<MeetingResult | undefined>(config, "/meetings", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
  if (!meeting?.id) {
    throw new RealtimeKitError("Unexpected RealtimeKit meeting create response");
  }
  return meeting;
}

export async function addRealtimeKitParticipant(params: {
  meetingId: string;
  name: string;
  presetName: string;
  customParticipantId: string;
}): Promise<ParticipantResult> {
  const config = await resolveRealtimeKitConfig();
  if (!config) throw new RealtimeKitError("RealtimeKit is not configured");

  const participant = await realtimeKitAppRequest<ParticipantResult | undefined>(
    config,
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

export async function refreshRealtimeKitParticipantToken(params: {
  meetingId: string;
  participantId: string;
}): Promise<{ token: string }> {
  const config = await resolveRealtimeKitConfig();
  if (!config) throw new RealtimeKitError("RealtimeKit is not configured");

  const refreshed = await realtimeKitAppRequest<{ token?: string } | undefined>(
    config,
    `/meetings/${params.meetingId}/participants/${params.participantId}/token`,
    { method: "PUT" },
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
