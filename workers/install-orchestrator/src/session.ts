import type { ProvisionSessionState } from "@cco/cloudflare-provision";
import { decryptSecret, encryptSecret } from "./token-crypto";

export const SESSION_TTL_SECONDS = 3600;

export type InstallWizardStep = "welcome" | "cloudflare" | "domains" | "deploy" | "complete";

export type InstallSession = {
  churchName: string;
  step: InstallWizardStep;
  createdAt: number;
  accountId?: string;
  zoneId?: string;
  zoneName?: string;
  chatHostname?: string;
  apiHostname?: string;
  cloudflareTokenEnc?: string;
  provisionJobId?: string;
};

export function installSessionKey(sessionId: string): string {
  return `session:${sessionId}`;
}

export async function loadInstallSession(
  kv: KVNamespace,
  sessionId: string,
): Promise<InstallSession | null> {
  const raw = await kv.get(installSessionKey(sessionId));
  if (!raw) return null;
  return JSON.parse(raw) as InstallSession;
}

export async function saveInstallSession(
  kv: KVNamespace,
  sessionId: string,
  session: InstallSession,
): Promise<void> {
  await kv.put(installSessionKey(sessionId), JSON.stringify(session), {
    expirationTtl: SESSION_TTL_SECONDS,
  });
}

export async function storeCloudflareToken(
  kv: KVNamespace,
  sessionId: string,
  session: InstallSession,
  apiToken: string,
  encryptionKey: string,
): Promise<InstallSession> {
  const updated: InstallSession = {
    ...session,
    cloudflareTokenEnc: await encryptSecret(apiToken.trim(), encryptionKey),
    step: session.step === "welcome" ? "cloudflare" : session.step,
  };
  await saveInstallSession(kv, sessionId, updated);
  return updated;
}

export async function readCloudflareToken(
  session: InstallSession,
  encryptionKey: string,
): Promise<string | null> {
  if (!session.cloudflareTokenEnc) return null;
  return decryptSecret(session.cloudflareTokenEnc, encryptionKey);
}

export async function deleteCloudflareToken(
  kv: KVNamespace,
  sessionId: string,
  session: InstallSession,
): Promise<void> {
  const updated: InstallSession = { ...session };
  delete updated.cloudflareTokenEnc;
  await saveInstallSession(kv, sessionId, updated);
}

export type ProvisionStatusResponse = {
  sessionId: string;
  churchName: string;
  currentStep: ProvisionSessionState["currentStep"];
  stepStatus: ProvisionSessionState["stepStatus"];
  resources: ProvisionSessionState["resources"];
  error?: string;
  complete: boolean;
  chatUrl?: string;
  apiUrl?: string;
};

export function buildProvisionStatus(
  sessionId: string,
  state: ProvisionSessionState,
): ProvisionStatusResponse {
  const complete = state.currentStep === "complete" && state.stepStatus.complete?.status === "complete";
  const chatHost = state.resources.chatHostname;
  const apiHost = state.resources.apiHostname;
  return {
    sessionId,
    churchName: state.churchName,
    currentStep: state.currentStep,
    stepStatus: state.stepStatus,
    resources: state.resources,
    error: state.error,
    complete,
    chatUrl: chatHost ? `https://${chatHost}` : undefined,
    apiUrl: apiHost ? `https://${apiHost}` : undefined,
  };
}
