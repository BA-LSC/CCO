import { GENERATED_EMOJI_PICKER_GROUPS } from "./emoji-picker-data.generated";

export const QUICK_REACTION_EMOJIS = ["👍", "❤️", "😂"] as const;

export const RECENT_EMOJI_GROUP_LABEL = "Recents";

export type EmojiPickerGroup = {
  label: string;
  keywords: readonly string[];
  emojis: readonly string[];
};

export const EMOJI_PICKER_GROUPS: readonly EmojiPickerGroup[] = GENERATED_EMOJI_PICKER_GROUPS;

function groupMatchesQuery(
  group: (typeof GENERATED_EMOJI_PICKER_GROUPS)[number],
  query: string,
): boolean {
  if (group.label.toLowerCase().includes(query)) return true;
  return group.keywords.some((keyword) => keyword.includes(query));
}

function emojiMatchesQuery(
  group: (typeof GENERATED_EMOJI_PICKER_GROUPS)[number],
  index: number,
  query: string,
): boolean {
  if (group.emojis[index]?.includes(query)) return true;
  return group.searchTexts[index]?.includes(query) ?? false;
}

export function filterEmojiPickerGroups(query: string): EmojiPickerGroup[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return EMOJI_PICKER_GROUPS.map((group) => ({
      label: group.label,
      keywords: group.keywords,
      emojis: [...group.emojis],
    }));
  }

  return GENERATED_EMOJI_PICKER_GROUPS.flatMap((group) => {
    const matchesGroup = groupMatchesQuery(group, normalized);
    const emojis = matchesGroup
      ? [...group.emojis]
      : group.emojis.filter((_, index) => emojiMatchesQuery(group, index, normalized));

    if (emojis.length === 0) return [];

    return [{
      label: group.label,
      keywords: group.keywords,
      emojis,
    }];
  });
}

function filterRecentEmojis(query: string, recents: readonly string[]): string[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [...recents];

  const visible = new Set(filterEmojiPickerGroups(query).flatMap((group) => group.emojis));
  return recents.filter((emoji) => visible.has(emoji) || emoji.includes(normalized));
}

export function buildEmojiPickerGroups(query: string, recents: readonly string[]): EmojiPickerGroup[] {
  const recentEmojis = filterRecentEmojis(query, recents);
  const groups = filterEmojiPickerGroups(query);

  if (recentEmojis.length === 0) return groups;

  return [
    {
      label: RECENT_EMOJI_GROUP_LABEL,
      keywords: ["recent", "recents"],
      emojis: recentEmojis,
    },
    ...groups,
  ];
}
