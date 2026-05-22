import { mkdir } from "node:fs/promises";
import { Hono } from "hono";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import { serveUploadFile } from "../lib/serve-upload";
import {
  getUploadDir,
  buildSignedUploadUrl,
  safeUploadPath,
} from "../lib/uploads";

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

export const uploadsRouter = new Hono<Env>();

uploadsRouter.get("/:filename", serveUploadFile);

uploadsRouter.post("/", requireAuth, async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body.file;

    if (!file || !(file instanceof File)) {
      return c.json({ error: "file field required" }, 400);
    }

    const contentType = inferUploadMimeType(file);
    const isImage = IMAGE_TYPES.has(contentType);
    const isVideo = VIDEO_TYPES.has(contentType);

    if (!isImage && !isVideo) {
      return c.json({ error: "Unsupported file type" }, 400);
    }

    if (file.size > MAX_MEDIA_BYTES) {
      return c.json({ error: "File too large (max 95MB)" }, 400);
    }

    await mkdir(getUploadDir(), { recursive: true });

    const ext = EXT_BY_MIME[contentType] ?? contentType.split("/")[1] ?? "bin";
    const filename = `${crypto.randomUUID()}.${ext}`;
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
    });
  } catch (err) {
    console.error("Upload failed:", err);
    const message = err instanceof Error ? err.message : "Upload failed";
    return c.json({ error: message }, 500);
  }
});
