"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ImgHTMLAttributes,
  type SyntheticEvent,
} from "react";
import {
  fetchUploadImageBlobUrl,
  uploadImageSrcNeedsCredentialFetch,
} from "@/lib/attachment-image-src";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string;
};

export function AttachmentImage({ src, onError, className, alt, ...props }: Props) {
  const [displaySrc, setDisplaySrc] = useState(() => {
    if (!uploadImageSrcNeedsCredentialFetch(src)) return src;
    return "";
  });
  const retriedRef = useRef(false);
  const srcRef = useRef(src);
  const prevSrcRef = useRef(src);

  useEffect(() => {
    const previous = prevSrcRef.current;
    prevSrcRef.current = src;
    srcRef.current = src;
    retriedRef.current = false;
    let cancelled = false;

    if (!uploadImageSrcNeedsCredentialFetch(src)) {
      setDisplaySrc(src);
      return;
    }

    if (previous.startsWith("blob:") && previous !== src) {
      setDisplaySrc(previous);
    } else {
      setDisplaySrc("");
    }

    void fetchUploadImageBlobUrl(src).then((blobUrl) => {
      if (!cancelled && blobUrl) setDisplaySrc(blobUrl);
    });

    return () => {
      cancelled = true;
    };
  }, [src]);

  const handleError = useCallback(
    (event: SyntheticEvent<HTMLImageElement, Event>) => {
      onError?.(event);
      const current = srcRef.current;
      if (retriedRef.current || !current || !uploadImageSrcNeedsCredentialFetch(current)) return;
      retriedRef.current = true;
      void fetchUploadImageBlobUrl(current).then((blobUrl) => {
        if (blobUrl) setDisplaySrc(blobUrl);
      });
    },
    [onError],
  );

  if (!displaySrc) {
    return (
      <span
        className={className}
        aria-label={typeof alt === "string" ? alt : undefined}
        role="img"
      />
    );
  }

  return (
    <img
      {...props}
      src={displaySrc}
      alt={alt}
      className={className}
      onError={handleError}
    />
  );
}
