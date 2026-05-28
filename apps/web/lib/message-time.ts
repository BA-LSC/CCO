const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function localDayKey(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function messageStartsNewDay(
  messages: { createdAt: string }[],
  index: number,
): boolean {
  if (index <= 0) return true;
  return localDayKey(messages[index]!.createdAt) !== localDayKey(messages[index - 1]!.createdAt);
}

export function formatMessageDayDivider(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function formatMessageTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  if (now.getTime() - date.getTime() >= SEVEN_DAYS_MS) {
    const monthDay = date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
    return `${monthDay} at ${time}`;
  }

  const weekday = date.toLocaleDateString(undefined, { weekday: "short" });
  return `${weekday} ${time}`;
}
