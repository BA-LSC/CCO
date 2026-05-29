export function formatTypingLabel(displayNames: string[]): string | null {
  const names = displayNames.map((name) => name.trim()).filter(Boolean);
  if (names.length === 0) return null;
  if (names.length === 1) return `${names[0]} is typing`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing`;
  return "Several people are typing";
}
