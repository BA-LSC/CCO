const ALLOWED_VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const MAX_MEDIA_BYTES = 95 * 1024 * 1024;

function inferVideoMimeType(file: File): string | null {
  if (file.type && ALLOWED_VIDEO_TYPES.has(file.type)) return file.type;

  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "mp4") return "video/mp4";
  if (ext === "webm") return "video/webm";
  if (ext === "mov") return "video/quicktime";

  return null;
}

/** Validate phone/desktop video picks before upload. */
export async function prepareVideoForUpload(file: File): Promise<File> {
  const mime = inferVideoMimeType(file);
  if (!mime) {
    throw new Error("Unsupported video type. Use MP4, WebM, or MOV.");
  }

  if (file.size > MAX_MEDIA_BYTES) {
    throw new Error("File must be 95MB or smaller.");
  }

  if (file.type === mime) return file;
  return new File([file], file.name, { type: mime });
}
