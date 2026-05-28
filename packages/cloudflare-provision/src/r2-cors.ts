import { cfRequest } from "./cloudflare-api";

export type R2CorsRule = {
  allowed: {
    origins: string[];
    methods: Array<"GET" | "PUT" | "HEAD">;
    headers: string[];
  };
  exposeHeaders?: string[];
  maxAgeSeconds?: number;
};

/** Parse a URL, hostname, or Referer value into a normalized browser Origin (scheme://host[:port]). */
export function parseHttpOrigin(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    const url = trimmed.includes("://") ? new URL(trimmed) : new URL(`https://${trimmed.replace(/\/+$/, "")}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const port = url.port ? `:${url.port}` : "";
    return `${url.protocol}//${url.hostname.toLowerCase()}${port}`;
  } catch {
    return null;
  }
}

export type R2UploadChatOriginSources = {
  webUrl?: string | null;
  publicWebUrl?: string | null;
  signInRedirectUri?: string | null;
  /** Browser Origin header on the presign request (often omitted for same-origin API calls). */
  requestOrigin?: string | null;
  requestReferer?: string | null;
  /** Explicit chat origin from the client or web proxy (window.location.origin). */
  clientChatOrigin?: string | null;
  extraOrigins?: string[];
};

/** Add www ↔ apex variants so uploads work when DNS serves both hostnames. */
export function expandWwwOriginVariants(origins: string[]): string[] {
  const expanded = new Set(origins);

  for (const origin of origins) {
    try {
      const url = new URL(origin);
      const host = url.hostname.toLowerCase();
      const port = url.port ? `:${url.port}` : "";

      if (host.startsWith("www.")) {
        expanded.add(`${url.protocol}//${host.slice(4)}${port}`);
      } else if (host !== "localhost" && host !== "127.0.0.1" && !host.includes(":")) {
        expanded.add(`${url.protocol}//www.${host}${port}`);
      }
    } catch {
      // ignore invalid origins
    }
  }

  return [...expanded];
}

/** Collect chat site origins for R2 bucket CORS (deployment URL, OAuth redirect, live browser origin). */
export function resolveR2UploadChatOrigins(sources: R2UploadChatOriginSources): string[] {
  const origins = new Set<string>();
  const candidates = [
    sources.webUrl,
    sources.publicWebUrl,
    sources.signInRedirectUri,
    sources.clientChatOrigin,
    sources.requestOrigin,
    sources.requestReferer,
    ...(sources.extraOrigins ?? []),
  ];

  for (const candidate of candidates) {
    const origin = parseHttpOrigin(candidate);
    if (origin) origins.add(origin);
  }

  return expandWwwOriginVariants([...origins]);
}

/** CORS rules for browser presigned PUT/GET uploads from the chat web origin. */
export function buildR2UploadCorsRules(chatOrigins: string[]): R2CorsRule[] {
  const origins = resolveR2UploadChatOrigins({ extraOrigins: chatOrigins });
  if (origins.length === 0) return [];

  return [
    {
      allowed: {
        origins,
        methods: ["PUT", "GET", "HEAD"],
        headers: ["*"],
      },
      exposeHeaders: ["ETag"],
      maxAgeSeconds: 3600,
    },
  ];
}

export async function ensureR2BucketCors(
  accountId: string,
  apiToken: string,
  bucketName: string,
  chatOrigins: string[],
): Promise<{ updated: boolean }> {
  const rules = buildR2UploadCorsRules(chatOrigins);
  if (rules.length === 0) return { updated: false };

  await cfRequest<unknown>(
    apiToken,
    `/accounts/${accountId}/r2/buckets/${encodeURIComponent(bucketName)}/cors`,
    {
      method: "PUT",
      body: JSON.stringify({ rules }),
    },
  );

  return { updated: true };
}
