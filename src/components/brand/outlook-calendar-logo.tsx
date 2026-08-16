import { cn } from "@/lib/utils";

/** Microsoft Outlook mark for calendar integration UI. */
export function OutlookCalendarLogo({
  className,
  title = "Outlook Calendar",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      role="img"
      aria-label={title}
      className={cn("size-10 shrink-0", className)}
    >
      <title>{title}</title>
      <rect width="48" height="48" rx="8" fill="#0F6CBD" />
      <path fill="#fff" d="M10 12h28a2 2 0 0 1 2 2v20a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V14a2 2 0 0 1 2-2z" />
      <path fill="#0F6CBD" d="M8 14h32v6H8z" />
      <circle cx="16" cy="17" r="1.6" fill="#fff" />
      <circle cx="32" cy="17" r="1.6" fill="#fff" />
      <path
        fill="#0F6CBD"
        d="M16 26h16v2H16zm0 5h10v2H16z"
        opacity="0.85"
      />
    </svg>
  );
}
