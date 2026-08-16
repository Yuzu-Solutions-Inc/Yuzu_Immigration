import { cn } from "@/lib/utils";

const PREVIEW_WIDTH = 1080;

export function ProductChrome({
  url,
  children,
  className,
  fadeBottom = false,
  tone = "dark",
  innerHeight,
}: {
  url: string;
  children: React.ReactNode;
  className?: string;
  fadeBottom?: boolean;
  tone?: "dark" | "light";
  innerHeight: number;
}) {
  return (
    <div
      className={cn(
        "landing-shot relative w-full overflow-hidden rounded-[1.25rem] [container-type:inline-size] pointer-events-none select-none",
        tone === "dark"
          ? "border border-white/10 bg-graphite-900 shadow-[0_24px_80px_-24px_color-mix(in_srgb,var(--graphite-900)_55%,transparent)]"
          : "border border-border bg-surface shadow-elevated",
        fadeBottom && "rounded-b-none border-b-0",
        className,
      )}
      aria-hidden
      style={{
        aspectRatio: `${PREVIEW_WIDTH} / ${innerHeight}`,
      }}
    >
      <div
        className="absolute top-0 left-0 flex origin-top-left flex-col overflow-hidden bg-canvas text-foreground"
        style={{
          width: PREVIEW_WIDTH,
          height: innerHeight,
          transform: `scale(calc(100cqi / ${PREVIEW_WIDTH}px))`,
        }}
      >
        <div
          className={cn(
            "flex shrink-0 items-center gap-2 border-b px-4 py-2.5",
            tone === "dark"
              ? "border-white/8 bg-graphite-900"
              : "border-border bg-muted",
          )}
        >
          <span
            className={cn(
              "size-2.5 rounded-full",
              tone === "dark" ? "bg-white/20" : "bg-foreground/15",
            )}
          />
          <span
            className={cn(
              "size-2.5 rounded-full",
              tone === "dark" ? "bg-white/20" : "bg-foreground/15",
            )}
          />
          <span
            className={cn(
              "size-2.5 rounded-full",
              tone === "dark" ? "bg-white/20" : "bg-foreground/15",
            )}
          />
          <div
            className={cn(
              "ml-3 flex h-6 flex-1 items-center rounded-md px-3 text-[11px] tracking-wide",
              tone === "dark"
                ? "bg-white/6 text-white/40"
                : "bg-background text-muted-foreground",
            )}
          >
            {url}
          </div>
        </div>
        <div className="flex min-h-0 flex-1">{children}</div>
      </div>
      {fadeBottom ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-24 bg-gradient-to-t from-canvas to-transparent"
        />
      ) : null}
    </div>
  );
}
