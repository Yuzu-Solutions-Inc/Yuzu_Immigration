import { BrandMark } from "@/components/brand/brand-mark";
import { Link } from "@/i18n/navigation";
import { product } from "@/lib/brand/product";
import { cn } from "@/lib/utils";

const sizeClass = {
  sm: "text-[15px] leading-none",
  md: "text-xl leading-none",
  lg: "text-3xl leading-none",
  hero: "text-5xl leading-[1.05] sm:text-6xl",
} as const;

type BrandLogoProps = {
  className?: string;
  size?: keyof typeof sizeClass;
  href?: "/" | "/home" | "/portal/home" | null;
  inverted?: boolean;
};

export function BrandLogo({
  className,
  size = "md",
  href = "/",
  inverted = false,
}: BrandLogoProps) {
  const accent = product.wordmark.accent.trim();
  const mark = (
    <span
      className={cn(
        "font-logo inline-flex items-center gap-[0.5em] font-extrabold tracking-[-0.03em]",
        sizeClass[size],
        inverted ? "text-white" : "text-brand",
        className,
      )}
    >
      <BrandMark inverted={inverted} />
      <span className="inline-flex items-baseline gap-[0.28em]">
        <span>{product.wordmark.primary}</span>
        {accent ? (
          <span
            className={cn(
              "rounded-[0.28em] px-[0.22em] py-[0.08em]",
              inverted ? "bg-white/15 text-white" : "bg-action text-action-foreground",
            )}
          >
            {accent}
          </span>
        ) : null}
      </span>
    </span>
  );

  if (!href) {
    return mark;
  }

  return (
    <Link
      href={href}
      className="inline-flex w-fit transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      aria-label={product.name}
    >
      {mark}
    </Link>
  );
}
