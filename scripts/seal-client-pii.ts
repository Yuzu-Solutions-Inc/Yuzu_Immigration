import { resolve } from "node:path";

import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  const { hasAppEncryptionKey } = await import(
    "../src/lib/security/app-encryption-key"
  );
  if (!hasAppEncryptionKey()) {
    console.error(
      "DOCUMENT_ENCRYPTION_KEY is missing or invalid in .env.local (64 hex chars).",
    );
    process.exit(1);
  }

  const { sealAllClientPii } = await import(
    "../src/lib/security/seal-client-pii"
  );
  const result = await sealAllClientPii();
  console.log("Sealed client fields:", result);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("seal-client-pii failed:", message);
  process.exit(1);
});
