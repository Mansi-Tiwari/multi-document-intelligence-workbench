const BYTE_UNITS = ["B", "KB", "MB", "GB"] as const;

/** Human-readable size using binary multiples (1 KB = 1024 B), e.g. `1.5 MB`. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const unit = BYTE_UNITS[unitIndex] ?? "B";
  const rounded = unitIndex === 0 || value >= 10 ? Math.round(value).toString() : value.toFixed(1).replace(/\.0$/, "");
  return `${rounded} ${unit}`;
}

const integerFormat = new Intl.NumberFormat("en-US");

export function formatCount(value: number): string {
  return integerFormat.format(value);
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatCount(count)} ${count === 1 ? singular : plural}`;
}
