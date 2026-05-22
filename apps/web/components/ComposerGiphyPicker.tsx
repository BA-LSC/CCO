"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, type GiphyGifResult } from "@/lib/api";

type Props = {
  open: boolean;
  disabled?: boolean;
  onClose: () => void;
  onSelect: (gif: GiphyGifResult) => void | Promise<void>;
};

export function ComposerGiphyPicker({ open, disabled, onClose, onSelect }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GiphyGifResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const loadResults = useCallback(async (searchQuery: string, offset = 0, append = false) => {
    if (offset === 0) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    setError(null);

    try {
      const path =
        searchQuery.trim().length > 0
          ? `/api/v1/giphy/search?q=${encodeURIComponent(searchQuery.trim())}&offset=${offset}`
          : `/api/v1/giphy/trending?offset=${offset}`;
      const data = await apiFetch<{ results: GiphyGifResult[]; nextOffset: number }>(path);

      setResults((prev) => (append ? [...prev, ...data.results] : data.results));
      setNextOffset(data.nextOffset);
      setHasMore(data.results.length > 0);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load GIFs";
      if (message.includes("not configured") || message.includes("(503)")) {
        setError("Giphy search is not configured yet. Ask your administrator to add a GIPHY API key.");
      } else {
        setError(message);
      }
      if (!append) setResults([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;

    setQuery("");
    setResults([]);
    setNextOffset(0);
    setHasMore(false);
    setError(null);
    void loadResults("", 0, false);

    const focusTimer = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [loadResults, open]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return;

    const timer = window.setTimeout(() => {
      void loadResults(query, 0, false);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [loadResults, open, query]);

  async function handleSelect(gif: GiphyGifResult) {
    if (disabled || sendingId) return;
    setSendingId(gif.id);
    setError(null);
    try {
      await onSelect(gif);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send GIF");
    } finally {
      setSendingId(null);
    }
  }

  if (!open) return null;

  return (
    <div className="composer-giphy-picker" ref={panelRef} role="dialog" aria-label="Search GIFs">
      <div className="composer-giphy-picker-header">
        <input
          ref={searchRef}
          type="search"
          className="composer-giphy-search"
          placeholder="Search Giphy…"
          value={query}
          disabled={disabled || Boolean(sendingId)}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search Giphy"
        />
        <button
          type="button"
          className="composer-giphy-close"
          aria-label="Close GIF search"
          disabled={Boolean(sendingId)}
          onClick={onClose}
        >
          ×
        </button>
      </div>

      {error && (
        <p className="composer-giphy-error" role="alert">
          {error}
        </p>
      )}

      <div className="composer-giphy-grid-wrap">
        {loading ? (
          <p className="composer-giphy-status">Loading GIFs…</p>
        ) : results.length === 0 ? (
          <p className="composer-giphy-status">No GIFs found.</p>
        ) : (
          <div className="composer-giphy-grid">
            {results.map((gif) => (
              <button
                key={gif.id}
                type="button"
                className="composer-giphy-item"
                disabled={disabled || sendingId === gif.id}
                aria-label={`Send ${gif.title}`}
                onClick={() => void handleSelect(gif)}
              >
                <img src={gif.previewUrl} alt="" loading="lazy" draggable={false} />
              </button>
            ))}
          </div>
        )}
      </div>

      {hasMore && !loading && (
        <div className="composer-giphy-footer">
          <button
            type="button"
            className="link-btn"
            disabled={loadingMore || disabled || Boolean(sendingId)}
            onClick={() => void loadResults(query, nextOffset, true)}
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}

      <p className="composer-giphy-attribution">
        Powered by <span>GIPHY</span>
      </p>
    </div>
  );
}
