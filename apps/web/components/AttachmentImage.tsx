"use client";

import { useCallback, useEffect, useRef, useState, type ImgHTMLAttributes, type SyntheticEvent } from "react";
import {
  fetchUploadImageBlobUrl,
  resolveUploadAttachmentImageSrc,
  uploadImageSrcNeedsCredentialFetch,
} from "@/lib/attachment-image-src";
import { isCcoUploadDisplaySrc } from "@/lib/attachment-url";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string;
};

export function AttachmentImage({ src, onError, ...props }: Props) {
  const [displaySrc, setDisplaySrc] = useState(src);
  const retriedRef = useRef(false);
  const srcRef = useRef(src);

  useEffect(() => {
    srcRef.current = src;
    retriedRef.current = false;
    let cancelled = false;

    if (!uploadImageSrcNeedsCredentialFetch(src)) {
      setDisplaySrc(src);
      return;
    }

    setDisplaySrc(src);
    void resolveUploadAttachmentImageSrc(src).then((resolved) => {
      if (!cancelled && resolved) setDisplaySrc(resolved);
    });

    return () => {
      cancelled = true;
    };
  }, [src]);

  const handleError = useCallback(
    (event: SyntheticEvent<HTMLImageElement, Event>) => {
      onError?.(event);
      const current = srcRef.current;
      if (retriedRef.current || !current || !isCcoUploadDisplaySrc(current)) return;
      retriedRef.current = true;
      void fetchUploadImageBlobUrl(current).then((blobUrl) => {
        if (blobUrl) setDisplaySrc(blobUrl);
      });
    },
    [onError],
  );

  return <img {...props} src={displaySrc} onError={handleError} />;
}
