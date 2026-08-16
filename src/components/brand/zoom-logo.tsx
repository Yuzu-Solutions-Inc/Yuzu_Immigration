import { ProductMark } from "@/components/brand/product-mark";

/** Official Zoom Meetings icon. */
export function ZoomLogo({
  className,
  title = "Zoom",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <ProductMark src="/brand/zoom.svg" title={title} className={className} />
  );
}
