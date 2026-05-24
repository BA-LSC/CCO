export const SECRET_MASK_LINE = "••••••••";

export function secretMaskLines(lineCount = 1): string {
  return Array(Math.max(1, lineCount)).fill(SECRET_MASK_LINE).join("\n");
}
