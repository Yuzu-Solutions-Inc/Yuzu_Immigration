import { readFile } from "node:fs/promises";
import path from "node:path";

import { applyProductCopy } from "@/lib/brand/apply-product-copy";
import { legalPackLocale } from "@/lib/legal/downloads";

function stripInlineMarkdown(text: string) {
  return text.replace(/\*\*(.*?)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1");
}

function sectionId(title: string, index: number) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || `section-${index + 1}`;
}

export function parseMarkdownLegalDocument(markdown: string) {
  const lines = markdown.replace(/\r\n/g, "\n").trim().split("\n");
  let title = "";
  const introLines: string[] = [];
  const sections: { id: string; title: string; body: string }[] = [];
  let current: { title: string; body: string[] } | null = null;

  const pushCurrent = () => {
    if (!current) return;
    sections.push({
      id: sectionId(current.title, sections.length),
      title: stripInlineMarkdown(current.title),
      body: stripInlineMarkdown(current.body.join("\n").trim()),
    });
    current = null;
  };

  for (const line of lines) {
    if (!title && line.startsWith("# ")) {
      title = stripInlineMarkdown(line.slice(2).trim());
      continue;
    }
    if (line.startsWith("## ")) {
      pushCurrent();
      current = { title: line.slice(3).trim(), body: [] };
      continue;
    }
    if (current) current.body.push(line);
    else introLines.push(line);
  }
  pushCurrent();

  return {
    title: title || "Firm Data Processing Addendum",
    intro: stripInlineMarkdown(introLines.join("\n").trim()),
    sections,
  };
}

export async function loadFirmDpaMarkdown(locale: string) {
  const pack = legalPackLocale(locale);
  const file = path.join(
    process.cwd(),
    "public/legal",
    pack,
    "firm-data-processing-addendum.md",
  );
  return applyProductCopy(await readFile(file, "utf8"));
}
