/**
 * Normalize phone camera picks (often HEIC or missing MIME) into JPEG for upload.
 */
const MAX_MEDIA_BYTES = 95 * 1024 * 1024;

export async function prepareImageForUpload(file: File): Promise<File> {
  if (file.size > MAX_MEDIA_BYTES) {
    throw new Error("File must be 95MB or smaller.");
  }

  const allowed = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
  if (allowed.has(file.type)) return file;

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
