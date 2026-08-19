import type { AppLocale } from "@/lib/i18n/locales";

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "h1",
  "h2",
  "h3",
  "ul",
  "ol",
  "li",
  "div",
  "span",
  "blockquote",
]);

const VAR_RE = /^[a-z][a-z0-9_]{0,39}$/;
const TOKEN_RE = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gi;

export function escapeContractText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function decodeXmlEntities(value: string) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");
}

export function wrapContractTokens(html: string) {
  return html.replace(TOKEN_RE, (full, key: string, offset: number) => {
    const k = key.toLowerCase();
    const before = html.slice(Math.max(0, offset - 120), offset);
    if (/data-var=["'][a-z0-9_]+["'][^>]*>\s*$/i.test(before)) return full;
    if (k === "signature_client") {
      return `<div data-sign="client">Client signature</div>`;
    }
    if (k === "signature_consultant") {
      return `<div data-sign="consultant">Consultant signature</div>`;
    }
    if (!VAR_RE.test(k)) return "";
    return `<span data-var="${k}" contenteditable="false">{{${k}}}</span>`;
  });
}

export function sanitizeContractHtml(raw: string, maxChars = 200_000): string {
  let html = raw.replace(/\0/g, "").slice(0, maxChars);
  html = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  html = html.replace(/<style[\s\S]*?<\/style>/gi, "");
  html = html.replace(/<iframe[\s\S]*?<\/iframe>/gi, "");
  html = html.replace(/on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  html = html.replace(/javascript:/gi, "");
  html = html.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (tag, name: string) => {
    const n = name.toLowerCase();
    if (!ALLOWED_TAGS.has(n)) return "";
    if (tag.startsWith("</")) return `</${n}>`;
    if (n === "br") return "<br>";
    if (n === "span") {
      const match = tag.match(/data-var=["']([a-z][a-z0-9_]*)["']/i);
      if (match && VAR_RE.test(match[1].toLowerCase())) {
        return `<span data-var="${match[1].toLowerCase()}" contenteditable="false">`;
      }
      return "<span>";
    }
    if (n === "div") {
      const match = tag.match(/data-sign=["'](client|consultant)["']/i);
      if (match) return `<div data-sign="${match[1].toLowerCase()}">`;
      return "<div>";
    }
    return `<${n}>`;
  });
  html = wrapContractTokens(html);
  const trimmed = html.replace(/\s+\n/g, "\n").trim();
  return trimmed || "<p></p>";
}

export function fillContractHtml(
  html: string,
  vars: Record<string, string>,
): string {
  const replaced = html.replace(
    /<span data-var="([a-z][a-z0-9_]*)"[^>]*>[\s\S]*?<\/span>/gi,
    (_, key: string) => escapeContractText(vars[key] ?? ""),
  );
  return replaced.replace(TOKEN_RE, (_, key: string) =>
    escapeContractText(vars[key.toLowerCase()] ?? ""),
  );
}

export function defaultContractBodyHtml(locale: AppLocale = "en") {
  const bodies: Record<AppLocale, string> = {
    en: `<p>This agreement is between {{organization_name}} (“the firm”) and {{customer_name}} (“the client”).</p>
<p>Service: {{service_name}}</p>
<p>Appointment: {{datetime}} ({{timezone}})</p>
<p>By signing below, the client confirms they have read this document and agree to sign it electronically. This electronic signature has the same legal effect as a handwritten signature under applicable Canadian electronic commerce law.</p>
<div data-sign="client">Client signature</div>
<div data-sign="consultant">Consultant signature</div>`,
    fr: `<p>Cette entente est conclue entre {{organization_name}} (« le cabinet ») et {{customer_name}} (« le client »).</p>
<p>Service : {{service_name}}</p>
<p>Rendez-vous : {{datetime}} ({{timezone}})</p>
<p>En signant ci-dessous, le client confirme avoir lu ce document et accepte de le signer électroniquement. Cette signature électronique a le même effet qu’une signature manuscrite en vertu du droit canadien applicable du commerce électronique.</p>
<div data-sign="client">Signature du client</div>
<div data-sign="consultant">Signature du consultant</div>`,
    es: `<p>Este acuerdo se celebra entre {{organization_name}} («la firma») y {{customer_name}} («el cliente»).</p>
<p>Servicio: {{service_name}}</p>
<p>Cita: {{datetime}} ({{timezone}})</p>
<p>Al firmar abajo, el cliente confirma que ha leído este documento y acepta firmarlo electrónicamente. Esta firma electrónica tiene el mismo efecto que una firma manuscrita según la legislación canadiense aplicable de comercio electrónico.</p>
<div data-sign="client">Firma del cliente</div>
<div data-sign="consultant">Firma del consultor</div>`,
  };
  return sanitizeContractHtml(bodies[locale] ?? bodies.en);
}

export function extractContractVariableKeys(html: string): string[] {
  const keys = new Set<string>();
  const spanRe = /data-var="([a-z][a-z0-9_]*)"/gi;
  for (const match of html.matchAll(spanRe)) keys.add(match[1]);
  for (const match of html.matchAll(TOKEN_RE)) {
    keys.add(match[1].toLowerCase());
  }
  return [...keys];
}

export function htmlToPlainText(html: string) {
  return decodeXmlEntities(
    html
      .replace(/<div[^>]*data-sign="[^"]+"[^>]*>[\s\S]*?<\/div>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|h1|h2|h3|li|div|blockquote)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
}

export { decodeXmlEntities };
