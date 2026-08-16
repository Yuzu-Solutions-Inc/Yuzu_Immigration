import { cva, type VariantProps } from "class-variance-authority";

import type { FieldDensity, FieldType } from "@/lib/design-tokens";

export type { FieldDensity, FieldType };

export const fieldControlVariants = cva(
  "w-full min-w-0 border border-input bg-surface text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
  {
    variants: {
      density: {
        default: "h-10 rounded-xl px-3 text-[15px] md:text-[15px]",
        compact: "h-9 rounded-lg px-2 text-sm md:text-sm",
        dense: "h-8 rounded-lg px-2 text-sm",
      },
      control: {
        input: "",
        textarea: "h-auto field-sizing-content min-h-16 py-2",
        select: "",
        checkbox:
          "size-4 h-4 w-4 rounded border-input bg-surface p-0 disabled:bg-transparent",
      },
    },
    compoundVariants: [
      {
        control: "textarea",
        density: "default",
        class: "min-h-16 rounded-xl px-3 py-2",
      },
      {
        control: "textarea",
        density: "compact",
        class: "min-h-9 rounded-lg px-2 py-1.5",
      },
      {
        control: "textarea",
        density: "dense",
        class: "min-h-8 rounded-lg px-2 py-1.5",
      },
    ],
    defaultVariants: {
      density: "default",
      control: "input",
    },
  },
);

export const fieldLabelVariants = cva("select-none", {
  variants: {
    density: {
      default: "text-sm leading-none font-medium",
      compact:
        "block text-[11px] font-semibold tracking-wide text-muted-foreground uppercase",
      dense: "text-xs font-medium text-muted-foreground",
    },
  },
  defaultVariants: {
    density: "default",
  },
});

export const fieldStackVariants = cva("", {
  variants: {
    density: {
      default: "space-y-2",
      compact: "min-w-0 space-y-1",
      dense: "min-w-0 space-y-1",
    },
  },
  defaultVariants: {
    density: "default",
  },
});

export const formStackVariants = cva("flex flex-col", {
  variants: {
    gap: {
      tight: "space-y-4",
      default: "space-y-5",
      loose: "space-y-6",
    },
  },
  defaultVariants: {
    gap: "default",
  },
});

export type FieldControlVariants = VariantProps<typeof fieldControlVariants>;

export const fieldTypeToControl = {
  text: "input",
  email: "input",
  tel: "input",
  password: "input",
  number: "input",
  date: "input",
  month: "input",
  search: "input",
  textarea: "textarea",
  select: "select",
  checkbox: "checkbox",
  yesno: "select",
  switch: "input",
  address: "input",
  phone_contact: "input",
  passport: "input",
} as const satisfies Record<
  FieldType,
  NonNullable<FieldControlVariants["control"]>
>;

export function fieldControlClassName(
  options: FieldControlVariants = {},
) {
  return fieldControlVariants(options);
}
