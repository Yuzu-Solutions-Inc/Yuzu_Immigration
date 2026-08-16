import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type PipelineSlice = {
  key: string;
  label: string;
  count: number;
  tone: "muted" | "action" | "success" | "warning" | "destructive";
};

const TONE_FILL: Record<PipelineSlice["tone"], string> = {
  muted: "var(--graphite-300)",
  action: "var(--action)",
  success: "var(--success)",
  warning: "var(--warning)",
  destructive: "var(--error)",
};

export function PipelineDonut({
  items,
  empty,
  totalLabel,
}: {
  items: PipelineSlice[];
  empty: string;
  totalLabel: string;
}) {
  const slices = items.filter((item) => item.count > 0);
  const total = slices.reduce((sum, item) => sum + item.count, 0);

  if (total === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }

  const size = 88;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex items-center gap-3">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="size-[4.5rem] shrink-0"
        role="img"
        aria-label={slices
          .map((item) => `${item.label}: ${item.count}`)
          .join(", ")}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={stroke}
        />
        {slices.map((item) => {
          const length = (item.count / total) * circumference;
          const dash = `${length} ${circumference - length}`;
          const rotate = (offset / circumference) * 360 - 90;
          offset += length;
          return (
            <circle
              key={item.key}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={TONE_FILL[item.tone]}
              strokeWidth={stroke}
              strokeDasharray={dash}
              strokeLinecap="butt"
              transform={`rotate(${rotate} ${size / 2} ${size / 2})`}
            />
          );
        })}
        <text
          x="50%"
          y="48%"
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-brand"
          fontSize="18"
          fontWeight="600"
        >
          {total}
        </text>
        <text
          x="50%"
          y="66%"
          textAnchor="middle"
          className="fill-muted-foreground"
          fontSize="8"
        >
          {totalLabel}
        </text>
      </svg>
      <ul className="min-w-0 flex-1 space-y-1">
        {slices.map((item) => (
          <li
            key={item.key}
            className="flex items-center justify-between gap-2 text-xs"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ background: TONE_FILL[item.tone] }}
                aria-hidden
              />
              <span className="truncate text-muted-foreground">{item.label}</span>
            </span>
            <span className="tabular-nums font-medium text-brand">
              {item.count}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type DayStripItem = {
  id: string;
  start: number;
  end: number;
  label: string;
  href: string;
  unpaid?: boolean;
  past?: boolean;
};

export function TodayStrip({
  items,
  nowMinutes,
  empty,
}: {
  items: DayStripItem[];
  nowMinutes: number;
  empty: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }

  let windowStart = 8 * 60;
  let windowEnd = 18 * 60;
  for (const item of items) {
    windowStart = Math.min(windowStart, Math.max(0, item.start - 30));
    windowEnd = Math.max(windowEnd, Math.min(24 * 60, item.end + 30));
  }
  const span = Math.max(windowEnd - windowStart, 60);
  const nowInWindow = nowMinutes >= windowStart && nowMinutes <= windowEnd;
  const nowLeft = ((nowMinutes - windowStart) / span) * 100;

  const ticks: number[] = [];
  const firstTick = Math.ceil(windowStart / 60) * 60;
  for (let minute = firstTick; minute <= windowEnd; minute += 60) {
    ticks.push(minute);
  }

  return (
    <div className="space-y-1.5">
      <div className="relative h-14 overflow-hidden rounded-lg bg-canvas">
        {ticks.map((minute) => {
          const left = ((minute - windowStart) / span) * 100;
          return (
            <div
              key={minute}
              className="absolute inset-y-0 border-l border-border/70"
              style={{ left: `${left}%` }}
            >
              <span className="absolute top-0.5 left-1 text-[9px] tabular-nums text-muted-foreground">
                {String(Math.floor(minute / 60)).padStart(2, "0")}
              </span>
            </div>
          );
        })}
        {items.map((item) => {
          const left = ((item.start - windowStart) / span) * 100;
          const width = Math.max(((item.end - item.start) / span) * 100, 8);
          return (
            <Link
              key={item.id}
              href={item.href}
              title={item.label}
              className={cn(
                "absolute top-5 bottom-1.5 overflow-hidden rounded-md px-1.5 py-0.5 text-[10px] leading-tight font-medium",
                item.unpaid
                  ? "bg-action/10 text-action ring-1 ring-inset ring-action/30"
                  : "bg-muted text-brand",
                item.past && "opacity-50",
              )}
              style={{ left: `${left}%`, width: `${width}%` }}
            >
              <span className="block truncate">{item.label}</span>
            </Link>
          );
        })}
        {nowInWindow ? (
          <div
            className="absolute inset-y-0 z-10 w-px bg-destructive"
            style={{ left: `${nowLeft}%` }}
            aria-hidden
          />
        ) : null}
      </div>
    </div>
  );
}
