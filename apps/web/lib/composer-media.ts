export const COMPOSER_MEDIA_MAX_BYTES = 95 * 1024 * 1024;

export type ComposerMediaKind = "image" | "video";

export type PendingComposerMedia = {
  file: File;
  previewUrl: string;
  kind: ComposerMediaKind;
};

export function inferComposerMediaKind(file: File): ComposerMediaKind | null {
  if (file.type.startsWith("video/") || /\.(mp4|webm|mov)$/i.test(file.name)) {
    return "video";
  }
  if (file.type.startsWith("image/") || /\.(jpe?g|png|gif|webp)$/i.test(file.name)) {
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
  for (const file of Array.from(dataTransfer.files)) {
    if (isComposerMediaFile(file)) return file;
  }
  return null;
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

export function createPendingComposerMedia(file: File): PendingComposerMedia | null {
  const error = validateComposerMediaFile(file);
  if (error) return null;

  const kind = inferComposerMediaKind(file);
  if (!kind) return null;

  return {
    file,
    kind,
    previewUrl: URL.createObjectURL(file),
  };
}

export function revokePendingComposerMedia(media: PendingComposerMedia | null): void {
  if (media?.previewUrl) URL.revokeObjectURL(media.previewUrl);
}
