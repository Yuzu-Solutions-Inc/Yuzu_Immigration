import { randomBytes } from "node:crypto";

const key = randomBytes(32).toString("hex");

console.log(key);
console.log("");
console.log("Add this to .env.local (and Vercel) as DOCUMENT_ENCRYPTION_KEY_ROTATE.");
console.log("Keep DOCUMENT_ENCRYPTION_KEY as the current key until rotation finishes.");
console.log("Then run: npm run key:rotate -- --execute");
