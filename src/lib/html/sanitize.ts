import { decodeHtmlEntities } from "@/lib/html/entities";

/** Matches script/style/iframe blocks. Closing tags may include junk (`</script foo>`). */
const DANGEROUS_BLOCK_RE =
  /<(?:script|style|iframe)\b[^>]*>[\s\S]*?<\/(?:script|style|iframe)[^>]*>/gi;

const HTML_TAG_RE = /<[^>]+>/g;

function replaceUntilStable(
  input: string,
  pattern: RegExp,
  replacement: string,
): string {
  let prev = "";
  let cur = input;
  while (cur !== prev) {
    prev = cur;
    cur = cur.replace(pattern, replacement);
  }
  return cur;
}

export function removeDangerousHtmlBlocks(html: string): string {
  return replaceUntilStable(html, DANGEROUS_BLOCK_RE, "");
}

const EVENT_HANDLER_RE = /\bon[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;

export function removeHtmlEventHandlers(html: string): string {
  return replaceUntilStable(html, EVENT_HANDLER_RE, "");
}

const DANGEROUS_URL_SCHEME_RE = /(?:javascript|data|vbscript):/gi;

export function removeDangerousUrlSchemes(html: string): string {
  return replaceUntilStable(html, DANGEROUS_URL_SCHEME_RE, "");
}

/** Strip tags and leftover `<>` so nested/unclosed markup cannot re-form. */
export function stripRemainingHtmlTags(html: string): string {
  return replaceUntilStable(html, HTML_TAG_RE, " ").replace(/[<>]/g, "");
}

export function stripHtmlTags(html: string): string {
  return stripRemainingHtmlTags(removeDangerousHtmlBlocks(html));
}

export function stripHtmlToPlainText(html: string): string {
  return decodeHtmlEntities(stripHtmlTags(html)).replace(/\s+/g, " ").trim();
}
