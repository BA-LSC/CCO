import { prepareImageForUpload } from "@/lib/prepare-image-upload";

export const COMPOSER_MEDIA_MAX_BYTES = 95 * 1024 * 1024;

export type ComposerMediaKind = "image" | "video";

export type PendingComposerMedia = {
  id: string;
  file: File;
  previewUrl: string;
  kind: ComposerMediaKind;
};

export function inferComposerMediaKind(file: File): ComposerMediaKind | null {
  if (file.type.startsWith("video/") || /\.(mp4|webm|mov)$/i.test(file.name)) {
    return "video";
  }
  if (
    file.type.startsWith("image/") ||
    /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(file.name)
  ) {
    return "image";
  }
  return null;
}

export function isComposerMediaFile(file: File): boolean {
  return inferComposerMediaKind(file) !== null;
}

export function dragEventHasMediaFiles(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  return dataTransfer.types.includes("Files");
}

export function firstMediaFileFromDataTransfer(dataTransfer: DataTransfer): File | null {
  return mediaFilesFromDataTransfer(dataTransfer)[0] ?? null;
}

export function mediaFilesFromDataTransfer(dataTransfer: DataTransfer): File[] {
  return Array.from(dataTransfer.files).filter(isComposerMediaFile);
}

export function validateComposerMediaFile(file: File): string | null {
  if (!inferComposerMediaKind(file)) {
    return "Unsupported file type. Use an image or video.";
  }
  if (file.size > COMPOSER_MEDIA_MAX_BYTES) {
    return "File must be 95MB or smaller.";
  }
  return null;
}

export async function createPendingComposerMedia(
  file: File,
): Promise<PendingComposerMedia | null> {
  const error = validateComposerMediaFile(file);
  if (error) return null;

  const kind = inferComposerMediaKind(file);
  if (!kind) return null;

  const preparedFile = kind === "image" ? await prepareImageForUpload(file) : file;

  return {
    id: crypto.randomUUID(),
    file: preparedFile,
    kind,
    previewUrl: URL.createObjectURL(preparedFile),
  };
}

export function revokePendingComposerMedia(media: PendingComposerMedia | null): void {
  if (media?.previewUrl) URL.revokeObjectURL(media.previewUrl);
}

export function revokePendingComposerMediaList(items: PendingComposerMedia[]): void {
  for (const item of items) {
    revokePendingComposerMedia(item);
  }
}
