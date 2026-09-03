#!/usr/bin/env node
/**
 * Builds consulting-firm download PDFs from the markdown templates in
 * public/legal/{en,fr}/*.md. Edit the .md files, then rerun this script.
 *
 *   npm run legal:pdf
 *
 * `%PRODUCT_NAME%` and `%PRIVACY_EMAIL%` in the markdown are expanded from
 * `src/lib/brand/product.ts`.
 */
import { spawn } from "node:child_process";
import { copyFile, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stylesheet = path.join(root, "scripts/legal-pdf.css");
const chrome =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const FOOTERS = {
  en: "Yuzu Solutions Inc. — consulting firm pack",
  fr: "Yuzu Solutions Inc. — dossier cabinets",
};

function readProductField(source, key) {
  const match = source.match(new RegExp(`^\\s*${key}:\\s*"([^"]+)"`, "m"));
  if (!match) {
    throw new Error(`Could not read product.${key} from src/lib/brand/product.ts`);
  }
  return match[1];
}

function applyProductCopy(text, identity) {
  return text
    .replaceAll("%PRODUCT_NAME%", identity.name)
    .replaceAll("%OPERATOR_NAME%", identity.operator)
    .replaceAll("%SUPPORT_EMAIL%", identity.supportEmail)
    .replaceAll("%PRIVACY_EMAIL%", identity.privacyEmail);
}

function pdfOptions(footerLabel) {
  return {
    format: "Letter",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: "<div></div>",
    footerTemplate: `<div style="font-size:9px;width:100%;padding:0 16mm;color:#5b6660;font-family:Helvetica,Arial,sans-serif;display:flex;justify-content:space-between;"><span>${footerLabel}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
    margin: { top: "18mm", right: "16mm", bottom: "22mm", left: "16mm" },
  };
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited ${code}`));
    });
  });
}

async function buildLocale(locale, identity) {
  const dir = path.join(root, "public/legal", locale);
  const files = (await readdir(dir))
    .filter((name) => name.endsWith(".md"))
    .sort();
  if (files.length === 0) {
    throw new Error(`No markdown templates in ${dir}`);
  }

  const work = await mkdtemp(path.join(os.tmpdir(), `dossierly-legal-${locale}-`));
  for (const name of files) {
    const source = await readFile(path.join(dir, name), "utf8");
    await writeFile(path.join(work, name), applyProductCopy(source, identity));
  }

  const footer = FOOTERS[locale] ?? FOOTERS.en;
  console.log(`Building ${files.length} PDFs in public/legal/${locale}/`);
  try {
    await run(
      "npx",
      [
        "--yes",
        "md-to-pdf",
        ...files,
        "--stylesheet",
        stylesheet,
        "--launch-options",
        JSON.stringify({
          executablePath: chrome,
          args: ["--no-sandbox"],
        }),
        "--pdf-options",
        JSON.stringify(pdfOptions(footer)),
      ],
      work,
    );
    for (const name of files) {
      const pdfName = name.replace(/\.md$/i, ".pdf");
      await copyFile(path.join(work, pdfName), path.join(dir, pdfName));
    }
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

const productSource = await readFile(
  path.join(root, "src/lib/brand/product.ts"),
  "utf8",
);
const identity = {
  name: readProductField(productSource, "name"),
  operator: readProductField(productSource, "operator"),
  supportEmail: readProductField(productSource, "supportEmail"),
  privacyEmail: readProductField(productSource, "privacyEmail"),
};

for (const locale of ["en", "fr"]) {
  await buildLocale(locale, identity);
}

console.log("Done. Markdown templates were left in place.");
