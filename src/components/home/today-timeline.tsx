import { Link } from "@/i18n/navigation";
import { StatusPill } from "@/components/ui/status-pill";
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
  unpaid?: boolean;
  past?: boolean;
  next?: boolean;
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
  nextLabel,
  durationLabel,
}: {
  items: TodayTimelineItem[];
  nowMinutes: number;
  nowLabel: string;
  empty: string;
  unpaidLabel: string;
  nextLabel: string;
  durationLabel: (minutes: number) => string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }

  const slots = timelineSlots(items, nowMinutes);

  return (
    <ol className="relative">
      <span
        className="absolute top-2 bottom-2 left-[3.25rem] w-px bg-border"
        aria-hidden
      />
      {slots.map((slot, index) => {
        if (slot.type === "now") {
          return (
            <li
              key="now"
              className="relative grid grid-cols-[3.25rem_1rem_minmax(0,1fr)] items-center gap-x-2 py-2"
            >
              <p className="text-right text-[10px] font-semibold tracking-wide text-destructive uppercase">
                {nowLabel}
              </p>
              <span className="relative z-10 flex justify-center">
                <span className="size-2.5 rounded-full bg-destructive ring-4 ring-surface" />
              </span>
              <span className="h-px bg-destructive/30" aria-hidden />
            </li>
          );
        }

        const { item } = slot;
        const isLast = index === slots.length - 1;
        return (
          <li key={item.id}>
            <Link
              href={item.href}
              className={cn(
                "relative grid grid-cols-[3.25rem_1rem_minmax(0,1fr)] gap-x-2 rounded-lg py-2 pr-1 transition-colors hover:bg-muted/40",
                item.past && "opacity-55",
                isLast && "pb-1",
              )}
            >
              <div className="pt-0.5 text-right">
                <p className="text-sm font-medium text-brand tabular-nums">
                  {item.startLabel}
                </p>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  {item.endLabel}
                </p>
              </div>
              <span className="relative z-10 flex justify-center pt-1.5">
                <span
                  className={cn(
                    "size-2.5 rounded-full ring-4 ring-surface",
                    item.next
                      ? "bg-action"
                      : item.past
                        ? "bg-muted-foreground/40"
                        : "bg-brand",
                  )}
                  aria-hidden
                />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-brand">
                    {item.label}
                  </p>
                  {item.next ? (
                    <StatusPill
                      label={nextLabel}
                      tone="action"
                      className="px-2 py-0 text-[10px]"
                    />
                  ) : null}
                </div>
                <p className="truncate text-[12px] text-muted-foreground">
                  {item.service}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {durationLabel(item.durationMinutes)}
                  {item.unpaid ? ` · ${unpaidLabel}` : null}
                </p>
              </div>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
