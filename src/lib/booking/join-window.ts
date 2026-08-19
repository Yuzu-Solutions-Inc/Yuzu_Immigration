const JOIN_WINDOW_MS = 60 * 60 * 1000;

/** Join link when now is within 1 hour before start through 1 hour after end. */
export function meetingJoinUrl({
  url,
  startsAt,
  endsAt,
  status,
  now = Date.now(),
}: {
  url: string | null | undefined;
  startsAt: string;
  endsAt?: string | null;
  status?: string | null;
  now?: number;
}): string | null {
  if (status === "cancelled" || status === "no_show") return null;
  if (!url?.startsWith("https://")) return null;
  const start = Date.parse(startsAt);
  if (!Number.isFinite(start)) return null;
  const parsedEnd = endsAt ? Date.parse(endsAt) : Number.NaN;
  const end = Number.isFinite(parsedEnd) ? parsedEnd : start;
  if (now < start - JOIN_WINDOW_MS || now > end + JOIN_WINDOW_MS) {
    return null;
  }
  return url;
}
