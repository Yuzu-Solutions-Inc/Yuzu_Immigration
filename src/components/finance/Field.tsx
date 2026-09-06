"use client";

import type { ReactNode } from "react";

import {
  Field as UiField,
  FieldLabel,
} from "@/components/ui/field";
import { fieldControlClassName, type FieldDensity } from "@/lib/field-styles";

export function Field({
  label,
  children,
  className = "",
  density = "default",
}: {
  label: string;
  children: ReactNode;
  className?: string;
  density?: FieldDensity;
}) {
  return (
    <UiField density={density} className={className}>
      <FieldLabel density={density}>{label}</FieldLabel>
      {children}
    </UiField>
  );
}

export const inputClass = fieldControlClassName({ density: "default" });
export const compactInputClass = fieldControlClassName({ density: "compact" });
export const denseInputClass = fieldControlClassName({ density: "dense" });
