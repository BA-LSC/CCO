export type ByteRange = { start: number; end: number };

export function parseByteRangeHeader(
  rangeHeader: string | undefined,
  size: number,
): ByteRange | "unsatisfiable" | null {
  if (!rangeHeader || size <= 0) return null;

  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match) return null;

  let start = match[1] ? Number.parseInt(match[1], 10) : 0;
  let end = match[2] ? Number.parseInt(match[2], 10) : size - 1;

  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  if (match[1] === "" && match[2] !== "") {
    const suffixLength = end;
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  }

  if (start < 0 || start >= size || end < start) return "unsatisfiable";
  end = Math.min(end, size - 1);
  return { start, end };
}
