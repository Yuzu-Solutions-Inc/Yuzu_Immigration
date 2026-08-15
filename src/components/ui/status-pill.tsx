import { cn } from "@/lib/utils";

const toneClasses = {
  muted: "bg-muted text-muted-foreground",
  action: "bg-action/10 text-action",
  success: "bg-success-bg text-success-text",
  warning: "bg-warning-bg text-warning-text",
  destructive: "bg-destructive/10 text-destructive",
} as const;

export type StatusPillTone = keyof typeof toneClasses;

export function StatusPill({
  label,
  tone = "muted",
  className,
}: {
  label: string;
  tone?: StatusPillTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide",
        toneClasses[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}
