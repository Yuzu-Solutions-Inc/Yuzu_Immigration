"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

import { Button as UiButton } from "@/components/ui/button";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "default" | "sm" | "lg" | "icon";

const variantMap = {
  primary: "default",
  secondary: "outline",
  ghost: "ghost",
  danger: "destructive",
} as const;

export function Button({
  variant = "primary",
  size = "default",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}) {
  return (
    <UiButton
      type={props.type ?? "button"}
      variant={variantMap[variant]}
      size={size}
      className={className}
      disabled={props.disabled}
      onClick={props.onClick}
      title={props.title}
      name={props.name}
      value={props.value}
      form={props.form}
    >
      {children}
    </UiButton>
  );
}

export const tableActionClass =
  "!min-h-[44px] !min-w-[44px] sm:!min-h-8 sm:!min-w-0 !h-8 !px-3 !py-0 sm:!px-2";
