import { Link } from "@/i18n/navigation";
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
  href?: "/" | "/home" | null;
  inverted?: boolean;
  compact?: boolean;
};

export function BrandLogo({
  className,
  size = "md",
  href = "/",
  inverted = false,
  compact = false,
}: BrandLogoProps) {
  const mark = compact ? (
    <span
      className={cn(
        "font-logo inline-flex size-9 items-center justify-center rounded-lg text-[11px] font-extrabold tracking-tight",
        inverted ? "bg-white/15 text-white" : "bg-action text-white",
        className,
      )}
    >
      My
    </span>
  ) : (
    <span
      className={cn(
        "font-logo inline-flex items-baseline gap-[0.28em] font-extrabold tracking-[-0.03em]",
        sizeClass[size],
        inverted ? "text-white" : "text-brand",
        className,
      )}
    >
      <span className={cn(inverted ? "text-white" : "text-brand")}>My</span>
      <span
        className={cn(
          "rounded-[0.28em] px-[0.22em] py-[0.08em]",
          inverted ? "bg-white/15 text-white" : "bg-action text-white",
        )}
      >
        Consultant
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
      aria-label="My Consultant"
    >
      {mark}
    </Link>
  );
}
