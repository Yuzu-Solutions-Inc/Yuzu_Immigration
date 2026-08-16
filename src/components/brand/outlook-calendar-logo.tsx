import { ProductMark } from "@/components/brand/product-mark";

/** Official Microsoft Outlook icon. */
export function OutlookCalendarLogo({
  className,
  title = "Outlook",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <ProductMark
      src="/brand/outlook-calendar.svg"
      title={title}
      className={className}
    />
  );
}
