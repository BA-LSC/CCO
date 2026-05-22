export const NOTIFICATION_ANCHOR_QUERY = "anchorUnread";

export function appendNotificationAnchorToUrl(url: string): string {
  const [path, hash = ""] = url.split("#");
  const [pathname, search = ""] = path.split("?");
  const params = new URLSearchParams(search);
  params.set(NOTIFICATION_ANCHOR_QUERY, "1");
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
}
