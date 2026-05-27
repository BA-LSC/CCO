import { AwsClient } from "aws4fetch";
import { createR2AccessKey } from "@cco/cloudflare-provision";
import { decryptSecret } from "../auth/token-crypto";
import { getWorkerBindings } from "../runtime/worker-context";
import { getConfiguredOrganization } from "../services/org-oauth";
import { resolveApplyCloudflareApiToken } from "../services/org-secrets";

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

export async function getR2Object(params: {
  config: R2Config;
  objectKey: string;
}): Promise<Response> {
  const bucket = getWorkerBindings()?.UPLOADS;
  if (bucket) {
    const object = await bucket.get(params.objectKey);
    if (!object) {
      return new Response("Not Found", { status: 404 });
    }
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    return new Response(object.body, { status: 200, headers });
  }

  const client = r2Client(params.config);
  const url = `${r2Endpoint(params.config.accountId)}/${params.config.bucketName}/${params.objectKey}`;
  return client.fetch(url, { method: "GET" });
}
