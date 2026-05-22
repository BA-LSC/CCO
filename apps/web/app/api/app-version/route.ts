import { APP_BUILD_VERSION } from "@/lib/build-version";

export const dynamic = "force-dynamic";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:3001";

function resolveRuntimeVersion(): string {
  const runtimeVersion = process.env.CCO_BUILD_ID ?? process.env.NEXT_PUBLIC_APP_VERSION;
  if (runtimeVersion && runtimeVersion !== "dev") return runtimeVersion;
  return APP_BUILD_VERSION;
}

async function readDeployUpdating(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });
    if (!res.ok) return true;
    const data = (await res.json()) as { draining?: boolean };
    return Boolean(data.draining);
  } catch {
    return true;
  }
}

export async function GET() {
  const [updating, version] = await Promise.all([
    readDeployUpdating(),
    Promise.resolve(resolveRuntimeVersion()),
  ]);

  return Response.json(
    { version, updating },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
