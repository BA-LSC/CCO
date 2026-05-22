import { resolveAppBuildVersion } from "@/lib/build-version.server";

export const dynamic = "force-dynamic";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:3001";

async function readDeployUpdating(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { draining?: boolean };
    return Boolean(data.draining);
  } catch {
    return false;
  }
}

export async function GET() {
  const [updating, version] = await Promise.all([
    readDeployUpdating(),
    Promise.resolve(resolveAppBuildVersion(process.env)),
  ]);

  return Response.json(
    { version, updating },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
