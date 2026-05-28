import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";

const uploadDir = path.join(os.tmpdir(), `cco-upload-route-${process.pid}`);
process.env.UPLOAD_DIR = uploadDir;
process.env.SESSION_SECRET ??= "test-secret-must-be-at-least-32-characters-long!!";

import app from "../app";
import { signSession } from "../auth/session";
import {
  buildSignedUploadUrl,
  extractUploadFilename,
  isAllowedAttachmentUrl,
  refreshAttachmentUrl,
  safeUploadPath,
  signUploadAccess,
  verifyUploadSignature,
} from "./uploads";

describe("GET /uploads/:filename", () => {
  const publicBase = "http://localhost:3001/uploads";

  beforeAll(async () => {
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, "valid.png"), "png-bytes");
  });

  afterAll(async () => {
    await rm(uploadDir, { recursive: true, force: true });
  });

  test("blocks path traversal", async () => {
    const res = await app.request("/uploads/..%2F..%2Fetc%2Fpasswd");
    expect(res.status).toBe(403);
  });

  test("allows signed URL access without session", async () => {
    const url = buildSignedUploadUrl("valid.png", 3600, publicBase);
    const { pathname, search } = new URL(url);
    const filename = path.basename(pathname);
    const res = await app.request(`/uploads/${filename}${search}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("png-bytes");
  });

  test("rejects unsigned requests without auth", async () => {
    const res = await app.request("/uploads/valid.png");
    expect(res.status).toBe(401);
  });

  test("allows session auth without signed URL", async () => {
    const token = await signSession({
      userId: "550e8400-e29b-41d4-a716-446655440000",
      organizationId: "660e8400-e29b-41d4-a716-446655440000",
    });
    const res = await app.request("/uploads/valid.png", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("png-bytes");
  });

  test("supports byte range requests for media playback", async () => {
    const url = buildSignedUploadUrl("valid.png", 3600, publicBase);
    const { pathname, search } = new URL(url);
    const filename = path.basename(pathname);
    const res = await app.request(`/uploads/${filename}${search}`, {
      headers: { Range: "bytes=0-2" },
    });
    expect(res.status).toBe(206);
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(res.headers.get("Content-Range")).toBe("bytes 0-2/9");
    expect(await res.text()).toBe("png");
  });
});

describe("safeUploadPath", () => {
  const uploadDir = path.join(os.tmpdir(), "cco-upload-test");

  beforeEach(async () => {
    await mkdir(uploadDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(uploadDir, { recursive: true, force: true });
  });

  test("resolves a normal filename under upload dir", () => {
    const resolved = safeUploadPath(uploadDir, "photo.png");
    expect(resolved).toBe(path.resolve(uploadDir, "photo.png"));
  });

  test("rejects path traversal via ..", () => {
    expect(safeUploadPath(uploadDir, "../etc/passwd")).toBeNull();
    expect(safeUploadPath(uploadDir, "..")).toBeNull();
  });

  test("rejects embedded slashes", () => {
    expect(safeUploadPath(uploadDir, "foo/bar.png")).toBeNull();
    expect(safeUploadPath(uploadDir, "foo\\bar.png")).toBeNull();
  });

  test("rejects null bytes", () => {
    expect(safeUploadPath(uploadDir, "file\0.png")).toBeNull();
  });

  test("rejects empty filename", () => {
    expect(safeUploadPath(uploadDir, "")).toBeNull();
  });
});

describe("upload signed URLs", () => {
  test("sign and verify a valid signature", () => {
    const filename = "abc.png";
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const sig = signUploadAccess(filename, exp);
    expect(verifyUploadSignature(filename, sig, exp)).toBe(true);
  });

  test("rejects expired signatures", () => {
    const filename = "abc.png";
    const exp = Math.floor(Date.now() / 1000) - 10;
    const sig = signUploadAccess(filename, exp);
    expect(verifyUploadSignature(filename, sig, exp)).toBe(false);
  });

  test("rejects tampered signatures", () => {
    const filename = "abc.png";
    const exp = Math.floor(Date.now() / 1000) + 3600;
    expect(verifyUploadSignature(filename, "deadbeef", exp)).toBe(false);
    expect(verifyUploadSignature("other.png", signUploadAccess(filename, exp), exp)).toBe(false);
  });

  test("buildSignedUploadUrl includes sig and exp query params", () => {
    const url = buildSignedUploadUrl(
      "file.jpg",
      3600,
      "http://localhost:3001/uploads",
    );
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/uploads/file.jpg");
    expect(parsed.searchParams.get("sig")).toBeTruthy();
    expect(parsed.searchParams.get("exp")).toBeTruthy();
    expect(
      verifyUploadSignature(
        "file.jpg",
        parsed.searchParams.get("sig")!,
        Number.parseInt(parsed.searchParams.get("exp")!, 10),
      ),
    ).toBe(true);
  });
});

describe("extractUploadFilename", () => {
  test("parses legacy API host paths", () => {
    expect(
      extractUploadFilename("https://api.example.com/uploads/photo.png?sig=x"),
    ).toBe("photo.png");
  });

  test("parses same-origin /api/uploads paths", () => {
    expect(
      extractUploadFilename("https://cco.example.com/api/uploads/photo.png?sig=x"),
    ).toBe("photo.png");
  });

  test("parses presigned R2 object URLs", () => {
    expect(
      extractUploadFilename(
        "https://2e5c1532f81b48b3a2d2763e11b81ed2.r2.cloudflarestorage.com/cco-uploads-2e5c1532/3c55c577-0a76-4390-9763-57156f.jpeg?X-Amz-Algorithm=AWS4-HMAC-SHA256",
      ),
    ).toBe("3c55c577-0a76-4390-9763-57156f.jpeg");
  });
});

describe("refreshAttachmentUrl", () => {
  test("re-signs stored upload URLs", () => {
    const refreshed = refreshAttachmentUrl(
      "https://api.example.com/uploads/valid.png?sig=old&exp=1",
    );
    expect(refreshed).toContain("/uploads/valid.png");
    expect(refreshed).toContain("sig=");
    expect(refreshed).toContain("exp=");
  });

  test("re-signs legacy presigned R2 URLs to API proxy URLs", () => {
    const prevBucket = process.env.CLOUDFLARE_R2_BUCKET;
    process.env.CLOUDFLARE_R2_BUCKET = "cco-uploads-test";
    try {
      const refreshed = refreshAttachmentUrl(
        "https://abc123.r2.cloudflarestorage.com/cco-uploads-test/photo.png?X-Amz-Algorithm=AWS4-HMAC-SHA256",
      );
      expect(refreshed).toContain("/uploads/photo.png");
      expect(refreshed).toContain("sig=");
      expect(refreshed).toContain("exp=");
    } finally {
      if (prevBucket === undefined) delete process.env.CLOUDFLARE_R2_BUCKET;
      else process.env.CLOUDFLARE_R2_BUCKET = prevBucket;
    }
  });
});

describe("isAllowedAttachmentUrl", () => {
  const publicBase = "http://localhost:3001/uploads";

  test("allows URLs on the configured upload origin", () => {
    const url = buildSignedUploadUrl("photo.png", 3600, publicBase);
    expect(isAllowedAttachmentUrl(url, publicBase)).toBe(true);
  });

  test("rejects external hosts", () => {
    expect(
      isAllowedAttachmentUrl("https://evil.example/photo.png", publicBase),
    ).toBe(false);
  });

  test("rejects paths outside the upload prefix", () => {
    expect(
      isAllowedAttachmentUrl("http://localhost:3001/other/photo.png", publicBase),
    ).toBe(false);
  });

  test("rejects traversal in attachment path", () => {
    expect(
      isAllowedAttachmentUrl(
        "http://localhost:3001/uploads/../etc/passwd",
        publicBase,
      ),
    ).toBe(false);
  });

  test("allows presigned R2 object URLs when R2 storage is enabled", () => {
    const prevBucket = process.env.CLOUDFLARE_R2_BUCKET;
    process.env.CLOUDFLARE_R2_BUCKET = "cco-uploads-test";
    try {
      expect(
        isAllowedAttachmentUrl(
          "https://abc123.r2.cloudflarestorage.com/cco-uploads-test/550e8400-e29b-41d4-a716-446655440000.jpeg?X-Amz-Algorithm=AWS4-HMAC-SHA256",
          publicBase,
        ),
      ).toBe(true);
    } finally {
      if (prevBucket === undefined) delete process.env.CLOUDFLARE_R2_BUCKET;
      else process.env.CLOUDFLARE_R2_BUCKET = prevBucket;
    }
  });
});
