import { cn } from "@/lib/utils";

export function ProgressMeter({
  valueLabel,
  percent,
  className,
  compact = false,
}: {
  valueLabel: string;
  percent: number;
  className?: string;
  compact?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));

  return (
    <div
      className={cn(
        compact ? "w-[2.75rem] space-y-1" : "min-w-[4.5rem] space-y-1.5",
        className,
      )}
    >
      <p
        className={cn(
          "tabular-nums text-brand",
          compact ? "text-xs leading-none" : "text-sm",
        )}
      >
        {valueLabel}
      </p>
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-brand/75"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

export function docsPercent(done: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((done / total) * 100);
}
