import { promises as fs } from "node:fs";
import path from "node:path";

const blankCache = new Map<string, Uint8Array>();
const SITE_URL = "https://yuzu.solutions";

export async function loadBlankPdf(
  code: string,
  lang: "e" | "f",
): Promise<Uint8Array> {
  const key = `${code}${lang}`;
  const cached = blankCache.get(key);
  if (cached) return cached;

  const localPath = path.join(
    process.cwd(),
    "assets",
    "ircc",
    "blanks",
    `${key}.pdf`,
  );
  try {
    const buf = await fs.readFile(localPath);
    if (buf.byteLength > 1000) {
      const bytes = new Uint8Array(buf);
      blankCache.set(key, bytes);
      return bytes;
    }
  } catch {
    // fall through to remote
  }

  const dated = key.startsWith("imm5406")
    ? [
        key.endsWith("f")
          ? "https://www.canada.ca/content/dam/ircc/documents/pdf/francais/trousses/form/imm5406/01-05-2026/imm5406f.pdf"
          : "https://www.canada.ca/content/dam/ircc/documents/pdf/english/kits/forms/imm5406/01-05-2026/imm5406e.pdf",
      ]
    : [];
  const urls = [
    `${SITE_URL}/assets/forms/ircc/blanks/${key}.pdf`,
    `https://raw.githubusercontent.com/TROCKIN8R/yuzu_websites/main/yuzu_github_page/assets/forms/ircc/blanks/${key}.pdf`,
    ...dated,
  ];

  let lastError = "No blank PDF source";
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        lastError = `HTTP ${response.status}`;
        continue;
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength < 1000) {
        lastError = "Blank PDF too small";
        continue;
      }
      blankCache.set(key, bytes);
      return bytes;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(`Could not load blank ${key}: ${lastError}`);
}
