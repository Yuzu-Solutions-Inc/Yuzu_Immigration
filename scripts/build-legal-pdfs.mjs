#!/usr/bin/env node
/**
 * Builds consulting-firm download PDFs from the markdown templates in
 * public/legal/{en,fr}/*.md. Edit the .md files, then rerun this script.
 *
 *   npm run legal:pdf
 */
import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
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

async function buildLocale(locale) {
  const dir = path.join(root, "public/legal", locale);
  const files = (await readdir(dir))
    .filter((name) => name.endsWith(".md"))
    .sort();
  if (files.length === 0) {
    throw new Error(`No markdown templates in ${dir}`);
  }

  const footer = FOOTERS[locale] ?? FOOTERS.en;
  console.log(`Building ${files.length} PDFs in public/legal/${locale}/`);
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
    dir,
  );
}

for (const locale of ["en", "fr"]) {
  await buildLocale(locale);
}

console.log("Done. Markdown templates were left in place.");
