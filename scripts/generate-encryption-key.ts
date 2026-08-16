import { randomBytes } from "node:crypto";

const key = randomBytes(32).toString("hex");

console.log(key);
console.log("");
console.log("Do not replace DOCUMENT_ENCRYPTION_KEY yet.");
console.log("1. Add this value as DOCUMENT_ENCRYPTION_KEY_ROTATE in .env.local.");
console.log("2. Dry-run:  npm run key:rotate");
console.log("3. Execute:  npm run key:rotate -- --execute");
console.log("4. Immediately copy this value into DOCUMENT_ENCRYPTION_KEY (local + Vercel) and redeploy.");
console.log("5. Delete DOCUMENT_ENCRYPTION_KEY_ROTATE.");
