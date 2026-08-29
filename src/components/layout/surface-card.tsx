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
        "min-w-0 rounded-xl border border-border bg-surface p-4 shadow-elevated sm:p-6 lg:p-8",
        className,
      )}
    >
      {children}
    </div>
  );
}
