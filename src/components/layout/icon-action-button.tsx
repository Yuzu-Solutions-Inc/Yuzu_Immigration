"use client";

import type { LucideIcon } from "lucide-react";
import { Eye, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Desktop lists hide row icons until hover/focus; always visible on small screens. */
export const iconActionRevealClassName =
  "opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100";

type IconActionButtonProps = {
  label: string;
  onClick?: () => void;
  icon: LucideIcon;
  tone?: "default" | "danger";
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
};

export function IconActionButton({
  label,
  onClick,
  icon: Icon,
  tone = "default",
  disabled,
  className,
  type = "button",
}: IconActionButtonProps) {
  return (
    <Button
      type={type}
      variant="ghost"
      size="icon-sm"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "text-muted-foreground",
        tone === "danger" && "hover:bg-destructive/10 hover:text-destructive",
        className,
      )}
    >
      <Icon className="size-4" />
    </Button>
  );
}

export function EditIconButton(
  props: Omit<IconActionButtonProps, "icon" | "tone">,
) {
  return <IconActionButton icon={Pencil} {...props} />;
}

export function DeleteIconButton(
  props: Omit<IconActionButtonProps, "icon" | "tone">,
) {
  return <IconActionButton icon={Trash2} tone="danger" {...props} />;
}

export function ViewIconButton(
  props: Omit<IconActionButtonProps, "icon" | "tone">,
) {
  return <IconActionButton icon={Eye} {...props} />;
}
