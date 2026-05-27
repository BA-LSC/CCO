import { createInstallApp, type InstallOrchestratorEnv } from "./app";

const app = createInstallApp();

async function serveReleaseAsset(
  request: Request,
  env: InstallOrchestratorEnv,
): Promise<Response | null> {
  const assets = env.RELEASES_ASSETS;
  if (!assets) return null;

  const url = new URL(request.url);
  if (url.pathname !== "/releases" && !url.pathname.startsWith("/releases/")) {
    return null;
  }

  const assetPath =
    url.pathname === "/releases"
      ? "/"
      : url.pathname.slice("/releases".length) || "/";
  const assetUrl = new URL(assetPath + url.search, url.origin);
  return assets.fetch(new Request(assetUrl, request));
}

export default {
  async fetch(
    request: Request,
    env: InstallOrchestratorEnv,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const releaseResponse = await serveReleaseAsset(request, env);
    if (releaseResponse) return releaseResponse;
    return app.fetch(request, env, ctx);
  },
};

export { createInstallApp };
export type { InstallOrchestratorEnv };
