import { BrandMark } from "@/components/brand/brand-mark";
import { Link } from "@/i18n/navigation";
import { product } from "@/lib/brand/product";
import { cn } from "@/lib/utils";

const sizeClass = {
  sm: "text-[15px] leading-none",
  sidebar: "text-[17px] leading-none",
  md: "text-xl leading-none",
  lg: "text-3xl leading-none",
  hero: "text-4xl leading-[1.05] sm:text-5xl lg:text-6xl",
} as const;

type BrandLogoProps = {
  className?: string;
  size?: keyof typeof sizeClass;
  href?: "/" | "/home" | "/portal/home" | null;
  inverted?: boolean;
  /** Icon mark only — for the collapsed app sidebar. */
  markOnly?: boolean;
};

export function BrandLogo({
  className,
  size = "md",
  href = "/",
  inverted = false,
  markOnly = false,
}: BrandLogoProps) {
  const accent = product.wordmark.accent.trim();
  const mark = markOnly ? (
    <span
      className={cn(
        "inline-flex size-9 items-center justify-center",
        inverted ? "text-white" : "text-brand",
        className,
      )}
    >
      <BrandMark inverted={inverted} className="size-[18px]" />
    </span>
  ) : (
    <span
      className={cn(
        "font-logo inline-flex items-center gap-[0.38em] font-extrabold tracking-[-0.03em]",
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
      className={cn(
        "inline-flex min-w-0 w-fit items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        markOnly
          ? "rounded-lg transition-colors hover:bg-sidebar-accent"
          : "transition-opacity hover:opacity-90",
      )}
      aria-label={product.name}
    >
      {mark}
    </Link>
  );
}
