import { cn } from "@/lib/utils";

export type BarItem = {
  key: string;
  label: string;
  count: number;
};

export function HorizontalBarList({
  items,
  empty,
}: {
  items: BarItem[];
  empty: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }

  const max = Math.max(...items.map((item) => item.count), 1);

  return (
    <ul className="space-y-1.5">
      {items.map((item) => {
        const width = Math.max((item.count / max) * 100, item.count > 0 ? 4 : 0);
        return (
          <li
            key={item.key}
            className="grid grid-cols-[minmax(0,7rem)_1fr_1.5rem] items-center gap-2"
          >
            <span
              className="truncate text-xs text-muted-foreground"
              title={item.label}
            >
              {item.label}
            </span>
            <div className="h-1.5 rounded-sm bg-muted">
              <div
                className="h-1.5 rounded-sm bg-brand/80"
                style={{ width: `${width}%` }}
              />
            </div>
            <span className="text-right text-xs tabular-nums text-brand">
              {item.count}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export type TrendPoint = {
  weekStart: string;
  label: string;
  count: number;
  isCurrent: boolean;
};

export function SubmitTrendChart({
  points,
  empty,
  thisWeekLabel,
}: {
  points: TrendPoint[];
  empty: string;
  thisWeekLabel: string;
}) {
  const hasData = points.some((point) => point.count > 0);
  if (!hasData) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }

  const width = 720;
  const height = 196;
  const pad = { l: 28, r: 10, t: 18, b: 40 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const max = Math.max(...points.map((point) => point.count), 1);
  const last = Math.max(points.length - 1, 1);

  const coords = points.map((point, index) => {
    const x = pad.l + (index / last) * innerW;
    const y = pad.t + innerH - (point.count / max) * innerH;
    return { ...point, x, y };
  });

  const line = coords
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-48 w-full text-brand"
      role="img"
      aria-label={points.map((point) => `${point.label}: ${point.count}`).join(", ")}
    >
      <line
        x1={pad.l}
        y1={pad.t + innerH}
        x2={width - pad.r}
        y2={pad.t + innerH}
        className="stroke-border"
        strokeWidth="1"
      />
      <text
        x={4}
        y={pad.t + 4}
        className="fill-muted-foreground"
        fontSize="10"
      >
        {max}
      </text>
      <path d={line} fill="none" stroke="currentColor" strokeWidth="1.75" />
      {coords.map((point, index) => (
        <g key={point.weekStart}>
          <circle
            cx={point.x}
            cy={point.y}
            r={point.isCurrent ? 3.5 : 2.75}
            fill="currentColor"
          />
          <title>
            {point.isCurrent
              ? `${thisWeekLabel}: ${point.count}`
              : `${point.label}: ${point.count}`}
          </title>
          {index % 2 === 0 || point.isCurrent ? (
            <text
              x={point.x}
              y={height - 14}
              textAnchor="middle"
              className={cn(
                "fill-muted-foreground",
                point.isCurrent && "fill-brand",
              )}
              fontSize="10"
            >
              {point.label}
            </text>
          ) : null}
        </g>
      ))}
    </svg>
  );
}
