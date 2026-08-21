/**
 * Product design tokens (TypeScript).
 * Use these for email HTML and any non-CSS surfaces that cannot read CSS variables.
 * Keep in sync with `src/styles/tokens.css`.
 */

export const primitives = {
  graphite: {
    50: "#F9FAFB",
    100: "#F3F4F6",
    200: "#E5E7EB",
    300: "#9CA3AF",
    400: "#6B7280",
    500: "#4A5568",
    700: "#1F2937",
    900: "#111827",
  },
  indigo: {
    50: "#EEF2FF",
    100: "#E0E7FF",
    300: "#A5B4FC",
    500: "#6366F1",
    600: "#4F46E5",
    700: "#4338CA",
    900: "#3730A3",
  },
  emerald: {
    50: "#ECFDF5",
    100: "#D1FAE5",
    300: "#6EE7B7",
    500: "#059669",
    700: "#047857",
    900: "#064E3B",
  },
  amber: {
    50: "#FFFBEB",
    100: "#FEF3C7",
    200: "#FDE68A",
    300: "#FCD34D",
    500: "#F59E0B",
    700: "#B45309",
    900: "#78350F",
  },
} as const;

export const semantic = {
  brand: primitives.graphite[900],
  action: primitives.indigo[500],
  actionForeground: "#FFFFFF",
  actionHover: primitives.indigo[600],
  actionActive: primitives.indigo[700],
  actionText: primitives.indigo[500],
  success: primitives.emerald[500],
  successBg: primitives.emerald[100],
  successText: primitives.emerald[700],
  warning: primitives.amber[500],
  warningBg: primitives.amber[100],
  warningText: primitives.amber[700],
  highlight: primitives.amber[500],
  error: "#DC2626",
  errorBg: "#FEF2F2",
  errorText: "#B91C1C",
  info: "#3B82F6",
  infoBg: "#EFF6FF",
  infoText: "#1D4ED8",
  blocked: primitives.graphite[400],
  blockedBg: primitives.graphite[100],
  blockedText: primitives.graphite[700],
  canvas: primitives.graphite[50],
  surface: "#FFFFFF",
  border: primitives.graphite[200],
  muted: primitives.graphite[100],
  mutedForeground: primitives.graphite[500],
  foreground: primitives.graphite[900],
  sidebar: primitives.graphite[900],
  sidebarAccent: primitives.graphite[700],
} as const;

export const space = {
  1: "0.25rem",
  2: "0.5rem",
  3: "0.75rem",
  4: "1rem",
  5: "1.25rem",
  6: "1.5rem",
  8: "2rem",
  10: "2.5rem",
  12: "3rem",
} as const;

export const type = {
  size: {
    "2xs": "0.6875rem",
    xs: "0.75rem",
    sm: "0.875rem",
    md: "0.9375rem",
    base: "1rem",
    lg: "1.125rem",
    xl: "1.25rem",
    "2xl": "1.5rem",
  },
  leading: {
    tight: 1.25,
    snug: 1.4,
    normal: 1.6,
  },
  weight: {
    medium: 500,
    semibold: 600,
    heading: 650,
  },
} as const;

export const motion = {
  duration: {
    fast: "100ms",
    normal: "150ms",
    slow: "250ms",
  },
  ease: "cubic-bezier(0.2, 0, 0, 1)",
} as const;

export const elevation = {
  xs: "0 1px 2px rgba(0, 0, 0, 0.04)",
  sm: "0 1px 3px rgba(0, 0, 0, 0.06)",
  elevated: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
  md: "0 4px 8px -2px rgba(0, 0, 0, 0.08)",
  lg: "0 10px 20px -8px rgba(0, 0, 0, 0.12)",
} as const;

export const zIndex = {
  sticky: 30,
  dropdown: 50,
  modal: 50,
  toast: 60,
  tooltip: 70,
} as const;

/** Visual densities used by every form control. */
export const fieldDensity = {
  default: {
    height: "2.5rem",
    radius: "0.75rem",
    padX: space[3],
    fontSize: type.size.md,
    labelSize: type.size.sm,
    gap: space[2],
  },
  compact: {
    height: "2.25rem",
    radius: "0.5rem",
    padX: space[2],
    fontSize: type.size.sm,
    labelSize: type.size["2xs"],
    gap: space[1],
  },
  dense: {
    height: "2rem",
    radius: "0.5rem",
    padX: space[2],
    fontSize: type.size.sm,
    labelSize: type.size.xs,
    gap: space[1],
  },
} as const;

export type FieldDensity = keyof typeof fieldDensity;

/**
 * Field types the product repeats. Primitive types share one control chrome;
 * composite types are organisms built from primitive fields.
 */
export const fieldTypes = {
  primitive: [
    "text",
    "email",
    "tel",
    "password",
    "number",
    "date",
    "month",
    "search",
    "textarea",
    "select",
    "checkbox",
    "yesno",
    "switch",
  ],
  composite: ["address", "phone_contact", "passport"],
} as const;

export type PrimitiveFieldType = (typeof fieldTypes.primitive)[number];
export type CompositeFieldType = (typeof fieldTypes.composite)[number];
export type FieldType = PrimitiveFieldType | CompositeFieldType;

export const fieldTypeMeta: Record<
  FieldType,
  { control: "input" | "textarea" | "select" | "checkbox" | "switch" | "group"; width?: string }
> = {
  text: { control: "input" },
  email: { control: "input" },
  tel: { control: "input" },
  password: { control: "input" },
  number: { control: "input", width: "8rem" },
  date: { control: "input", width: "12rem" },
  month: { control: "input", width: "12rem" },
  search: { control: "input" },
  textarea: { control: "textarea" },
  select: { control: "select" },
  checkbox: { control: "checkbox" },
  yesno: { control: "select" },
  switch: { control: "switch" },
  address: { control: "group" },
  phone_contact: { control: "group" },
  passport: { control: "group" },
};

/** Inline email styles mapped to semantic tokens. */
export const email = {
  bodyBg: semantic.canvas,
  cardBg: semantic.surface,
  border: semantic.border,
  text: semantic.foreground,
  textMuted: semantic.mutedForeground,
  heading: semantic.brand,
  link: semantic.actionText,
  ctaBg: semantic.action,
  ctaText: semantic.actionForeground,
  divider: semantic.border,
} as const;
