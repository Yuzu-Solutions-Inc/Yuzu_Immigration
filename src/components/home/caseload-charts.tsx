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
