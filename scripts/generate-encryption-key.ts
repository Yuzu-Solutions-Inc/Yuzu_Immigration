import { randomBytes } from "node:crypto";

const key = randomBytes(32).toString("hex");

console.log(key);
console.log("");
console.log("Do not replace DOCUMENT_ENCRYPTION_KEY yet.");
console.log("1. Add this value as DOCUMENT_ENCRYPTION_KEY_ROTATE in .env.local and Vercel Production.");
console.log("2. Redeploy so production can unwrap with either wrap key.");
console.log("3. Dry-run:  npm run key:rotate");
console.log("4. Execute:  npm run key:rotate -- --execute");
console.log("5. Copy this value into DOCUMENT_ENCRYPTION_KEY, redeploy, then delete DOCUMENT_ENCRYPTION_KEY_ROTATE.");
