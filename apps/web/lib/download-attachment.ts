import { extractUploadFilename } from "./attachment-url";

function downloadFilename(src: string, alt: string): string {
  const fromUrl = extractUploadFilename(src);
  if (fromUrl) return fromUrl;

  const trimmed = alt.trim();
  if (trimmed && trimmed.toLowerCase() !== "shared image") {
    return trimmed.replace(/\s+/g, "-").toLowerCase();
  }

  return "image.jpeg";
}

/** Fetch a chat attachment and save it to the user's device. */
export async function downloadAttachment(src: string, alt: string): Promise<void> {
  const response = await fetch(src, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`Download failed (${response.status})`);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const filename = downloadFilename(src, alt);

  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename.includes(".") ? filename : `${filename}.jpeg`;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
