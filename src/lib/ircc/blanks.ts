import { promises as fs } from "node:fs";
import path from "node:path";

const blankCache = new Map<string, Uint8Array>();
const SITE_URL = "https://yuzu.solutions";
export const IRCC_BLANKS_BUCKET = "ircc-blanks";

async function loadBlankFromStorage(key: string): Promise<Uint8Array | null> {
  try {
    const { createServiceClient } = await import("@/lib/supabase/admin");
    const admin = createServiceClient();
    const { data, error } = await admin.storage
      .from(IRCC_BLANKS_BUCKET)
      .download(`${key}.pdf`);
    if (error || !data) return null;
    const bytes = new Uint8Array(await data.arrayBuffer());
    return bytes.byteLength > 1000 ? bytes : null;
  } catch {
    return null;
  }
}

export async function loadBlankPdf(
  code: string,
  lang: "e" | "f",
): Promise<Uint8Array> {
  const key = `${code}${lang}`;
  const cached = blankCache.get(key);
  if (cached) return cached;

  const fromStorage = await loadBlankFromStorage(key);
  if (fromStorage) {
    blankCache.set(key, fromStorage);
    return fromStorage;
  }

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

  const dated = key.startsWith("imm5645")
    ? [
        key.endsWith("f")
          ? "https://www.canada.ca/content/dam/ircc/documents/pdf/francais/trousses/form/imm5645/01-01-2021/imm5645f.pdf"
          : "https://www.canada.ca/content/dam/ircc/documents/pdf/english/kits/forms/imm5645/01-01-2021/imm5645e.pdf",
        key.endsWith("f")
          ? "https://www.canada.ca/content/dam/ircc/documents/pdf/francais/trousses/form/imm5645f.pdf"
          : "https://www.canada.ca/content/dam/ircc/documents/pdf/english/kits/forms/imm5645e.pdf",
      ]
    : key.startsWith("imm5406")
      ? [
          key.endsWith("f")
            ? "https://www.canada.ca/content/dam/ircc/documents/pdf/francais/trousses/form/imm5406/01-05-2026/imm5406f.pdf"
            : "https://www.canada.ca/content/dam/ircc/documents/pdf/english/kits/forms/imm5406/01-05-2026/imm5406e.pdf",
        ]
      : key.startsWith("imm5709")
        ? [
            key.endsWith("f")
              ? "https://www.canada.ca/content/dam/ircc/documents/pdf/francais/trousses/form/imm5709/01-06-2026/imm5709f.pdf"
              : "https://www.canada.ca/content/dam/ircc/documents/pdf/english/kits/forms/imm5709/01-06-2026/imm5709e.pdf",
            key.endsWith("f")
              ? "https://www.canada.ca/content/dam/ircc/documents/pdf/francais/trousses/form/imm5709f.pdf"
              : "https://www.canada.ca/content/dam/ircc/documents/pdf/english/kits/forms/imm5709e.pdf",
          ]
        : key.startsWith("imm5257sch1")
          ? [
              key.endsWith("f")
                ? "https://www.canada.ca/content/dam/ircc/documents/pdf/francais/trousses/form/imm5257-sch1/01-09-2023/imm5257_1f.pdf"
                : "https://www.canada.ca/content/dam/ircc/documents/pdf/english/kits/forms/imm5257-sch1/01-09-2023/imm5257_1e.pdf",
              key.endsWith("f")
                ? "https://www.canada.ca/content/dam/ircc/documents/pdf/francais/trousses/form/imm5257sch1f.pdf"
                : "https://www.canada.ca/content/dam/ircc/documents/pdf/english/kits/forms/imm5257sch1e.pdf",
            ]
          : key.startsWith("imm5257")
            ? [
                key.endsWith("f")
                  ? "https://www.canada.ca/content/dam/ircc/documents/pdf/francais/trousses/form/imm5257/01-09-2023/imm5257f.pdf"
                  : "https://www.canada.ca/content/dam/ircc/documents/pdf/english/kits/forms/imm5257/01-09-2023/imm5257e.pdf",
                key.endsWith("f")
                  ? "https://www.canada.ca/content/dam/ircc/documents/pdf/francais/trousses/form/imm5257f.pdf"
                  : "https://www.canada.ca/content/dam/ircc/documents/pdf/english/kits/forms/imm5257e.pdf",
              ]
            : key.startsWith("imm5708")
              ? [
                  key.endsWith("f")
                    ? "https://www.canada.ca/content/dam/ircc/documents/pdf/francais/trousses/form/imm5708/01-09-2023/imm5708f.pdf"
                    : "https://www.canada.ca/content/dam/ircc/documents/pdf/english/kits/forms/imm5708/01-09-2023/imm5708e.pdf",
                  key.endsWith("f")
                    ? "https://www.canada.ca/content/dam/ircc/documents/pdf/francais/trousses/form/imm5708f.pdf"
                    : "https://www.canada.ca/content/dam/ircc/documents/pdf/english/kits/forms/imm5708e.pdf",
                ]
              : key.startsWith("imm0008")
                ? [
                    key.endsWith("f")
                      ? "https://www.canada.ca/content/dam/ircc/documents/pdf/francais/trousses/form/imm0008/01-05-2026/imm0008f.pdf"
                      : "https://www.canada.ca/content/dam/ircc/documents/pdf/english/kits/forms/imm0008/01-05-2026/imm0008e.pdf",
                  ]
                : key.startsWith("imm5669")
                  ? [
                      key.endsWith("f")
                        ? "https://www.canada.ca/content/dam/ircc/documents/pdf/francais/trousses/form/imm5669/01-05-2021/imm5669f.pdf"
                        : "https://www.canada.ca/content/dam/ircc/documents/pdf/english/kits/forms/imm5669/01-05-2021/imm5669e.pdf",
                    ]
                  : key.startsWith("imm1344")
                    ? [
                        key.endsWith("f")
                          ? "https://www.canada.ca/content/dam/ircc/documents/pdf/francais/trousses/form/imm1344/01-09-2024/imm1344f.pdf"
                          : "https://www.canada.ca/content/dam/ircc/documents/pdf/english/kits/forms/imm1344/01-09-2024/imm1344e.pdf",
                      ]
                    : key.startsWith("imm5562")
                      ? [
                          key.endsWith("f")
                            ? "https://www.canada.ca/content/dam/ircc/documents/pdf/francais/trousses/form/imm5562/01-07-2024/imm5562f.pdf"
                            : "https://www.canada.ca/content/dam/ircc/documents/pdf/english/kits/forms/imm5562/01-07-2024/imm5562e.pdf",
                        ]
                      : key.startsWith("cit0002")
                        ? [
                            key.endsWith("f")
                              ? "https://www.canada.ca/content/dam/ircc/documents/pdf/francais/trousses/form/cit0002/01-02-2026/cit0002f.pdf"
                              : "https://www.canada.ca/content/dam/ircc/documents/pdf/english/kits/forms/cit0002/01-02-2026/cit0002e.pdf",
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
