import { cn } from "@/lib/utils";

/** Microsoft Teams mark for integration UI. */
export function MicrosoftTeamsLogo({
  className,
  title = "Microsoft Teams",
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
      <rect width="48" height="48" rx="10" fill="#6264A7" />
      <path
        fill="#fff"
        d="M18.2 14.5h7.4c3.6 0 6.1 2.3 6.1 5.7 0 2.5-1.4 4.4-3.6 5.2l4.2 8.1h-4.2l-3.8-7.5h-2.5V33.5h-3.6V14.5zm3.6 3.2v6.2h3.3c1.9 0 3.1-1.1 3.1-3.1s-1.2-3.1-3.1-3.1h-3.3z"
      />
    </svg>
  );
}
