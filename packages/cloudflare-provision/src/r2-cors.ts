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

function normalizeOrigin(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed.replace(/\/+$/, "");
  }
  return `https://${trimmed.replace(/\/+$/, "")}`;
}

/** CORS rules for browser presigned PUT/GET uploads from the chat web origin. */
export function buildR2UploadCorsRules(chatOrigins: string[]): R2CorsRule[] {
  const origins = [...new Set(chatOrigins.map(normalizeOrigin).filter(Boolean))];
  if (origins.length === 0) return [];

  return [
    {
      allowed: {
        origins,
        methods: ["PUT", "GET", "HEAD"],
        headers: ["Content-Type", "content-type"],
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
