import { email } from "@/lib/design-tokens";

/** Shared inline styles for transactional emails (token-backed). */
export const emailStyle = {
  body: `margin:0;padding:24px;background:${email.bodyBg};color:${email.text};font-family:Inter,Helvetica,Arial,sans-serif;`,
  card: `max-width:560px;margin:0 auto;background:${email.cardBg};border:1px solid ${email.border};border-radius:12px;padding:28px 24px;`,
  cardCompact: `max-width:560px;margin:0 auto;background:${email.cardBg};border:1px solid ${email.border};border-radius:12px;padding:28px;`,
  eyebrow: `margin:0 0 8px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${email.textMuted};`,
  eyebrowStrong: `margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${email.textMuted};`,
  heading: `margin:0 0 12px;font-size:24px;line-height:1.3;color:${email.heading};`,
  text: `margin:0 0 8px;font-size:15px;color:${email.text};`,
  muted: `margin:0 0 20px;font-size:15px;line-height:1.55;color:${email.textMuted};`,
  mutedTight: `margin:0 0 12px;font-size:15px;line-height:1.55;color:${email.textMuted};`,
  mutedSmall: `margin:0;font-size:13px;line-height:1.5;color:${email.textMuted};`,
  footer: `margin:28px 0 0;font-size:13px;color:${email.textMuted};`,
  label: `padding:8px 0;color:${email.textMuted};width:140px;`,
  value: `padding:8px 0;color:${email.text};font-weight:600;`,
  valueMuted: `font-weight:400;color:${email.textMuted};`,
  link: `color:${email.link};font-weight:600;text-decoration:none;`,
  linkMuted: `color:${email.textMuted};font-weight:600;text-decoration:none;`,
  cta: `display:inline-block;background:${email.ctaBg};color:${email.ctaText};text-decoration:none;font-weight:600;font-size:15px;padding:12px 18px;border-radius:12px;`,
  ctaCompact: `display:inline-block;background:${email.ctaBg};color:${email.ctaText};text-decoration:none;font-weight:600;font-size:15px;padding:12px 18px;border-radius:10px;`,
  divider: `color:${email.divider};margin:0 10px;`,
  borderTop: `margin:20px 0 0;padding:16px 0 0;border-top:1px solid ${email.border};`,
  notice: `max-width:560px;margin:16px auto 0;padding:0 8px;font-size:12px;line-height:1.5;color:${email.textMuted};`,
} as const;
