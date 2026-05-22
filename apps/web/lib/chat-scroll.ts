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
