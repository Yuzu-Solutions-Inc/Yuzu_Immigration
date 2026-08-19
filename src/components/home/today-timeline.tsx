import { Video } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type TodayTimelineItem = {
  id: string;
  startLabel: string;
  endLabel: string;
  startMinutes: number;
  durationMinutes: number;
  label: string;
  service: string;
  href: string;
  joinUrl?: string | null;
  joinLabel?: string;
  unpaid?: boolean;
  past?: boolean;
};

type Slot =
  | { type: "now" }
  | { type: "item"; item: TodayTimelineItem };

function timelineSlots(
  items: TodayTimelineItem[],
  nowMinutes: number,
): Slot[] {
  const sorted = [...items].sort((a, b) => a.startMinutes - b.startMinutes);
  const slots: Slot[] = [];
  let insertedNow = false;

  for (const item of sorted) {
    if (!insertedNow && nowMinutes < item.startMinutes) {
      slots.push({ type: "now" });
      insertedNow = true;
    }
    slots.push({ type: "item", item });
  }
  if (!insertedNow) slots.push({ type: "now" });
  return slots;
}

export function TodayTimeline({
  items,
  nowMinutes,
  nowLabel,
  empty,
  unpaidLabel,
  durationLabel,
}: {
  items: TodayTimelineItem[];
  nowMinutes: number;
  nowLabel: string;
  empty: string;
  unpaidLabel: string;
  durationLabel: (minutes: number) => string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }

  const slots = timelineSlots(items, nowMinutes);

  return (
    <ol className="relative min-w-0">
      <span
        className="pointer-events-none absolute top-3 bottom-3 left-[calc(5.25rem+0.5rem+0.5rem)] w-px -translate-x-1/2 bg-border"
        aria-hidden
      />
      {slots.map((slot) => {
        if (slot.type === "now") {
          return (
            <li key="now" className="flex min-w-0 items-center gap-2 py-2">
              <p className="w-[5.25rem] shrink-0 text-right text-[10px] font-semibold tracking-wide text-destructive uppercase">
                {nowLabel}
              </p>
              <span className="relative z-10 flex w-4 shrink-0 justify-center">
                <span className="size-2.5 rounded-full bg-destructive ring-4 ring-surface" />
              </span>
              <span className="h-px min-w-0 flex-1 bg-destructive/30" aria-hidden />
            </li>
          );
        }

        const { item } = slot;
        const detail = [
          item.service,
          durationLabel(item.durationMinutes),
          item.unpaid ? unpaidLabel : null,
        ]
          .filter(Boolean)
          .join(" · ");

        return (
          <li key={item.id} className="min-w-0">
            <div
              className={cn(
                "flex min-w-0 gap-2 rounded-lg py-2",
                item.past && "opacity-55",
              )}
            >
              <div className="w-[5.25rem] shrink-0 pt-0.5 text-right">
                <p className="text-[13px] font-semibold text-brand tabular-nums">
                  {item.startLabel}
                </p>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  {item.endLabel}
                </p>
              </div>
              <span className="relative z-10 flex w-4 shrink-0 justify-center pt-1.5">
                <span
                  className={cn(
                    "size-2.5 rounded-full ring-4 ring-surface",
                    item.joinUrl
                      ? "bg-action"
                      : item.past
                        ? "bg-muted-foreground/40"
                        : "bg-brand",
                  )}
                  aria-hidden
                />
              </span>
              <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
                <Link href={item.href} className="min-w-0 flex-1 rounded-md hover:bg-muted/40">
                  <p className="truncate text-sm font-semibold text-brand">
                    {item.label}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {detail}
                  </p>
                </Link>
                {item.joinUrl && item.joinLabel ? (
                  <a
                    href={item.joinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      buttonVariants({ size: "xs" }),
                      "shrink-0 bg-action text-action-foreground hover:bg-action/90",
                    )}
                  >
                    <Video className="size-3.5" aria-hidden />
                    {item.joinLabel}
                  </a>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
