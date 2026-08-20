import { createHash } from "node:crypto";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { decodeXmlEntities } from "@/lib/contracts/html";
import { removeDangerousHtmlBlocks } from "@/lib/html/sanitize";
import type { ContractAuditEventRow, ContractSignerRow } from "@/lib/contracts/types";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const BODY_SIZE = 11;
const HEADING_SIZE = 16;
const LINE_GAP = 4;
const BRAND = rgb(0.12, 0.18, 0.16);
const MUTED = rgb(0.4, 0.42, 0.4);
const RULE = rgb(0.82, 0.84, 0.82);

type Block =
  | { type: "h1" | "h2" | "p" | "li"; text: string }
  | { type: "sign"; role: "client" | "consultant" }
  | { type: "space" };

function toWinAnsi(text: string) {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\t\n\r\x20-\x7E\u00A0-\u00FF]/g, "?");
}

function wrapLines(font: PDFFont, text: string, size: number, maxWidth: number) {
  const words = toWinAnsi(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word;
    } else {
      let chunk = "";
      for (const ch of word) {
        const trial = chunk + ch;
        if (font.widthOfTextAtSize(trial, size) <= maxWidth) chunk = trial;
        else {
          if (chunk) lines.push(chunk);
          chunk = ch;
        }
      }
      current = chunk;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

function htmlToBlocks(html: string): Block[] {
  const safe = removeDangerousHtmlBlocks(html);
  const marked = safe
    .replace(
      /<div[^>]*data-sign="(client|consultant)"[^>]*>[\s\S]*?<\/div>/gi,
      (_, role: string) => `\n%%SIGN:${role}%%\n`,
    )
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<h1[^>]*>/gi, "\n# ")
    .replace(/<h2[^>]*>/gi, "\n## ")
    .replace(/<h3[^>]*>/gi, "\n## ")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<\/(p|h1|h2|h3|li|div|blockquote|ul|ol)>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  const blocks: Block[] = [];
  for (const raw of marked.split("\n")) {
    const line = decodeXmlEntities(raw).replace(/\s+/g, " ").trim();
    if (!line) {
      if (blocks.at(-1)?.type !== "space") blocks.push({ type: "space" });
      continue;
    }
    if (line.startsWith("%%SIGN:client%%")) {
      blocks.push({ type: "sign", role: "client" });
      continue;
    }
    if (line.startsWith("%%SIGN:consultant%%")) {
      blocks.push({ type: "sign", role: "consultant" });
      continue;
    }
    if (line.startsWith("# ")) {
      blocks.push({ type: "h1", text: line.slice(2) });
      continue;
    }
    if (line.startsWith("## ")) {
      blocks.push({ type: "h2", text: line.slice(3) });
      continue;
    }
    if (line.startsWith("• ")) {
      blocks.push({ type: "li", text: line.slice(2) });
      continue;
    }
    blocks.push({ type: "p", text: line });
  }
  return blocks;
}

class Pager {
  doc: PDFDocument;
  font: PDFFont;
  bold: PDFFont;
  page: PDFPage;
  y: number;

  constructor(doc: PDFDocument, font: PDFFont, bold: PDFFont) {
    this.doc = doc;
    this.font = font;
    this.bold = bold;
    this.page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  ensure(height: number) {
    if (this.y - height < MARGIN) {
      this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      this.y = PAGE_HEIGHT - MARGIN;
    }
  }

  drawText(
    text: string,
    opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; indent?: number },
  ) {
    const size = opts.size ?? BODY_SIZE;
    const font = opts.bold ? this.bold : this.font;
    const maxWidth = PAGE_WIDTH - MARGIN * 2 - (opts.indent ?? 0);
    const lines = wrapLines(font, text, size, maxWidth);
    for (const line of lines) {
      this.ensure(size + LINE_GAP);
      this.page.drawText(toWinAnsi(line), {
        x: MARGIN + (opts.indent ?? 0),
        y: this.y - size,
        size,
        font,
        color: opts.color ?? BRAND,
      });
      this.y -= size + LINE_GAP;
    }
  }
}

function parsePngDataUrl(dataUrl: string | null | undefined) {
  if (!dataUrl?.startsWith("data:image/png;base64,")) return null;
  const b64 = dataUrl.slice("data:image/png;base64,".length);
  try {
    return Buffer.from(b64, "base64");
  } catch {
    return null;
  }
}

async function drawSignature(
  pager: Pager,
  signer: ContractSignerRow | undefined,
  role: "client" | "consultant",
) {
  pager.ensure(90);
  pager.y -= 8;
  pager.page.drawLine({
    start: { x: MARGIN, y: pager.y },
    end: { x: PAGE_WIDTH - MARGIN, y: pager.y },
    thickness: 0.6,
    color: RULE,
  });
  pager.y -= 10;
  const label = role === "client" ? "Client" : "Consultant";
  if (signer?.status === "signed") {
    const png = parsePngDataUrl(signer.signature_image);
    if (png) {
      try {
        const image = await pager.doc.embedPng(png);
        const width = Math.min(220, image.width);
        const height = (image.height / image.width) * width;
        pager.ensure(height + 36);
        pager.page.drawImage(image, {
          x: MARGIN,
          y: pager.y - height,
          width,
          height,
        });
        pager.y -= height + 6;
      } catch {
        pager.drawText(signer.signature_text || signer.full_name, { size: 16 });
      }
    } else {
      pager.drawText(signer.signature_text || signer.full_name, { size: 16 });
    }
    pager.drawText(`${label} · signed electronically`, {
      size: 9,
      color: MUTED,
    });
    if (signer.signed_at) {
      pager.drawText(new Date(signer.signed_at).toISOString(), {
        size: 9,
        color: MUTED,
      });
    }
  } else {
    pager.y -= 28;
    pager.drawText(`${label} signature`, { size: 9, color: MUTED });
  }
  pager.y -= 10;
}

export async function buildContractPdf(input: {
  title: string;
  organizationName: string;
  filledHtml: string;
  filledSha256: string;
  envelopeId: string;
  signers: ContractSignerRow[];
  audit: ContractAuditEventRow[];
  completedAt?: string | null;
}): Promise<{ bytes: Uint8Array; sha256: string }> {
  const doc = await PDFDocument.create();
  doc.setTitle(input.title);
  doc.setAuthor(input.organizationName);
  doc.setSubject(`Yuzu contract envelope ${input.envelopeId}`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pager = new Pager(doc, font, bold);

  pager.drawText(input.organizationName, { size: 10, color: MUTED });
  pager.drawText(input.title, { size: HEADING_SIZE, bold: true });
  pager.y -= 8;

  const byRole = new Map(input.signers.map((row) => [row.role, row]));
  for (const block of htmlToBlocks(input.filledHtml)) {
    if (block.type === "space") {
      pager.y -= 8;
      continue;
    }
    if (block.type === "sign") {
      await drawSignature(pager, byRole.get(block.role), block.role);
      continue;
    }
    if (block.type === "h1") {
      pager.y -= 6;
      pager.drawText(block.text, { size: 14, bold: true });
      continue;
    }
    if (block.type === "h2") {
      pager.y -= 4;
      pager.drawText(block.text, { size: 12, bold: true });
      continue;
    }
    pager.drawText(block.type === "li" ? `• ${block.text}` : block.text, {
      size: BODY_SIZE,
      indent: block.type === "li" ? 12 : 0,
    });
  }

  pager.page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  pager.y = PAGE_HEIGHT - MARGIN;
  pager.drawText("Certificate of completion", { size: HEADING_SIZE, bold: true });
  pager.y -= 6;
  pager.drawText(
    "This certificate is part of the signed record. It identifies the document, the signers, and the audit trail used to evidence intent and integrity.",
    { size: 10, color: MUTED },
  );
  pager.y -= 8;
  pager.drawText(`Envelope ID: ${input.envelopeId}`, { size: 10 });
  pager.drawText(`Document SHA-256: ${input.filledSha256}`, { size: 9 });
  pager.drawText(`Organization: ${input.organizationName}`, { size: 10 });
  if (input.completedAt) {
    pager.drawText(`Completed: ${input.completedAt}`, { size: 10 });
  }
  pager.y -= 10;
  pager.drawText("Signers", { size: 12, bold: true });
  for (const signer of [...input.signers].sort((a, b) => a.sort_order - b.sort_order)) {
    pager.y -= 4;
    pager.drawText(
      `${signer.role}: ${signer.full_name} <${signer.email}> — ${signer.status}`,
      { size: 10 },
    );
    if (signer.signed_at) {
      pager.drawText(
        `Signed ${signer.signed_at} · ${signer.signature_kind ?? "n/a"} · IP ${signer.ip ?? "n/a"}`,
        { size: 9, color: MUTED },
      );
    }
    if (signer.consent_accepted_at) {
      pager.drawText(
        `Consent ${signer.consent_version ?? ""} at ${signer.consent_accepted_at}`,
        { size: 9, color: MUTED },
      );
    }
  }
  pager.y -= 12;
  pager.drawText("Audit trail", { size: 12, bold: true });
  for (const event of input.audit) {
    pager.drawText(
      `${event.created_at} · ${event.event_type}${event.ip ? ` · ${event.ip}` : ""}`,
      { size: 9, color: MUTED },
    );
  }
  pager.y -= 14;
  pager.drawText(
    "Each signer confirmed they agreed to use an electronic signature and that it is the legal equivalent of their handwritten signature. The filled document hash was recorded before signatures were applied. The signed PDF hash is recorded after the last signature.",
    { size: 9, color: MUTED },
  );

  const bytes = await doc.save();
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return { bytes, sha256 };
}
