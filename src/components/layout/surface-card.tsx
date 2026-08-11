import { cn } from "@/lib/utils";

export function SurfaceCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface p-6 shadow-elevated sm:p-8",
        className,
      )}
    >
      {children}
    </div>
  );
}
