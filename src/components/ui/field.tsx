import type { ComponentProps, ReactNode } from "react";

import { Label } from "@/components/ui/label";
import {
  fieldLabelVariants,
  fieldStackVariants,
  formStackVariants,
  type FieldDensity,
} from "@/lib/field-styles";
import { cn } from "@/lib/utils";

export type { FieldDensity };

export function Field({
  className,
  density = "default",
  ...props
}: ComponentProps<"div"> & { density?: FieldDensity }) {
  return (
    <div
      data-slot="field"
      data-density={density}
      className={cn(fieldStackVariants({ density }), className)}
      {...props}
    />
  );
}

export function FieldLabel({
  className,
  density = "default",
  required,
  children,
  ...props
}: ComponentProps<typeof Label> & {
  density?: FieldDensity;
  required?: boolean;
}) {
  return (
    <Label
      data-slot="field-label"
      className={cn(fieldLabelVariants({ density }), className)}
      {...props}
    >
      {children}
      {required ? (
        <span className="text-destructive" aria-hidden>
          *
        </span>
      ) : null}
    </Label>
  );
}

export function FieldHint({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="field-hint"
      className={cn("text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}

export function FieldError({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="field-error"
      role="alert"
      className={cn("text-sm text-destructive", className)}
      {...props}
    />
  );
}

export function FieldSuccess({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="field-success"
      role="status"
      className={cn("text-sm text-success", className)}
      {...props}
    />
  );
}

export function FieldGrid({
  className,
  columns = 2,
  ...props
}: ComponentProps<"div"> & { columns?: 1 | 2 | 3 }) {
  return (
    <div
      data-slot="field-grid"
      className={cn(
        "grid gap-4",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-3",
        className,
      )}
      {...props}
    />
  );
}

export function FieldGroup({
  title,
  hint,
  required,
  variant = "plain",
  className,
  children,
}: {
  title?: string;
  hint?: string | null;
  required?: boolean;
  variant?: "plain" | "boxed" | "inline";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div data-slot="field-group" className={cn("space-y-2", className)}>
      {title ? (
        <h4 className="font-heading text-sm font-semibold text-brand">
          {title}
          {required ? (
            <span className="text-destructive" aria-hidden>
              {" "}
              *
            </span>
          ) : null}
        </h4>
      ) : null}
      {hint ? <FieldHint>{hint}</FieldHint> : null}
      {variant === "boxed" ? (
        <div className="rounded-xl border border-border bg-surface px-3 py-3">
          {children}
        </div>
      ) : variant === "inline" ? (
        <div className="flex min-w-0 gap-2">{children}</div>
      ) : (
        children
      )}
    </div>
  );
}

export function FormStack({
  className,
  gap = "default",
  ...props
}: ComponentProps<"form"> & { gap?: "tight" | "default" | "loose" }) {
  return (
    <form
      data-slot="form-stack"
      className={cn(formStackVariants({ gap }), className)}
      {...props}
    />
  );
}
