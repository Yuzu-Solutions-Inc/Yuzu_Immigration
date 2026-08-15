import { createHash, randomBytes } from "node:crypto";

export function hashShareToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function generateShareToken(): string {
  return randomBytes(32).toString("base64url");
}
