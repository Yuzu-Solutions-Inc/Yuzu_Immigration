import { createHash, randomBytes } from "node:crypto";

export function hashBookingToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createBookingToken() {
  return randomBytes(32).toString("base64url");
}
