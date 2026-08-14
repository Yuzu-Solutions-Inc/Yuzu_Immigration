/**
 * Weekly IRCC form watch:
 * 1. Compare canada.ca "last updated" months to src/lib/ircc/form-revisions.json
 * 2. Download current EN/FR PDFs and check size / decryptability
 * 3. Assert questionnaire choice codes still exist on those PDFs
 *
 *   npm run ircc:validate
 *   npm run ircc:validate -- --dates-only
 *   npm run ircc:validate -- --local
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import formMeta from "../src/lib/ircc/form-meta.json";
import revisions from "../src/lib/ircc/form-revisions.json";
import { LOV_CONTRACT } from "../src/lib/ircc/lov-contract";
import { extractXfaLovs, licsFor } from "../src/lib/ircc/xfa-extract";

const UA =
  "YuzuImmigration-IRCC-watch/1.0 (+https://github.com/Yuzu-Solutions-Inc/MyConsultant)";
const IRCC_ORIGIN = "https://www.canada.ca";

type FormRevision = {
  irccUpdated: string;
  guideEn: string;
  guideFr: string;
};

type Finding = { level: "error" | "warn"; message: string };

type FormResult = {
  liveUpdated: string | null;
  errors: string[];
  warnings: string[];
};

const findings: Finding[] = [];
const formResults = new Map<string, FormResult>();

function ensureForm(code: string): FormResult {
  const existing = formResults.get(code);
  if (existing) return existing;
  const created: FormResult = { liveUpdated: null, errors: [], warnings: [] };
  formResults.set(code, created);
  return created;
}

function formCodeFromMessage(message: string): string | null {
  const token = /^(imm[0-9]+[a-z0-9]*)/i.exec(message)?.[1];
  if (!token) return null;
  const lower = token.toLowerCase();
  const pins = revisions.forms as Record<string, FormRevision>;
  if (pins[lower]) return lower;
  if (/[ef]$/.test(lower) && pins[lower.slice(0, -1)]) return lower.slice(0, -1);
  return lower;
}

function error(message: string) {
  findings.push({ level: "error", message });
  const code = formCodeFromMessage(message);
  if (code) ensureForm(code).errors.push(message);
  console.error(`ERROR  ${message}`);
}

function warn(message: string) {
  findings.push({ level: "warn", message });
  const code = formCodeFromMessage(message);
  if (code) ensureForm(code).warnings.push(message);
  console.warn(`WARN   ${message}`);
}

function ok(message: string) {
  console.log(`OK     ${message}`);
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "user-agent": UA, accept: "text/html" },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`${url} → HTTP ${response.status}`);
  }
  return response.text();
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url, {
    headers: { "user-agent": UA, accept: "application/pdf" },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`${url} → HTTP ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

function parseIndexDates(html: string): Map<string, string> {
  const out = new Map<string, string>();
  const re =
    /<td[^>]*>IMM\s+([0-9]+[A-Za-z0-9]*)<\/td>\s*<td[^>]*>[\s\S]*?<\/td>\s*<td[^>]*>(\d{4}-\d{2})<\/td>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    out.set(`imm${m[1].toLowerCase()}`, m[2]);
  }
  return out;
}

function pdfHref(html: string, lang: "e" | "f"): string | null {
  const hrefs = [...html.matchAll(/href="([^"]+\.pdf)"/gi)].map((m) => m[1]);
  const suffix = lang === "f" ? "f.pdf" : "e.pdf";
  const hit =
    hrefs.find((h) => h.toLowerCase().endsWith(suffix)) ?? hrefs[0];
  if (!hit) return null;
  if (hit.startsWith("http")) return hit;
  return `${IRCC_ORIGIN}${hit.startsWith("/") ? "" : "/"}${hit}`;
}

function loadLocalBlank(code: string): Uint8Array | null {
  const file = path.join(process.cwd(), "assets", "ircc", "blanks", `${code}.pdf`);
  try {
    return new Uint8Array(readFileSync(file));
  } catch {
    return null;
  }
}

async function checkDates() {
  const html = await fetchText(revisions.indexUrl);
  const live = parseIndexDates(html);
  if (live.size === 0) {
    error("Could not parse any form dates from the IRCC index page.");
    return;
  }
  ok(`IRCC index lists ${live.size} forms.`);
  for (const [code, pin] of Object.entries(revisions.forms) as [
    string,
    FormRevision,
  ][]) {
    const current = live.get(code);
    if (!current) {
      warn(`${code}: not found on IRCC index (page may have been renamed).`);
      continue;
    }
    ensureForm(code).liveUpdated = current;
    if (current !== pin.irccUpdated) {
      error(
        `${code}: IRCC last updated ${current}, app pinned ${pin.irccUpdated}. Re-download blanks, re-extract choice lists, and update form-revisions.json.`,
      );
    } else {
      ok(`${code}: ${current}`);
    }
  }
}

async function checkBlank(
  blankKey: string,
  pdf: Uint8Array,
  cache: Map<string, Awaited<ReturnType<typeof extractXfaLovs>> | "failed">,
) {
  const meta = (formMeta as Record<string, { fileKeyHex: string; bytes: number }>)[
    blankKey
  ];
  if (!meta) {
    warn(`${blankKey}: no form-meta.json entry; skipped decrypt / choice check.`);
    return;
  }
  if (Math.abs(pdf.byteLength - meta.bytes) > 2048) {
    error(
      `${blankKey}: PDF is ${pdf.byteLength} bytes, form-meta expects ${meta.bytes}. Encryption keys and choice lists likely changed.`,
    );
  } else {
    ok(`${blankKey}: ${pdf.byteLength} bytes (matches form-meta).`);
  }
  try {
    const extracted = await extractXfaLovs(pdf, meta.fileKeyHex);
    if (extracted.decodedStreams === 0) {
      error(
        `${blankKey}: decrypted 0 XFA streams — file key is stale for this revision.`,
      );
      cache.set(blankKey, "failed");
      return;
    }
    cache.set(blankKey, extracted);
    ok(`${blankKey}: decoded ${extracted.decodedStreams} XFA streams.`);
  } catch (err) {
    cache.set(blankKey, "failed");
    error(
      `${blankKey}: decrypt failed (${err instanceof Error ? err.message : err}).`,
    );
  }
}

async function checkPdfsAndChoices(preferLocal: boolean) {
  const extracted = new Map<
    string,
    Awaited<ReturnType<typeof extractXfaLovs>> | "failed"
  >();
  const needed = new Set(LOV_CONTRACT.flatMap((c) => c.blanks));

  for (const [code, pin] of Object.entries(revisions.forms) as [
    string,
    FormRevision,
  ][]) {
    for (const lang of ["e", "f"] as const) {
      const blankKey = `${code}${lang}`;
      if (!needed.has(blankKey) && !(formMeta as Record<string, unknown>)[blankKey]) {
        continue;
      }
      const guide = lang === "f" ? pin.guideFr : pin.guideEn;
      let pdf: Uint8Array | null = preferLocal ? loadLocalBlank(blankKey) : null;
      if (!pdf) {
        try {
          const page = await fetchText(guide);
          const href = pdfHref(page, lang);
          if (!href) {
            warn(`${blankKey}: no PDF link on ${guide}`);
          } else {
            pdf = await fetchBytes(href);
            ok(`${blankKey}: downloaded ${href}`);
          }
        } catch (err) {
          warn(
            `${blankKey}: could not download IRCC PDF (${err instanceof Error ? err.message : err}). Trying local blank.`,
          );
        }
      } else {
        ok(`${blankKey}: using local blank`);
      }
      if (!pdf) pdf = loadLocalBlank(blankKey);
      if (!pdf) {
        if (needed.has(blankKey)) {
          error(`${blankKey}: no PDF available for choice-list check.`);
        }
        continue;
      }
      await checkBlank(blankKey, pdf, extracted);
    }
  }

  for (const contract of LOV_CONTRACT) {
    for (const blankKey of contract.blanks) {
      const dump = extracted.get(blankKey);
      if (!dump || dump === "failed") continue;
      const ircc = licsFor(dump, contract.irccNames);
      if (!ircc) {
        warn(
          `${blankKey} / ${contract.id}: none of [${contract.irccNames.join(", ")}] found in XFA.`,
        );
        continue;
      }
      const irccSet = new Set(ircc);
      const missing = contract.values.filter((value) => !irccSet.has(value));
      if (missing.length) {
        error(
          `${blankKey} / ${contract.id}: questionnaire codes not on the PDF: ${missing.join(", ")}`,
        );
      } else {
        const extra = ircc.filter((lic) => !contract.values.includes(lic)).length;
        ok(
          `${blankKey} / ${contract.id}: ${contract.values.length} questionnaire codes valid` +
            (extra ? ` (${extra} extra IRCC options not asked)` : ""),
        );
      }
    }
  }
}

function writeStatusFile(datesOnly: boolean) {
  const errors = findings.filter((f) => f.level === "error");
  const warns = findings.filter((f) => f.level === "warn");
  const forms: Record<
    string,
    { liveUpdated: string | null; passed: boolean; errors: string[]; warnings: string[] }
  > = {};
  for (const code of Object.keys(revisions.forms)) {
    const row = formResults.get(code) ?? {
      liveUpdated: null,
      errors: [],
      warnings: [],
    };
    forms[code] = {
      liveUpdated: row.liveUpdated,
      passed: row.errors.length === 0,
      errors: row.errors,
      warnings: row.warnings,
    };
  }
  const payload = {
    checkedAt: new Date().toISOString(),
    passed: errors.length === 0,
    datesOnly,
    errorCount: errors.length,
    warningCount: warns.length,
    forms,
  };
  writeFileSync(
    path.join(process.cwd(), "src/lib/ircc/form-validation-status.json"),
    `${JSON.stringify(payload, null, 2)}\n`,
  );
}

async function main() {
  const datesOnly = process.argv.includes("--dates-only");
  const preferLocal = process.argv.includes("--local");
  await checkDates();
  if (!datesOnly) {
    await checkPdfsAndChoices(preferLocal);
  }
  const errors = findings.filter((f) => f.level === "error");
  const warns = findings.filter((f) => f.level === "warn");
  writeStatusFile(datesOnly);
  console.log(
    `\n${errors.length} error(s), ${warns.length} warning(s).` +
      (datesOnly ? " (dates only)" : ""),
  );
  if (errors.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
