import { z } from "zod";

/** Matches this project's GoTrue passwordRequiredCharacters setting. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

const HAS_LOWER = /[a-z]/;
const HAS_UPPER = /[A-Z]/;
const HAS_DIGIT = /[0-9]/;
const HAS_SPECIAL = /[!@#$%^&*()_+\-=[\]{};'\\:"|<>?,./`~]/;

export function isPasswordPolicyMet(password: string): boolean {
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    password.length <= PASSWORD_MAX_LENGTH &&
    HAS_LOWER.test(password) &&
    HAS_UPPER.test(password) &&
    HAS_DIGIT.test(password) &&
    HAS_SPECIAL.test(password)
  );
}

export const passwordSchema = z
  .string()
  .refine(isPasswordPolicyMet, { message: "password_weak" });

export type PasswordUpdateErrorCode =
  | "password_weak"
  | "password_reuse"
  | "password_leaked"
  | "password_update_failed";

export function classifyPasswordUpdateError(error: {
  message: string;
  code?: string;
}): PasswordUpdateErrorCode {
  const code = error.code ?? "";
  const message = error.message.toLowerCase();
  if (
    code === "weak_password" ||
    message.includes("at least one character of each")
  ) {
    return "password_weak";
  }
  if (message.includes("different from the old")) {
    return "password_reuse";
  }
  if (
    message.includes("leaked") ||
    message.includes("pwned") ||
    message.includes("data breach") ||
    message.includes("compromised") ||
    message.includes("known to be weak")
  ) {
    return "password_leaked";
  }
  return "password_update_failed";
}
