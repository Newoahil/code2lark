export function configuredValue(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed || isPlaceholderValue(trimmed)) return "";
  return trimmed;
}

export function isPlaceholderValue(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^<[^>\r\n]+>$/.test(trimmed)
    || /^\{\{[^}\r\n]+\}\}$/.test(trimmed)
    || /^\$\{[^}\r\n]+\}$/.test(trimmed)
    || /^(todo|tbd|changeme|change-me|replace-me|placeholder|dummy)$/i.test(trimmed)
    || /^(your|replace|fill|insert)[-_ ]?[a-z0-9_-]*$/i.test(trimmed);
}
