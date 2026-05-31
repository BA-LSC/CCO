/**
 * Normalize phone camera picks (often HEIC or missing MIME) into JPEG for upload and preview.
 */
const MAX_MEDIA_BYTES = 95 * 1024 * 1024;

const BROWSER_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

const LEGACY_MIME_ALIASES: Record<string, string> = {
  "image/x-png": "image/png",
  "image/pjpeg": "image/jpeg",
};

function stripMimeParameters(type: string): string {
  return type.split(";")[0]?.trim().toLowerCase() ?? "";
}

/** Resolve a browser-native image MIME from type and/or filename extension. */
export function resolveBrowserImageMimeType(file: File): string | null {
  const raw = stripMimeParameters(file.type);
  const aliased = LEGACY_MIME_ALIASES[raw] ?? raw;
  if (BROWSER_IMAGE_TYPES.has(aliased)) return aliased;

  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext && MIME_BY_EXT[ext]) return MIME_BY_EXT[ext];

  return null;
}

export function isHeicImageFile(file: File): boolean {
  const type = file.type.toLowerCase();
  if (type === "image/heic" || type === "image/heif") return true;
  return /\.(heic|heif)$/i.test(file.name);
}

async function convertHeicToJpeg(file: File): Promise<File> {
  const { default: heic2any } = await import("heic2any");
  const result = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.92,
  });
  const blob = Array.isArray(result) ? result[0] : result;
  if (!blob) throw new Error("Could not convert HEIC image");

  const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
  return new File([blob], `${baseName}.jpeg`, { type: "image/jpeg" });
}

async function convertImageBitmapToJpeg(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not process image");

    ctx.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error("Could not convert image"))),
        "image/jpeg",
        0.92,
      );
    });

    const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${baseName}.jpeg`, { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}

export async function prepareImageForUpload(file: File): Promise<File> {
  if (file.size > MAX_MEDIA_BYTES) {
    throw new Error("File must be 95MB or smaller.");
  }

  if (isHeicImageFile(file)) {
    return convertHeicToJpeg(file);
  }

  const resolvedType = resolveBrowserImageMimeType(file);
  if (resolvedType) {
    if (file.type === resolvedType) return file;
    return new File([file], file.name, { type: resolvedType });
  }

  return convertImageBitmapToJpeg(file);
}
