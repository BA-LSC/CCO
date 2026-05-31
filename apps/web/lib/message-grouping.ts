export type MessageGroupPosition = "single" | "first" | "middle" | "last";
export type MessageSpacing = "tight" | "medium";

export type MessageLike = {
  authorId?: string;
  createdAt: string;
};

export type MessageLayoutInfo = {
  showTimestamp: boolean;
  clusterTimestamp: boolean;
  nextHasGapBreak: boolean;
  displayTimestamp: boolean;
  showAuthorName: boolean;
  showAvatar: boolean;
  groupPosition: MessageGroupPosition;
  spacing: MessageSpacing;
};

const FIVE_MINUTES_MS = 5 * 60 * 1000;

function gapMs(earlier: string, later: string): number {
  return new Date(later).getTime() - new Date(earlier).getTime();
}

function messageHasGapBreak(messages: MessageLike[], index: number): boolean {
  if (index <= 0 || index >= messages.length) return false;
  const previous = messages[index - 1];
  return gapMs(previous.createdAt, messages[index].createdAt) >= FIVE_MINUTES_MS;
}

export function getMessageLayoutInfo(
  messages: MessageLike[],
  index: number,
  currentUserId?: string,
  previousLayouts?: MessageLayoutInfo[],
  callBreakAfterIndices?: ReadonlySet<number>,
): MessageLayoutInfo {
  const message = messages[index];
  const previous = index > 0 ? messages[index - 1] : null;
  const next = index < messages.length - 1 ? messages[index + 1] : null;
  const previousLayout = index > 0 ? previousLayouts?.[index - 1] ?? null : null;

  const gapFromPrevious = previous ? gapMs(previous.createdAt, message.createdAt) : Infinity;
  const gapToNext = next ? gapMs(message.createdAt, next.createdAt) : Infinity;

  const sameAuthorAsPrevious = Boolean(previous && previous.authorId === message.authorId);
  const sameAuthorAsNext = Boolean(next && next.authorId === message.authorId);

  const isOwn = Boolean(currentUserId && message.authorId === currentUserId);

  const hasGapBreak = messageHasGapBreak(messages, index);
  const nextHasGapBreak = next !== null && messageHasGapBreak(messages, index + 1);

  let spacing: MessageSpacing = "medium";
  if (previous && sameAuthorAsPrevious && gapFromPrevious < FIVE_MINUTES_MS) {
    spacing = "tight";
  }

  const showAuthorName =
    !isOwn &&
    (!previous ||
      previous.authorId !== message.authorId ||
      gapFromPrevious >= FIVE_MINUTES_MS);
  const showAvatar = showAuthorName;

  const hasCallBreakFromPrevious = callBreakAfterIndices?.has(index) ?? false;
  const hasCallBreakToNext = callBreakAfterIndices?.has(index + 1) ?? false;

  const connectedToPrevious =
    sameAuthorAsPrevious &&
    spacing === "tight" &&
    !hasGapBreak &&
    !previousLayout?.nextHasGapBreak &&
    !hasCallBreakFromPrevious;
  const connectedToNext =
    sameAuthorAsNext && gapToNext < FIVE_MINUTES_MS && !hasCallBreakToNext;

  let groupPosition: MessageGroupPosition = "single";
  if (connectedToPrevious && connectedToNext) {
    groupPosition = "middle";
  } else if (connectedToPrevious) {
    groupPosition = "last";
  } else if (connectedToNext) {
    groupPosition = "first";
  }

  const clusterTimestamp = hasGapBreak;

  return {
    showTimestamp: hasGapBreak,
    clusterTimestamp,
    nextHasGapBreak,
    displayTimestamp: clusterTimestamp,
    showAuthorName,
    showAvatar,
    groupPosition,
    spacing,
  };
}

export function buildMessageLayoutInfos(
  messages: MessageLike[],
  currentUserId?: string,
  callBreakAfterIndices?: ReadonlySet<number>,
): MessageLayoutInfo[] {
  const layouts: MessageLayoutInfo[] = [];
  for (let index = 0; index < messages.length; index += 1) {
    layouts.push(
      getMessageLayoutInfo(messages, index, currentUserId, layouts, callBreakAfterIndices),
    );
  }
  return layouts;
}
