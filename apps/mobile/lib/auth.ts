import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { API_URL } from "@/lib/api";

const SESSION_KEY = "connect_session";
const PCO_TOKEN_KEY = "pco_access_token";

WebBrowser.maybeCompleteAuthSession();

export async function saveMobileSession(params: {
  sessionToken: string;
  pcoAccessToken?: string;
}): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, params.sessionToken);
  if (params.pcoAccessToken) {
    await SecureStore.setItemAsync(PCO_TOKEN_KEY, params.pcoAccessToken);
  }
}

export async function getSessionToken(): Promise<string | null> {
  return SecureStore.getItemAsync(SESSION_KEY);
}

export async function getPcoAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(PCO_TOKEN_KEY);
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
  await SecureStore.deleteItemAsync(PCO_TOKEN_KEY);
}

async function completeMobileAuth(code: string): Promise<string> {
  const res = await fetch(`${API_URL}/auth/mobile/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(typeof body.error === "string" ? body.error : "Sign in failed");
  }
  const data = (await res.json()) as { sessionToken: string };
  return data.sessionToken;
}

export async function signInWithPlanningCenter(): Promise<void> {
  const authUrl = `${API_URL}/auth/pco/start?platform=mobile`;
  const result = await WebBrowser.openAuthSessionAsync(
    authUrl,
    "connect://oauth/callback",
  );
  if (result.type !== "success" || !result.url) {
    throw new Error("Sign in was cancelled");
  }
  const url = new URL(result.url);
  const error = url.searchParams.get("error");
  if (error) throw new Error(error);
  const code = url.searchParams.get("code");
  if (!code) throw new Error("No authorization code returned from CCO");
  const sessionToken = await completeMobileAuth(code);
  await saveMobileSession({ sessionToken });
}

export { completeMobileAuth };
