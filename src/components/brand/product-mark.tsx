import { cn } from "@/lib/utils";

/** Official product artwork served from /public/brand. */
export function ProductMark({
  src,
  title,
  className,
}: {
  src: string;
  title: string;
  className?: string;
}) {
  return (
    // Official SVG marks; next/image is a poor fit for small vector logos.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      title={title}
      draggable={false}
      className={cn("size-10 shrink-0 object-contain", className)}
    />
  );
}
