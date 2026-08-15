import { z } from "zod";

/** Client share-link password: 8+ chars, 1 upper, 1 digit, 1 symbol. */
export const shareLinkPasswordSchema = z
  .string()
  .min(8, "min_length")
  .max(128, "max_length")
  .refine((v) => /[A-Z]/.test(v), "uppercase")
  .refine((v) => /[0-9]/.test(v), "digit")
  .refine((v) => /[^A-Za-z0-9]/.test(v), "symbol");

export function parseShareLinkPassword(password: string) {
  return shareLinkPasswordSchema.safeParse(password);
}
