import { APP_BUILD_VERSION } from "@/lib/build-version";

export const dynamic = "force-dynamic";

function resolveRuntimeVersion(): string {
  const runtimeVersion = process.env.CCO_BUILD_ID ?? process.env.NEXT_PUBLIC_APP_VERSION;
  if (runtimeVersion && runtimeVersion !== "dev") return runtimeVersion;
  return APP_BUILD_VERSION;
}

export function GET() {
  return Response.json(
    { version: resolveRuntimeVersion() },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
