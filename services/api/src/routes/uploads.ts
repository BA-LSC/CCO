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

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export const uploadsRouter = new Hono<Env>();

uploadsRouter.get("/:filename", serveUploadFile);

uploadsRouter.post("/", requireAuth, async (c) => {
  const body = await c.req.parseBody();
  const file = body.file;

  if (!file || !(file instanceof File)) {
    return c.json({ error: "file field required" }, 400);
  }

  if (!ALLOWED.has(file.type)) {
    return c.json({ error: "Unsupported image type" }, 400);
  }

  if (file.size > MAX_BYTES) {
    return c.json({ error: "File too large (max 5MB)" }, 400);
  }

  await mkdir(getUploadDir(), { recursive: true });

  const ext = file.type.split("/")[1] ?? "bin";
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
