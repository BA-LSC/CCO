/** Public site origin for redirects behind Cloudflare tunnel / reverse proxy. */
export function getPublicOrigin(request: Request): string {
  const fromEnv =
    process.env.WEB_URL?.trim() ||
    process.env.NEXT_PUBLIC_WEB_URL?.trim() ||
    process.env.CCO_DOMAIN?.trim();
  if (fromEnv) {
    if (fromEnv.startsWith("http://") || fromEnv.startsWith("https://")) {
      return fromEnv.replace(/\/$/, "");
    }
    return `https://${fromEnv.replace(/\/$/, "")}`;
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) {
    const host = forwardedHost.split(",")[0]?.trim();
    const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "https";
    if (host) return `${proto}://${host}`;
  }

  const host = request.headers.get("host");
  if (host && !isInternalHost(host)) {
    const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    if (proto) return `${proto}://${host.split(",")[0].trim()}`;
    const url = new URL(request.url);
    return `${url.protocol}//${host.split(",")[0].trim()}`;
  }

  const url = new URL(request.url);
  if (!isInternalHost(url.host)) {
    return url.origin;
  }

  return "http://localhost:3000";
}

export function publicUrl(request: Request, path: string): URL {
  return new URL(path, getPublicOrigin(request));
}

function isInternalHost(host: string): boolean {
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  return (
    hostname === "0.0.0.0" ||
    hostname === "127.0.0.1" ||
    hostname === "localhost" ||
    hostname === "web"
  );
}
