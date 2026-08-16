import { cn } from "@/lib/utils";

/** Zoom mark for meeting integration UI. */
export function ZoomLogo({
  className,
  title = "Zoom",
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
      <rect width="48" height="48" rx="10" fill="#2D8CFF" />
      <path
        fill="#fff"
        d="M10 18.5h16.5c1.4 0 2.5 1.1 2.5 2.5v9.5H14c-2.2 0-4-1.8-4-4v-8zm21.2 2.4 6.3-3.2c.7-.4 1.5.1 1.5.9v11.8c0 .8-.8 1.3-1.5.9l-6.3-3.2v-7.2z"
      />
    </svg>
  );
}
