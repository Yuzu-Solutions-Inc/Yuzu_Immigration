import { ProductMark } from "@/components/brand/product-mark";

/** Official Google Calendar icon. */
export function GoogleCalendarLogo({
  className,
  title = "Google Calendar",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <ProductMark
      src="/brand/google-calendar.svg"
      title={title}
      className={className}
    />
  );
}
