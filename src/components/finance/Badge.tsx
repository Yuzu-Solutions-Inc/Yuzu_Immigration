"use client";

const styles: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  estimated: "bg-muted text-muted-foreground",
  due: "bg-warning-bg text-warning-text",
  declared: "bg-warning-bg text-warning-text",
  sent: "bg-action/10 text-brand",
  partial: "bg-action/10 text-brand",
  paid: "bg-success/15 text-success",
  void: "bg-destructive/10 text-destructive",
  active: "bg-success/15 text-success",
  on_hold: "bg-warning-bg text-warning-text",
  completed: "bg-muted text-muted-foreground",
  archived: "bg-muted text-muted-foreground",
  invoiced: "bg-success/15 text-success",
  unbilled: "bg-action/10 text-brand",
};

export function Badge({
  label,
  tone = "draft",
}: {
  label: string;
  tone?: string;
}) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${styles[tone] ?? styles.draft}`}
    >
      {label}
    </span>
  );
}
