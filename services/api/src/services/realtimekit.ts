import {
  getPresetNames,
  resolveRealtimeKitConfig,
  type RealtimeKitConfig,
} from "./org-realtimekit";

type CloudflareResult<T> = {
  success: boolean;
  result: T;
  errors?: Array<{ message: string }>;
};

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

function apiBase(config: RealtimeKitConfig): string {
  return `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/realtime/kit/${config.appId}`;
}

async function cloudflareRequest<T>(
  config: RealtimeKitConfig,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${apiBase(config)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const json = (await res.json()) as CloudflareResult<T>;
  if (!res.ok || !json.success) {
    const detail = json.errors?.map((e) => e.message).join("; ") ?? res.statusText;
    throw new RealtimeKitError(detail || "RealtimeKit API request failed", res.status);
  }

  return json.result;
}

export async function createRealtimeKitMeeting(title: string): Promise<MeetingResult> {
  const config = await resolveRealtimeKitConfig();
  if (!config) throw new RealtimeKitError("RealtimeKit is not configured");

  return cloudflareRequest<MeetingResult>(config, "/meetings", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

export async function addRealtimeKitParticipant(params: {
  meetingId: string;
  name: string;
  presetName: string;
  customParticipantId: string;
}): Promise<ParticipantResult> {
  const config = await resolveRealtimeKitConfig();
  if (!config) throw new RealtimeKitError("RealtimeKit is not configured");

  return cloudflareRequest<ParticipantResult>(config, `/meetings/${params.meetingId}/participants`, {
    method: "POST",
    body: JSON.stringify({
      name: params.name,
      preset_name: params.presetName,
      custom_participant_id: params.customParticipantId,
    }),
  });
}

export async function refreshRealtimeKitParticipantToken(params: {
  meetingId: string;
  participantId: string;
}): Promise<ParticipantResult> {
  const config = await resolveRealtimeKitConfig();
  if (!config) throw new RealtimeKitError("RealtimeKit is not configured");

  return cloudflareRequest<ParticipantResult>(
    config,
    `/meetings/${params.meetingId}/participants/${params.participantId}/token`,
    { method: "PUT" },
  );
}

export function presetForRole(role: "host" | "member" | "guest"): string {
  const presets = getPresetNames();
  if (role === "host") return presets.host;
  if (role === "guest") return presets.guest;
  return presets.member;
}

export async function isRealtimeKitConfigured(): Promise<boolean> {
  return (await resolveRealtimeKitConfig()) != null;
}
