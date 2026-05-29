"use client";

import { useEffect, useRef, useState } from "react";
import { UserAvatar } from "@/components/UserAvatar";
import { apiFetch, uploadImage } from "@/lib/api";

type Props = {
  conversationId: string;
  title: string;
  imageUrl?: string | null;
  onUpdated: (updates: { title?: string; imageUrl?: string | null }) => void;
};

export function DmGroupSettings({ conversationId, title, imageUrl, onUpdated }: Props) {
  const [editTitle, setEditTitle] = useState(title);
  const [savingTitle, setSavingTitle] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditTitle(title);
  }, [title]);

  async function saveTitle(nextTitle: string) {
    const trimmed = nextTitle.trim();
    if (!trimmed || trimmed === title.trim()) return;
    setSavingTitle(true);
    setError(null);
    try {
      const result = await apiFetch<{ title: string; imageUrl: string | null }>(
        `/api/v1/dms/${conversationId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ title: trimmed }),
        },
      );
      onUpdated({ title: result.title, imageUrl: result.imageUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save group name");
      setEditTitle(title);
    } finally {
      setSavingTitle(false);
    }
  }

  async function handleImageSelected(file: File | undefined) {
    if (!file) return;
    setUploadingImage(true);
    setError(null);
    try {
      const url = await uploadImage(file);
      const result = await apiFetch<{ title: string; imageUrl: string | null }>(
        `/api/v1/dms/${conversationId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ imageUrl: url }),
        },
      );
      onUpdated({ title: result.title, imageUrl: result.imageUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update group photo");
    } finally {
      setUploadingImage(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removePhoto() {
    setUploadingImage(true);
    setError(null);
    try {
      const result = await apiFetch<{ title: string; imageUrl: string | null }>(
        `/api/v1/dms/${conversationId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ imageUrl: null }),
        },
      );
      onUpdated({ title: result.title, imageUrl: result.imageUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove photo");
    } finally {
      setUploadingImage(false);
    }
  }

  return (
    <section className="channel-settings-group" aria-label="Group settings">
      <div className="channel-settings-group-intro">
        <h3 className="channel-settings-group-label">Group settings</h3>
        <p className="channel-settings-group-desc">
          Anyone in this group can change the name and photo.
        </p>
      </div>

      <div className="channel-settings-card dm-group-settings-card">
        <div className="dm-group-settings-avatar-row">
          <UserAvatar
            displayName={editTitle || title}
            avatarUrl={imageUrl}
            className="dm-group-settings-avatar"
          />
          <div className="dm-group-settings-avatar-actions">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif"
              hidden
              disabled={uploadingImage}
              onChange={(event) => void handleImageSelected(event.target.files?.[0])}
            />
            <button
              type="button"
              className="link-btn"
              disabled={uploadingImage}
              onClick={() => fileRef.current?.click()}
            >
              {uploadingImage ? "Uploading…" : imageUrl ? "Change photo" : "Add photo"}
            </button>
            {imageUrl ? (
              <button
                type="button"
                className="link-btn"
                disabled={uploadingImage}
                onClick={() => void removePhoto()}
              >
                Remove photo
              </button>
            ) : null}
          </div>
        </div>

        <label className="channel-settings-field">
          <span className="channel-settings-field-label">Group name</span>
          <input
            type="text"
            value={editTitle}
            disabled={savingTitle}
            onChange={(event) => setEditTitle(event.target.value)}
            onBlur={() => void saveTitle(editTitle)}
            aria-label="Group name"
          />
        </label>
      </div>

      {error ? (
        <p className="channel-settings-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
