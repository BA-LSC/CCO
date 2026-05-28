import { AwsClient } from "aws4fetch";
import {
  createR2AccessKey,
  ensureR2BucketCors,
  resolveR2UploadChatOrigins,
} from "@cco/cloudflare-provision";
import { decryptSecret } from "../auth/token-crypto";
import { getWorkerBindings } from "../runtime/worker-context";
import { getConfiguredOrganization } from "../services/org-oauth";
import { resolveApplyCloudflareApiToken } from "../services/org-secrets";
import { parseByteRangeHeader, type ByteRange } from "./upload-range";

const DEFAULT_SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60;

export type R2Config = {
  accountId: string;
  bucketName: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Present for temporary credentials minted via the R2 temp-access API. */
  sessionToken?: string;
  publicBaseUrl: string;
};

function readR2CredentialsFromEnv(): Pick<R2Config, "accessKeyId" | "secretAccessKey"> | null {
  const accessKeyId =
    process.env.R2_ACCESS_KEY_ID?.trim() || process.env.CLOUDFLARE_R2_ACCESS_KEY_ID?.trim() || "";
  const secretAccessKey =
    process.env.R2_SECRET_ACCESS_KEY?.trim() ||
    process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY?.trim() ||
    "";
  if (!accessKeyId || !secretAccessKey) return null;
  return { accessKeyId, secretAccessKey };
}

function r2Endpoint(accountId: string): string {
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

export async function resolveR2Config(): Promise<R2Config | null> {
  const org = await getConfiguredOrganization();
  if (
    org?.cloudflareAccountId &&
    org.cloudflareR2BucketName
  ) {
    const publicBaseUrl =
      org.cloudflareR2PublicUrl?.trim() ||
      process.env.PUBLIC_UPLOAD_URL?.trim() ||
      process.env.CLOUDFLARE_R2_PUBLIC_URL?.trim() ||
      "";
    if (org.cloudflareR2AccessKeyIdEnc && org.cloudflareR2SecretAccessKeyEnc) {
      return {
        accountId: org.cloudflareAccountId,
        bucketName: org.cloudflareR2BucketName,
        accessKeyId: decryptSecret(org.cloudflareR2AccessKeyIdEnc),
        secretAccessKey: decryptSecret(org.cloudflareR2SecretAccessKeyEnc),
        publicBaseUrl,
      };
    }
    const envCredentials = readR2CredentialsFromEnv();
    return {
      accountId: org.cloudflareAccountId,
      bucketName: org.cloudflareR2BucketName,
      accessKeyId: envCredentials?.accessKeyId ?? "",
      secretAccessKey: envCredentials?.secretAccessKey ?? "",
      publicBaseUrl,
    };
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const bucketName = process.env.CLOUDFLARE_R2_BUCKET?.trim();
  const envCredentials = readR2CredentialsFromEnv();
  if (accountId && bucketName && envCredentials) {
    return {
      accountId,
      bucketName,
      accessKeyId: envCredentials.accessKeyId,
      secretAccessKey: envCredentials.secretAccessKey,
      publicBaseUrl:
        process.env.CLOUDFLARE_R2_PUBLIC_URL?.trim() ||
        process.env.PUBLIC_UPLOAD_URL?.trim() ||
        "",
    };
  }

  if (getWorkerBindings()?.UPLOADS) {
    return {
      accountId: org?.cloudflareAccountId ?? accountId ?? "binding",
      bucketName: org?.cloudflareR2BucketName ?? bucketName ?? "cco-uploads",
      accessKeyId: envCredentials?.accessKeyId ?? "",
      secretAccessKey: envCredentials?.secretAccessKey ?? "",
      publicBaseUrl:
        org?.cloudflareR2PublicUrl?.trim() ||
        process.env.PUBLIC_UPLOAD_URL?.trim() ||
        process.env.CLOUDFLARE_R2_PUBLIC_URL?.trim() ||
        "",
    };
  }

  return null;
}

export function isR2UploadsEnabled(): boolean {
  if (getWorkerBindings()?.UPLOADS) return true;
  return Boolean(process.env.CLOUDFLARE_R2_BUCKET?.trim()) || process.env.UPLOAD_STORAGE === "r2";
}

/** Apply R2 bucket CORS for browser presigned PUT from the chat web origin (idempotent). */
export async function reconcileOrgR2UploadCors(options?: {
  requestOrigin?: string | null;
  requestReferer?: string | null;
}): Promise<void> {
  const org = await getConfiguredOrganization();
  if (!org?.cloudflareAccountId || !org.cloudflareR2BucketName) return;

  const chatOrigins = resolveR2UploadChatOrigins({
    webUrl: process.env.WEB_URL,
    publicWebUrl: process.env.NEXT_PUBLIC_WEB_URL,
    signInRedirectUri: org.pcoWebRedirectUri,
    requestOrigin: options?.requestOrigin,
    requestReferer: options?.requestReferer,
  });
  if (chatOrigins.length === 0) return;

  const apiToken = resolveApplyCloudflareApiToken(org);
  if (!apiToken) return;

  await ensureR2BucketCors(
    org.cloudflareAccountId,
    apiToken,
    org.cloudflareR2BucketName,
    chatOrigins,
  );
}

function r2Client(config: R2Config): AwsClient {
  return new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    sessionToken: config.sessionToken,
    service: "s3",
    region: "auto",
  });
}

/** Mint short-lived S3 credentials for presigned PUT/GET when only the R2 binding is configured. */
async function withR2S3Credentials(config: R2Config): Promise<R2Config> {
  if (config.accessKeyId && config.secretAccessKey) return config;

  const org = await getConfiguredOrganization();
  const apiToken = org ? resolveApplyCloudflareApiToken(org) : process.env.CLOUDFLARE_API_TOKEN?.trim();
  const accountId = org?.cloudflareAccountId ?? config.accountId;
  const parentAccessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  if (!apiToken || !accountId || !parentAccessKeyId) return config;

  const creds = await createR2AccessKey(
    accountId,
    apiToken,
    config.bucketName,
    parentAccessKeyId,
  );
  return {
    ...config,
    accessKeyId: creds.access_key_id,
    secretAccessKey: creds.secret_access_key,
    sessionToken: creds.session_token,
  };
}

export async function createR2PresignedPutUrl(params: {
  config: R2Config;
  objectKey: string;
  contentType: string;
  ttlSeconds?: number;
}): Promise<string> {
  const config = await withR2S3Credentials(params.config);
  const client = r2Client(config);
  const url = `${r2Endpoint(params.config.accountId)}/${params.config.bucketName}/${params.objectKey}`;
  const signed = await client.sign(
    new Request(url, {
      method: "PUT",
      headers: { "Content-Type": params.contentType },
    }),
    { aws: { signQuery: true, expires: params.ttlSeconds ?? 3600 } },
  );
  return signed.url;
}

export async function createR2PresignedGetUrl(params: {
  config: R2Config;
  objectKey: string;
  ttlSeconds?: number;
}): Promise<string> {
  const config = await withR2S3Credentials(params.config);
  const client = r2Client(config);
  const url = `${r2Endpoint(params.config.accountId)}/${params.config.bucketName}/${params.objectKey}`;
  const signed = await client.sign(new Request(url, { method: "GET" }), {
    aws: { signQuery: true, expires: params.ttlSeconds ?? DEFAULT_SIGNED_URL_TTL_SECONDS },
  });
  return signed.url;
}

export async function buildR2AttachmentUrl(
  objectKey: string,
  ttlSeconds = DEFAULT_SIGNED_URL_TTL_SECONDS,
): Promise<string | null> {
  const config = await resolveR2Config();
  if (!config) return null;
  return createR2PresignedGetUrl({ config, objectKey, ttlSeconds });
}

export async function putR2Object(params: {
  config: R2Config;
  objectKey: string;
  body: Uint8Array | ArrayBuffer;
  contentType: string;
}): Promise<void> {
  const bucket = getWorkerBindings()?.UPLOADS;
  if (bucket) {
    await bucket.put(params.objectKey, params.body, {
      httpMetadata: { contentType: params.contentType },
    });
    return;
  }

  const client = r2Client(params.config);
  const url = `${r2Endpoint(params.config.accountId)}/${params.config.bucketName}/${params.objectKey}`;
  const res = await client.fetch(url, {
    method: "PUT",
    headers: { "Content-Type": params.contentType },
    body: params.body,
  });
  if (!res.ok) {
    throw new Error(`R2 upload failed (${res.status})`);
  }
}

function r2ObjectUrl(config: R2Config, objectKey: string): string {
  return `${r2Endpoint(config.accountId)}/${config.bucketName}/${objectKey}`;
}

function applyR2ObjectHeaders(object: R2Object, headers: Headers): void {
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
}

function rangedResponseHeaders(
  size: number,
  byteRange: ByteRange | null,
  baseHeaders: Headers,
): { status: number; headers: Headers } {
  const headers = new Headers(baseHeaders);
  headers.set("Accept-Ranges", "bytes");

  if (!byteRange) {
    headers.set("Content-Length", String(size));
    return { status: 200, headers };
  }

  const { start, end } = byteRange;
  const length = end - start + 1;
  headers.set("Content-Length", String(length));
  headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  return { status: 206, headers };
}

async function headR2ObjectSize(config: R2Config, objectKey: string): Promise<number | null> {
  const bucket = getWorkerBindings()?.UPLOADS;
  if (bucket) {
    const meta = await bucket.head(objectKey);
    return meta?.size ?? null;
  }

  const client = r2Client(config);
  const headRes = await client.fetch(r2ObjectUrl(config, objectKey), { method: "HEAD" });
  if (!headRes.ok) return null;

  const length = headRes.headers.get("content-length");
  if (!length) return null;
  const size = Number.parseInt(length, 10);
  return Number.isFinite(size) && size > 0 ? size : null;
}

/** Serve an R2 upload with byte-range support for HTML5 media playback. */
export async function serveR2UploadObject(params: {
  config: R2Config;
  objectKey: string;
  method: string;
  rangeHeader?: string;
}): Promise<Response | null> {
  const size = await headR2ObjectSize(params.config, params.objectKey);
  if (size == null) return null;

  const byteRange = parseByteRangeHeader(params.rangeHeader, size);
  if (byteRange === "unsatisfiable") {
    return new Response(null, {
      status: 416,
      headers: {
        "Content-Range": `bytes */${size}`,
        "Accept-Ranges": "bytes",
      },
    });
  }

  const bucket = getWorkerBindings()?.UPLOADS;
  if (bucket) {
    const getOptions = byteRange
      ? {
          range: {
            offset: byteRange.start,
            length: byteRange.end - byteRange.start + 1,
          },
        }
      : undefined;
    const object = await bucket.get(params.objectKey, getOptions);
    if (!object) return null;

    const headers = new Headers();
    applyR2ObjectHeaders(object, headers);
    const { status, headers: rangedHeaders } = rangedResponseHeaders(size, byteRange, headers);

    if (params.method === "HEAD") {
      return new Response(null, { status, headers: rangedHeaders });
    }

    return new Response(object.body, { status, headers: rangedHeaders });
  }

  const client = r2Client(params.config);
  const url = r2ObjectUrl(params.config, params.objectKey);
  const fetchHeaders = new Headers();
  if (byteRange) {
    fetchHeaders.set("Range", `bytes=${byteRange.start}-${byteRange.end}`);
  }

  const upstream = await client.fetch(url, {
    method: "GET",
    headers: fetchHeaders,
  });
  if (!upstream.ok) return null;

  const headers = new Headers(upstream.headers);
  if (!headers.has("Accept-Ranges")) headers.set("Accept-Ranges", "bytes");
  if (byteRange && !headers.has("Content-Range")) {
    const { headers: rangedHeaders, status } = rangedResponseHeaders(size, byteRange, headers);
    if (params.method === "HEAD") {
      return new Response(null, { status, headers: rangedHeaders });
    }
    return new Response(upstream.body, { status, headers: rangedHeaders });
  }

  if (params.method === "HEAD") {
    return new Response(null, { status: upstream.status, headers });
  }

  return new Response(upstream.body, { status: upstream.status, headers });
}

/** @deprecated Use serveR2UploadObject for ranged media serving. */
export async function getR2Object(params: {
  config: R2Config;
  objectKey: string;
}): Promise<Response> {
  const served = await serveR2UploadObject({
    config: params.config,
    objectKey: params.objectKey,
    method: "GET",
  });
  return served ?? new Response("Not Found", { status: 404 });
}
