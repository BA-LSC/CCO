import { mkdir } from "node:fs/promises";
import {
  buildSignedUploadUrl,
  getUploadDir,
  safeUploadPath,
} from "../lib/uploads";

const GIPHY_API = "https://api.giphy.com/v1/gifs";
const MAX_GIF_BYTES = 15 * 1024 * 1024;

export type GiphyGifResult = {
  id: string;
  title: string;
  previewUrl: string;
  importUrl: string;
  width: number;
  height: number;
};

type GiphyImageSet = {
  url?: string;
  width?: string;
  height?: string;
};

type GiphyApiGif = {
  id: string;
  title: string;
  images: {
    fixed_width?: GiphyImageSet;
    downsized?: GiphyImageSet;
    original?: GiphyImageSet;
  };
};

function giphyApiKey(): string | undefined {
  const key = process.env.GIPHY_API_KEY?.trim();
  return key || undefined;
}

export function isGiphyConfigured(): boolean {
  return Boolean(giphyApiKey());
}

function mapGiphyResult(gif: GiphyApiGif): GiphyGifResult | null {
  const previewUrl = gif.images.fixed_width?.url ?? gif.images.downsized?.url;
  const importUrl =
    gif.images.downsized?.url ?? gif.images.original?.url ?? gif.images.fixed_width?.url;

  if (!previewUrl || !importUrl) return null;

  const width = Number(gif.images.fixed_width?.width ?? gif.images.downsized?.width ?? 0);
  const height = Number(gif.images.fixed_width?.height ?? gif.images.downsized?.height ?? 0);

  return {
    id: gif.id,
    title: gif.title?.trim() || "GIF",
    previewUrl,
    importUrl,
    width: Number.isFinite(width) ? width : 0,
    height: Number.isFinite(height) ? height : 0,
  };
}

async function fetchGiphy(path: string, params: Record<string, string>): Promise<GiphyApiGif[]> {
  const apiKey = giphyApiKey();
  if (!apiKey) {
    throw new Error("Giphy is not configured");
  }

  const search = new URLSearchParams({
    api_key: apiKey,
    rating: "pg",
    ...params,
  });

  const res = await fetch(`${GIPHY_API}/${path}?${search.toString()}`);
  if (!res.ok) {
    throw new Error("Giphy request failed");
  }

  const body = (await res.json()) as { data?: GiphyApiGif[] };
  return body.data ?? [];
}

export async function searchGiphyGifs(
  query: string,
  offset = 0,
): Promise<{ results: GiphyGifResult[]; nextOffset: number }> {
  const trimmed = query.trim();
  if (!trimmed) {
    return listTrendingGiphyGifs(offset);
  }

  const limit = 24;
  const data = await fetchGiphy("search", {
    q: trimmed,
    limit: String(limit),
    offset: String(offset),
  });

  const results = data.map(mapGiphyResult).filter((gif): gif is GiphyGifResult => gif !== null);
  return { results, nextOffset: offset + results.length };
}

export async function listTrendingGiphyGifs(
  offset = 0,
): Promise<{ results: GiphyGifResult[]; nextOffset: number }> {
  const limit = 24;
  const data = await fetchGiphy("trending", {
    limit: String(limit),
    offset: String(offset),
  });

  const results = data.map(mapGiphyResult).filter((gif): gif is GiphyGifResult => gif !== null);
  return { results, nextOffset: offset + results.length };
}

export function isAllowedGiphyMediaUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;

    const host = parsed.hostname.toLowerCase();
    if (host === "giphy.com" || host === "www.giphy.com") {
      return parsed.pathname.includes("/media/");
    }

    return host.endsWith(".giphy.com");
  } catch {
    return false;
  }
}

export async function importGiphyGif(sourceUrl: string): Promise<{ url: string; filename: string }> {
  if (!isAllowedGiphyMediaUrl(sourceUrl)) {
    throw new Error("Invalid GIF URL");
  }

  const res = await fetch(sourceUrl, { redirect: "follow" });
  if (!res.ok) {
    throw new Error("Failed to download GIF");
  }

  const contentType = res.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("gif") && !contentType.includes("image")) {
    throw new Error("Unsupported GIF format");
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length === 0) {
    throw new Error("Empty GIF file");
  }
  if (buffer.length > MAX_GIF_BYTES) {
    throw new Error("GIF is too large");
  }

  await mkdir(getUploadDir(), { recursive: true });

  const filename = `${crypto.randomUUID()}.gif`;
  const dest = safeUploadPath(getUploadDir(), filename);
  if (!dest) {
    throw new Error("Invalid filename");
  }

  await Bun.write(dest, buffer);

  return {
    url: buildSignedUploadUrl(filename),
    filename,
  };
}
