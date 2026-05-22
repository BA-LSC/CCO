/** Maximum scroll offset for a scrollable element. */
export function maxScrollTop(container: HTMLElement): number {
  return Math.max(0, container.scrollHeight - container.clientHeight);
}

/** Pin the scroll position to the latest messages (bottom of the thread). */
export function scrollMessagesToBottom(container: HTMLElement): void {
  container.scrollTop = maxScrollTop(container);
}

/** Scroll so `target` sits below the top edge of `container` (no smooth centering jump). */
export function scrollContainerToElement(
  container: HTMLElement,
  target: HTMLElement,
  insetTop = 24,
): void {
  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  container.scrollTop = Math.max(
    0,
    targetRect.top - containerRect.top + container.scrollTop - insetTop,
  );
}

/**
 * Scroll to the bottom on the next frames — content height often settles after paint
 * (composer resize, reactions row, images, flex layout).
 */
export function scheduleScrollMessagesToBottom(container: HTMLElement): () => void {
  const run = () => scrollMessagesToBottom(container);

  run();
  const raf1 = requestAnimationFrame(run);
  const raf2 = requestAnimationFrame(() => requestAnimationFrame(run));

  return () => {
    cancelAnimationFrame(raf1);
    cancelAnimationFrame(raf2);
  };
}

function pinIfNeeded(container: HTMLElement, shouldPin: () => boolean): void {
  if (shouldPin()) scrollMessagesToBottom(container);
}

function schedulePinIfNeeded(container: HTMLElement, shouldPin: () => boolean): void {
  if (!shouldPin()) return;
  scheduleScrollMessagesToBottom(container);
}

/**
 * Re-pin to the bottom when images decode/resize — list ResizeObserver alone can lag
 * a frame behind img load, which shows as a small upward jump on open/reload.
 */
export function observePinnedScrollContent(
  container: HTMLElement,
  shouldPin: () => boolean,
): () => void {
  const trackedImages = new WeakSet<HTMLImageElement>();
  const imageResizeObserver = new ResizeObserver(() => {
    schedulePinIfNeeded(container, shouldPin);
  });

  const trackImage = (img: HTMLImageElement) => {
    if (trackedImages.has(img)) return;
    trackedImages.add(img);
    imageResizeObserver.observe(img);
    const onReady = () => schedulePinIfNeeded(container, shouldPin);
    if (img.complete) {
      onReady();
      return;
    }
    img.addEventListener("load", onReady, { once: true });
    img.addEventListener("error", onReady, { once: true });
  };

  const onCaptureLoad = (event: Event) => {
    if (!(event.target instanceof HTMLImageElement)) return;
    if (!container.contains(event.target)) return;
    schedulePinIfNeeded(container, shouldPin);
  };

  container.addEventListener("load", onCaptureLoad, true);
  container.querySelectorAll("img").forEach((img) => trackImage(img));

  const mutationObserver = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof HTMLImageElement) trackImage(node);
        else if (node instanceof HTMLElement) {
          node.querySelectorAll("img").forEach((img) => trackImage(img));
        }
      }
    }
  });
  mutationObserver.observe(container, { childList: true, subtree: true });

  pinIfNeeded(container, shouldPin);

  return () => {
    container.removeEventListener("load", onCaptureLoad, true);
    imageResizeObserver.disconnect();
    mutationObserver.disconnect();
  };
}
