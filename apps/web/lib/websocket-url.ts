function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

function isLocalhostHost(host: string): boolean {
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  return hostname === "localhost" || hostname === "127.0.0.1";
}

/** Map the public web hostname to the API hostname used for WebSockets. */
export function deriveApiHostname(webHostname: string): string {
  const host = webHostname.split(":")[0]?.toLowerCase() ?? webHostname;
  if (host.startsWith("api.")) return host;
  const parts = host.split(".");
  if (parts.length <= 2) return `api.${host}`;
  return `api.${parts.slice(1).join(".")}`;
}

export type ResolveWebSocketBaseOptions = {
  configured?: string;
  webUrl?: string;
  windowProtocol?: string;
  windowHost?: string;
};

/**
 * WebSocket base URL for /v1/ws. Prefer NEXT_PUBLIC_WS_URL when set; otherwise
 * derive wss://<api-host> from the public web URL or current browser host.
 */
export type RuntimeWebSocketEnv = {
  nextPublicWsUrl?: string;
  apiDomain?: string;
  webUrl?: string;
};

/** Server-side: resolve WS base from deploy env (API_DOMAIN beats hostname guessing). */
export function resolveRuntimeWebSocketUrl(env: RuntimeWebSocketEnv): string | null {
  const configured = env.nextPublicWsUrl?.trim() ?? "";
  if (configured) {
    const normalized = configured.includes("://") ? configured : `wss://${configured}`;
    if (!isLocalhostHost(new URL(normalized).hostname)) {
      return stripTrailingSlash(normalized);
    }
  }

  const apiDomain = normalizeHostname(env.apiDomain);
  if (apiDomain) return `wss://${apiDomain}`;

  const webUrl = env.webUrl?.trim();
  if (webUrl) {
    try {
      const parsed = new URL(
        webUrl.startsWith("http://") || webUrl.startsWith("https://")
          ? webUrl
          : `https://${webUrl}`,
      );
      const protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
      return `${protocol}//${deriveApiHostname(parsed.hostname)}`;
    } catch {
      // ignore invalid web URL
    }
  }

  if (configured) {
    const normalized = configured.includes("://") ? configured : `wss://${configured}`;
    return stripTrailingSlash(normalized);
  }

  return null;
}

function normalizeHostname(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const withoutProto = trimmed.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  const host = withoutProto.split(":")[0]?.toLowerCase();
  return host || null;
}

export function resolveWebSocketBase(options: ResolveWebSocketBaseOptions = {}): string {
  const configured = options.configured ?? process.env.NEXT_PUBLIC_WS_URL?.trim() ?? "";
  const webUrl = options.webUrl ?? process.env.NEXT_PUBLIC_WEB_URL?.trim() ?? "";

  if (configured && !isLocalhostHost(new URL(configured.includes("://") ? configured : `wss://${configured}`).hostname)) {
    const normalized = configured.includes("://") ? configured : `wss://${configured}`;
    return stripTrailingSlash(normalized);
  }

  if (options.windowHost) {
    const protocol = options.windowProtocol === "https:" ? "wss:" : "ws:";
    const apiHost = deriveApiHostname(options.windowHost);
    return `${protocol}//${apiHost}`;
  }

  if (webUrl) {
    try {
      const parsed = new URL(webUrl);
      const protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
      const apiHost = deriveApiHostname(parsed.hostname);
      return `${protocol}//${apiHost}`;
    } catch {
      // ignore invalid web URL
    }
  }

  if (configured) {
    const normalized = configured.includes("://") ? configured : `wss://${configured}`;
    return stripTrailingSlash(normalized);
  }

  return "ws://localhost:3001";
}
