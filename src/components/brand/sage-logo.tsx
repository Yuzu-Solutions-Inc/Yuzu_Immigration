import { cn } from "@/lib/utils";

/** Sage Accounting mark for payment settings. */
export function SageLogo({
  className,
  title = "Sage",
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
      <rect width="48" height="48" rx="10" fill="#00DC00" />
      <path
        d="M14.5 30.5c1.7 3.2 5.3 5.2 9.5 5.2 6.1 0 10.5-3.6 10.5-8.3 0-4.1-2.9-6.4-9.1-8.1-4.1-1.1-5.6-1.9-5.6-3.6 0-1.8 1.8-3.1 4.6-3.1 2.9 0 5.1 1.3 6.3 3.3l4.2-2.6C33.2 10.4 29.4 8 24 8c-5.8 0-10 3.4-10 8 0 4.3 3.3 6.6 9.2 8.2 4.1 1.1 5.5 2 5.5 3.7 0 1.9-1.9 3.3-5.1 3.3-3.3 0-5.8-1.7-6.9-4.1l-4.2 2.4Z"
        fill="#003C2F"
      />
    </svg>
  );
}
