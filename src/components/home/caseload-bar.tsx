import { cn } from "@/lib/utils";

export function CaseloadBar({
  open,
  ready,
  submitted,
  labels,
  empty,
}: {
  open: number;
  ready: number;
  submitted: number;
  labels: { open: string; ready: string; submitted: string };
  empty: string;
}) {
  const total = open + ready + submitted;
  const segments = [
    { key: "open", count: open, label: labels.open, className: "bg-muted-foreground/35" },
    { key: "ready", count: ready, label: labels.ready, className: "bg-action" },
    { key: "submitted", count: submitted, label: labels.submitted, className: "bg-success" },
  ].filter((segment) => segment.count > 0);

  if (total === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }

  return (
    <div className="space-y-2">
      <div
        className="flex h-2.5 overflow-hidden rounded-full bg-canvas"
        role="img"
        aria-label={segments
          .map((segment) => `${segment.label}: ${segment.count}`)
          .join(", ")}
      >
        {segments.map((segment) => (
          <div
            key={segment.key}
            className={cn("h-full min-w-0", segment.className)}
            style={{ width: `${(segment.count / total) * 100}%` }}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        {segments.map((segment) => (
          <li key={segment.key} className="inline-flex items-center gap-1.5">
            <span
              className={cn("size-1.5 shrink-0 rounded-full", segment.className)}
              aria-hidden
            />
            <span>
              <span className="tabular-nums font-semibold text-brand">
                {segment.count}
              </span>{" "}
              {segment.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
