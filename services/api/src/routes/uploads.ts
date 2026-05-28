import { mkdir } from "node:fs/promises";
import { Hono } from "hono";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import { serveUploadFile } from "../lib/serve-upload";
import {
  getUploadDir,
  buildSignedUploadUrl,
  safeUploadPath,
  isR2StorageEnabled,
} from "../lib/uploads";
import {
  resolveR2Config,
  createR2PresignedPutUrl,
  reconcileOrgR2UploadCors,
} from "../lib/r2-uploads";
import { isCloudflareRuntime, isCloudflareWorkerRuntime } from "../runtime/worker-context";

type Env = { Variables: AuthVariables };

const MAX_MEDIA_BYTES = 95 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

function inferUploadMimeType(file: File): string {
  if (file.type && file.type !== "application/octet-stream") return file.type;

  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext && MIME_BY_EXT[ext]) return MIME_BY_EXT[ext];

  return file.type;
}

function validateMediaType(contentType: string, size: number): string | null {
  const isImage = IMAGE_TYPES.has(contentType);
  const isVideo = VIDEO_TYPES.has(contentType);
  if (!isImage && !isVideo) return "Unsupported file type";
  if (size > MAX_MEDIA_BYTES) return "File too large (max 95MB)";
  return null;
}

export const uploadsRouter = new Hono<Env>();

uploadsRouter.get("/:filename", serveUploadFile);

/** Returns presigned R2 PUT URL for direct client upload when R2 is configured. */
uploadsRouter.post("/presign", requireAuth, async (c) => {
  const r2 = await resolveR2Config();
  if (!r2) {
    return c.json({ error: "R2 uploads are not configured" }, 503);
  }

  let body: { contentType?: string; size?: number; chatOrigin?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const contentType = body.contentType?.trim() ?? "";
  const size = Number(body.size ?? 0);
  const validationError = validateMediaType(contentType, size);
  if (validationError) return c.json({ error: validationError }, 400);

  const ext = EXT_BY_MIME[contentType] ?? contentType.split("/")[1] ?? "bin";
  const filename = `${crypto.randomUUID()}.${ext}`;

  const clientChatOrigin =
    body.chatOrigin?.trim() ||
    c.req.header("X-CCO-Chat-Origin")?.trim() ||
    null;

  await reconcileOrgR2UploadCors({
    clientChatOrigin,
    requestOrigin: c.req.header("Origin"),
    requestReferer: c.req.header("Referer"),
  }).catch((err) => {
    console.warn(
      "[uploads/presign] R2 upload CORS configuration skipped:",
      err instanceof Error ? err.message : err,
    );
  });

  const uploadUrl = await createR2PresignedPutUrl({
    config: r2,
    objectKey: filename,
    contentType,
    ttlSeconds: 3600,
  });

  return c.json({
    uploadUrl,
    url: buildSignedUploadUrl(filename),
    filename,
    contentType,
    storage: "r2",
  });
});

uploadsRouter.post("/", requireAuth, async (c) => {
  if (isCloudflareWorkerRuntime() || process.env.UPLOAD_STORAGE === "r2") {
    return c.json(
      {
        error:
          "Direct multipart upload is not supported on Cloudflare. Use POST /api/v1/uploads/presign and PUT the file to the returned uploadUrl.",
      },
      400,
    );
  }

  try {
    const r2 = await resolveR2Config();
    const body = await c.req.parseBody();
    const file = body.file;

    if (!file || !(file instanceof File)) {
      return c.json({ error: "file field required" }, 400);
    }

    const contentType = inferUploadMimeType(file);
    const validationError = validateMediaType(contentType, file.size);
    if (validationError) return c.json({ error: validationError }, 400);

    const ext = EXT_BY_MIME[contentType] ?? contentType.split("/")[1] ?? "bin";
    const filename = `${crypto.randomUUID()}.${ext}`;

    if (r2) {
      const { putR2Object } = await import("../lib/r2-uploads");
      const buffer = Buffer.from(await file.arrayBuffer());
      await putR2Object({
        config: r2,
        objectKey: filename,
        body: buffer,
        contentType,
      });
      return c.json({
        url: buildSignedUploadUrl(filename),
        filename,
        contentType,
        storage: "r2",
      });
    }

    if (isCloudflareRuntime()) {
      return c.json({ error: "R2 uploads are not configured" }, 503);
    }

    await mkdir(getUploadDir(), { recursive: true });
    const dest = safeUploadPath(getUploadDir(), filename);
    if (!dest) {
      return c.json({ error: "Invalid filename" }, 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    await Bun.write(dest, buffer);

    return c.json({
      url: buildSignedUploadUrl(filename),
      filename,
      contentType,
      storage: "local",
    });
  } catch (err) {
    console.error("Upload failed:", err);
    const message = err instanceof Error ? err.message : "Upload failed";
    return c.json({ error: message }, 500);
  }
});

export { isR2StorageEnabled };
