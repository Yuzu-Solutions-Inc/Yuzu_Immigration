import JSZip from "jszip";

import {
  decodeXmlEntities,
  escapeContractText,
  sanitizeContractHtml,
} from "@/lib/contracts/html";

function paragraphInnerToText(inner: string) {
  const withBreaks = inner
    .replace(/<w:tab\/>/gi, "\t")
    .replace(/<w:br\b[^>]*\/>/gi, "\n");
  const parts = [...withBreaks.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi)].map(
    (match) => decodeXmlEntities(match[1]),
  );
  return parts.join("");
}

export async function docxBufferToHtml(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("invalid_docx");
  const paragraphs = [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/gi)];
  const html = paragraphs
    .map((match) => {
      const text = paragraphInnerToText(match[0]);
      if (!text.trim()) return "<p><br></p>";
      return `<p>${escapeContractText(text).replaceAll("\n", "<br>")}</p>`;
    })
    .join("");
  return sanitizeContractHtml(html);
}

export function plainTextToHtml(text: string) {
  const paragraphs = text
    .replaceAll("\r\n", "\n")
    .split(/\n{2,}/)
    .map((block) => {
      const escaped = escapeContractText(block.trim()).replaceAll("\n", "<br>");
      return `<p>${escaped || "<br>"}</p>`;
    });
  return sanitizeContractHtml(paragraphs.join(""));
}
