import { cn } from "@/lib/utils";

/** Official-style Square mark for integration UI. */
export function SquareLogo({
  className,
  title = "Square",
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
      <rect width="48" height="48" rx="10" fill="#000" />
      <rect
        x="12"
        y="12"
        width="24"
        height="24"
        rx="4.5"
        fill="none"
        stroke="#fff"
        strokeWidth="4"
      />
    </svg>
  );
}
