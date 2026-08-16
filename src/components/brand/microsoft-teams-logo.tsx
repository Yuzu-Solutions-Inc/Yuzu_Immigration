import { ProductMark } from "@/components/brand/product-mark";

/** Official Microsoft Teams icon. */
export function MicrosoftTeamsLogo({
  className,
  title = "Microsoft Teams",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <ProductMark
      src="/brand/microsoft-teams.svg"
      title={title}
      className={className}
    />
  );
}
