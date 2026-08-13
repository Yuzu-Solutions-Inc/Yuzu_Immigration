import { cn } from "@/lib/utils";

export function ProgressMeter({
  valueLabel,
  percent,
  className,
}: {
  valueLabel: string;
  percent: number;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));

  return (
    <div className={cn("min-w-[4.5rem] space-y-1.5", className)}>
      <p className="text-sm tabular-nums text-brand">{valueLabel}</p>
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
