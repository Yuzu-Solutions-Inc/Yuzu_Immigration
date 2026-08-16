import { BrandLogo } from "@/components/brand/brand-logo";
import { cn } from "@/lib/utils";

type StatusPageProps = {
  code?: string;
  title: string;
  body: string;
  actions: React.ReactNode;
  compact?: boolean;
  logoHref?: "/" | "/home" | null;
  logo?: React.ReactNode;
  footer?: React.ReactNode;
};

export function StatusPage({
  code,
  title,
  body,
  actions,
  compact = false,
  logoHref = "/",
  logo,
  footer,
}: StatusPageProps) {
  return (
    <main
      className={cn(
        "mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6",
        compact ? "py-10" : "min-h-full py-14",
      )}
    >
      {compact
        ? null
        : (logo ?? <BrandLogo size="sm" href={logoHref} />)}
      <div className="space-y-3">
        {code ? (
          <p className="font-heading text-sm font-semibold tracking-[0.16em] text-action">
            {code}
          </p>
        ) : null}
        <h1 className="font-heading text-3xl font-bold tracking-tight text-brand">
          {title}
        </h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground text-pretty">
          {body}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">{actions}</div>
      {footer}
    </main>
  );
}
