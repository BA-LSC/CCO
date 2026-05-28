/** Reserved for a future native app (Expo). Off by default — web PWA is the only client today. */
export const MOBILE_NATIVE_AUTH_DISABLED_MESSAGE =
  "Native app OAuth is disabled. Set CCO_MOBILE_NATIVE_AUTH_ENABLED=1 when a native client is deployed.";

export function isMobileNativeAuthEnabled(): boolean {
  return process.env.CCO_MOBILE_NATIVE_AUTH_ENABLED === "1";
}
