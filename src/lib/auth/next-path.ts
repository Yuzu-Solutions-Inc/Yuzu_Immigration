/** Allow only same-origin relative paths (open-redirect guard). */
export function safeInternalPath(
  value: unknown,
  fallback: string,
): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return fallback;
  if (trimmed.startsWith("//") || trimmed.includes("://")) return fallback;
  if (trimmed.includes("\\")) return fallback;
  return trimmed;
}
