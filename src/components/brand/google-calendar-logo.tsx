import { cn } from "@/lib/utils";

/** Official-style Google Calendar mark for integration UI. */
export function GoogleCalendarLogo({
  className,
  title = "Google Calendar",
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
      <path
        fill="#fff"
        d="M9 6h30a3 3 0 0 1 3 3v30a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3z"
      />
      <path fill="#1A73E8" d="M6 9a3 3 0 0 1 3-3h30a3 3 0 0 1 3 3v5H6V9z" />
      <path fill="#EA4335" d="M39 14h3v25a3 3 0 0 1-3 3V14z" />
      <path fill="#34A853" d="M6 33h3v9a3 3 0 0 1-3-3v-6z" />
      <path fill="#FBBC04" d="M6 14h3v19H6z" />
      <path fill="#188038" d="M9 39h30v3H9z" />
      <circle cx="15.5" cy="10" r="1.6" fill="#fff" />
      <circle cx="32.5" cy="10" r="1.6" fill="#fff" />
      <path
        fill="#1A73E8"
        d="M17.1 33.5V21.2h-1.9l-2.8 1.5v2l2.5-1.2h.1v10h2.1zm5.8.2c2.4 0 4-1.5 4-3.7 0-2.1-1.5-3.5-3.7-3.5-1.3 0-2.3.5-2.9 1.3l1.4 1.1c.3-.5 1-.9 1.6-.9 1 0 1.7.7 1.7 1.9s-.7 2-1.8 2c-.5 0-1-.2-1.3-.5l-.4 1.6c.5.3 1.1.5 1.8.5zm8.6.1c2.6 0 4.2-1.7 4.2-4.1s-1.6-4.1-4.2-4.1-4.2 1.7-4.2 4.1 1.6 4.1 4.2 4.1zm0-1.7c-1.3 0-2.1-1-2.1-2.4s.8-2.4 2.1-2.4 2.1 1 2.1 2.4-.8 2.4-2.1 2.4z"
      />
    </svg>
  );
}
