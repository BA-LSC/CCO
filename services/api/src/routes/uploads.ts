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

export const uploadsRouter = new Hono<Env>();

uploadsRouter.get("/:filename", serveUploadFile);

uploadsRouter.post("/", requireAuth, async (c) => {
  const body = await c.req.parseBody();
  const file = body.file;

  if (!file || !(file instanceof File)) {
    return c.json({ error: "file field required" }, 400);
  }

  const isImage = IMAGE_TYPES.has(file.type);
  const isVideo = VIDEO_TYPES.has(file.type);

  if (!isImage && !isVideo) {
    return c.json({ error: "Unsupported file type" }, 400);
  }

  if (file.size > MAX_MEDIA_BYTES) {
    return c.json({ error: "File too large (max 95MB)" }, 400);
  }

  await mkdir(getUploadDir(), { recursive: true });

  const ext = EXT_BY_MIME[file.type] ?? file.type.split("/")[1] ?? "bin";
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
    contentType: file.type,
  });
});
