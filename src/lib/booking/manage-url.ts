export function bookingManageUrls(
  origin: string,
  locale: string,
  token: string,
) {
  const manageUrl = `${origin.replace(/\/$/, "")}/${locale}/booking/${encodeURIComponent(token)}`;
  return {
    manageUrl,
    cancelUrl: `${manageUrl}?action=cancel`,
  };
}

export function isSafeManageUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:") return true;
    return (
      parsed.protocol === "http:" &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}
