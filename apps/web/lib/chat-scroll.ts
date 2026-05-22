/** Maximum scroll offset for a scrollable element. */
export function maxScrollTop(container: HTMLElement): number {
  return Math.max(0, container.scrollHeight - container.clientHeight);
}

/** Pin the scroll position to the latest messages (bottom of the thread). */
export function scrollMessagesToBottom(container: HTMLElement): void {
  container.scrollTop = maxScrollTop(container);
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
  const t0 = window.setTimeout(run, 0);
  const t1 = window.setTimeout(run, 50);
  const t2 = window.setTimeout(run, 150);

  return () => {
    cancelAnimationFrame(raf1);
    cancelAnimationFrame(raf2);
    window.clearTimeout(t0);
    window.clearTimeout(t1);
    window.clearTimeout(t2);
  };
}
