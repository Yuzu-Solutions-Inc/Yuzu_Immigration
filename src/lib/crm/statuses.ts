export const PROJECT_STATUSES = [
  "new",
  "in_progress",
  "stuck",
  "waiting",
  "submitted",
  "granted",
  "rejected",
] as const;

export type ProjectStatusValue = (typeof PROJECT_STATUSES)[number];

export type ProjectStatusTone =
  | "muted"
  | "action"
  | "success"
  | "warning"
  | "destructive";

export function projectStatusTone(
  status: ProjectStatusValue,
): ProjectStatusTone {
  switch (status) {
    case "new":
      return "muted";
    case "in_progress":
    case "submitted":
      return "action";
    case "waiting":
    case "stuck":
      return "warning";
    case "granted":
      return "success";
    case "rejected":
      return "destructive";
    default:
      return "muted";
  }
}

export function submitBeforeTone(
  submitBefore: string | null,
  today = new Date(),
): ProjectStatusTone {
  if (!submitBefore) return "muted";

  const startOfToday = new Date(today);
  startOfToday.setHours(0, 0, 0, 0);
  const deadline = new Date(`${submitBefore}T12:00:00`);

  if (deadline < startOfToday) return "destructive";

  const daysUntil =
    (deadline.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24);
  if (daysUntil <= 14) return "warning";

  return "action";
}

export function isTerminalStatus(status: ProjectStatusValue) {
  return status === "granted" || status === "rejected";
}

export function todayDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
