import JSZip from "jszip";

import {
  decodeXmlEntities,
  escapeContractText,
  htmlToPlainText,
  sanitizeContractHtml,
} from "@/lib/contracts/html";

const MAX_PARAGRAPHS = 2_000;

function paragraphInnerToText(inner: string) {
  const withoutDeleted = inner.replace(
    /<w:del\b[\s\S]*?<\/w:del>/gi,
    "",
  );
  const withBreaks = withoutDeleted
    .replace(/<w:tab\/>/gi, "\t")
    .replace(/<w:br\b[^>]*\/?>/gi, "\n")
    .replace(/<\/w:pPr>/gi, "");
  const parts = [...withBreaks.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi)].map(
    (match) => decodeXmlEntities(match[1]),
  );
  return parts.join("");
}

export function isLegacyWordDoc(buffer: ArrayBuffer | Uint8Array) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return (
    bytes.length >= 4 &&
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0
  );
}

export async function docxBufferToHtml(
  buffer: ArrayBuffer | Uint8Array,
): Promise<string> {
  if (isLegacyWordDoc(buffer)) {
    throw new Error("unsupported_file");
  }
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("invalid_docx");
  const chunks = xml.split(/<\/w:p>/i).slice(0, MAX_PARAGRAPHS);
  const html = chunks
    .map((chunk) => {
      if (!/<w:p[\s>]/i.test(chunk)) return "";
      const text = paragraphInnerToText(chunk);
      if (!text.trim()) return "<p><br></p>";
      return `<p>${escapeContractText(text).replaceAll("\n", "<br>")}</p>`;
    })
    .join("");
  const sanitized = sanitizeContractHtml(html);
  if (!htmlToPlainText(sanitized).trim()) {
    throw new Error("empty_document");
  }
  return sanitized;
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
