import { resolve } from "node:path";

import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  const execute = process.argv.includes("--execute");
  const dryRun = !execute;

  const {
    requireAppEncryptionKey,
    requireRotateEncryptionKey,
  } = await import("../src/lib/security/app-encryption-key");

  let oldKey: Buffer;
  let newKey: Buffer;
  try {
    oldKey = requireAppEncryptionKey();
  } catch {
    console.error(
      "DOCUMENT_ENCRYPTION_KEY is missing or invalid in .env.local (64 hex chars).",
    );
    process.exit(1);
  }
  try {
    newKey = requireRotateEncryptionKey();
  } catch {
    console.error(
      "DOCUMENT_ENCRYPTION_KEY_ROTATE is missing or invalid in .env.local (64 hex chars).",
    );
    console.error("Generate one with: npm run key:generate");
    process.exit(1);
  }

  if (oldKey.equals(newKey)) {
    console.error(
      "DOCUMENT_ENCRYPTION_KEY and DOCUMENT_ENCRYPTION_KEY_ROTATE are the same. Generate a new rotate key.",
    );
    process.exit(1);
  }

  const { rotateAppEncryptionKey } = await import(
    "../src/lib/security/rotate-encryption-key"
  );
  console.log(
    dryRun
      ? "Dry run (no writes). Pass --execute to re-wrap org DEKs."
      : "Executing rotation: unwrap org DEKs with DOCUMENT_ENCRYPTION_KEY, re-wrap with DOCUMENT_ENCRYPTION_KEY_ROTATE.",
  );
  console.log(
    "Client data, files, and org secrets stay on each org DEK and are not rewritten.",
  );

  const result = await rotateAppEncryptionKey({
    oldKey,
    newKey,
    dryRun,
  });
  console.log(result);

  if (dryRun) {
    console.log("Re-run with: npm run key:rotate -- --execute");
    return;
  }

  console.log("");
  console.log("Rotation finished. Promote the rotate key:");
  console.log("1. Set DOCUMENT_ENCRYPTION_KEY to the same value as DOCUMENT_ENCRYPTION_KEY_ROTATE");
  console.log("   in .env.local and Vercel Production.");
  console.log("2. Redeploy so serverless functions pick up the new wrap key.");
  console.log("3. Remove DOCUMENT_ENCRYPTION_KEY_ROTATE after the new key is live.");
  console.log("4. Store the new key in your password manager. Destroy the old wrap key.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("rotate-encryption-key failed:", message);
  process.exit(1);
});
