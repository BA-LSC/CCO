export function getEmojiDisplayTier(emoji: string): "simple" | "compound" | "long" {
  if (!emoji.includes("\u200d")) return "simple";

  const zwjCount = emoji.split("\u200d").length - 1;
  return zwjCount >= 2 ? "long" : "compound";
}

export function getEmojiDisplayClass(
  emoji: string,
  prefix: "message-emoji-picker-emoji" | "message-reaction-emoji",
): string {
  const tier = getEmojiDisplayTier(emoji);
  if (tier === "simple") return prefix;
  return `${prefix} ${prefix}--${tier}`;
}
