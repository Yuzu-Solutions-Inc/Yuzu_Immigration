import { decodeHtmlEntities } from "@/lib/html/entities";

/** Matches script/style/iframe blocks; closing tag allows trailing whitespace. */
const DANGEROUS_BLOCK_RE =
  /<(?:script|style|iframe)\b[^>]*>[\s\S]*?<\/(?:script|style|iframe)\s*>/gi;

export function removeDangerousHtmlBlocks(html: string): string {
  let prev = "";
  let cur = html;
  while (cur !== prev) {
    prev = cur;
    cur = cur.replace(DANGEROUS_BLOCK_RE, "");
  }
  return cur;
}

const EVENT_HANDLER_RE = /\bon[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;

export function removeHtmlEventHandlers(html: string): string {
  let prev = "";
  let cur = html;
  while (cur !== prev) {
    prev = cur;
    cur = cur.replace(EVENT_HANDLER_RE, "");
  }
  return cur;
}

const DANGEROUS_URL_SCHEME_RE = /(?:javascript|data|vbscript):/gi;

export function removeDangerousUrlSchemes(html: string): string {
  let prev = "";
  let cur = html;
  while (cur !== prev) {
    prev = cur;
    cur = cur.replace(DANGEROUS_URL_SCHEME_RE, "");
  }
  return cur;
}

export function stripHtmlTags(html: string): string {
  return removeDangerousHtmlBlocks(html).replace(/<[^>]+>/g, " ");
}

export function stripHtmlToPlainText(html: string): string {
  return decodeHtmlEntities(stripHtmlTags(html)).replace(/\s+/g, " ").trim();
}
