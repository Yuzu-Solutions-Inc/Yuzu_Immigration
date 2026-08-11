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

export function isTerminalStatus(status: ProjectStatusValue) {
  return status === "granted" || status === "rejected";
}

export function todayDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
