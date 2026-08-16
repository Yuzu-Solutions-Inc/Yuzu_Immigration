import { ProductMark } from "@/components/brand/product-mark";

/** Official Google Meet icon. */
export function GoogleMeetLogo({
  className,
  title = "Google Meet",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <ProductMark src="/brand/google-meet.svg" title={title} className={className} />
  );
}
