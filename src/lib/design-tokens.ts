/**
 * Yuzu Immigration design tokens (TypeScript).
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
  canvas: primitives.graphite[50],
  surface: "#FFFFFF",
  border: primitives.graphite[200],
  muted: primitives.graphite[100],
  mutedForeground: primitives.graphite[500],
  foreground: primitives.graphite[900],
  sidebar: primitives.graphite[900],
  sidebarAccent: primitives.graphite[700],
} as const;

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
