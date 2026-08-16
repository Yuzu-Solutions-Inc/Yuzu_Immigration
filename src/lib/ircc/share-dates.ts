/** UTC calendar date formatting stable for SSR + client hydration. */
export function formatShareLinkExpiryDate(
  expiresAt: string,
  locale: string,
): string {
  const iso = expiresAt.slice(0, 10);
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  if (locale === "fr") return `${day}/${month}/${year}`;
  return `${month}/${day}/${year}`;
}
