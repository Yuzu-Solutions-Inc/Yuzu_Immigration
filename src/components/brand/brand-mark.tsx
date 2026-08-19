import type { ReactNode } from "react";

import { product, type BrandMarkId } from "@/lib/brand/product";
import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
  inverted?: boolean;
  mark?: BrandMarkId;
};

/** Paper plane from the Permit OS lockup (exploration 46). */
function PaperPlaneMark({
  className,
  inverted,
}: {
  className?: string;
  inverted?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={cn("h-[0.92em] w-[0.92em] shrink-0", className)}
    >
      <path
        d="M3.2 11.2 21 4 14.2 21.2 11.6 13.4 3.2 11.2Z"
        className={inverted ? "fill-white" : "fill-brand"}
      />
      <path
        d="M11.6 13.4 21 4"
        className={inverted ? "stroke-[var(--indigo-300)]" : "stroke-action"}
        strokeWidth="1.4"
      />
    </svg>
  );
}

const marks: Record<
  BrandMarkId,
  (props: { className?: string; inverted?: boolean }) => ReactNode
> = {
  paperPlane: (props) => <PaperPlaneMark {...props} />,
  none: () => null,
};

export function BrandMark({
  className,
  inverted = false,
  mark = product.mark,
}: BrandMarkProps) {
  return marks[mark]({ className, inverted });
}
