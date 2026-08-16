import { cn } from "@/lib/utils";

/** Google Meet camera mark for integration UI. */
export function GoogleMeetLogo({
  className,
  title = "Google Meet",
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
      <path fill="#00832D" d="M8 14h16v20H8z" />
      <path fill="#0066DA" d="M24 14h8v8h-8z" />
      <path fill="#E94235" d="M24 30h8v4h-8z" />
      <path fill="#FFBA00" d="M32 22h8v8h-8z" />
      <path fill="#2684FC" d="M32 14l8 8h-8z" />
      <path fill="#00AC47" d="M32 30l8-8v8z" />
    </svg>
  );
}
