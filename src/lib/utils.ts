import { clsx, type ClassValue } from "clsx"
import type { MouseEvent } from "react"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** True when a table-row click should not navigate (controls, modified clicks). */
export function shouldIgnoreRowClick(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0) return true;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return true;
  }
  return (
    event.target instanceof Element &&
    Boolean(event.target.closest("a, button, input, select, textarea, label"))
  );
}
