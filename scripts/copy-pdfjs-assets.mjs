/**
 * Copy PDF.js worker, CMaps, fonts, ICC, and WASM into public/ so the in-app
 * viewer can open certified/encrypted IRCC PDFs without a CDN.
 */
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const pkgRoot = dirname(require.resolve("pdfjs-dist/package.json"));
const destRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "pdfjs");

mkdirSync(destRoot, { recursive: true });

const copies = [
  ["build/pdf.worker.min.mjs", "pdf.worker.min.mjs"],
  ["cmaps", "cmaps"],
  ["standard_fonts", "standard_fonts"],
  ["wasm", "wasm"],
  ["iccs", "iccs"],
];

for (const [from, to] of copies) {
  cpSync(join(pkgRoot, from), join(destRoot, to), { recursive: true });
}
