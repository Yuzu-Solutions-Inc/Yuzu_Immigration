/**
 * Weekly IRCC form watch (fast fail, canada.ca only, no PDF writes):
 * 1. Catalog / form-meta / revisions integrity (no network)
 * 2. canada.ca index months vs form-revisions.json
 * 3. Live EN/FR PDFs: size, datasets decrypt, filler tags
 * 4. Questionnaire choice codes still on those PDFs (LOV extract, early-exit)
 *
 *   npm run ircc:validate
 *   npm run ircc:validate -- --dates-only
 *   npm run ircc:validate -- --local
 */
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { ALL_FORM_CODES } from "../src/lib/ircc/catalog";
import formMeta from "../src/lib/ircc/form-meta.json";
import revisions from "../src/lib/ircc/form-revisions.json";
import { LOV_CONTRACT } from "../src/lib/ircc/lov-contract";
import {
  DATASET_TAG_CONTRACT,
  missingDatasetTags,
} from "../src/lib/ircc/tag-contract";
import {
  extractDatasetsXml,
  type FormMeta,
} from "../src/lib/ircc/xfa-incremental";
import { extractXfaLovs, licsFor } from "../src/lib/ircc/xfa-extract";

const UA =
  "YuzuImmigration-IRCC-watch/1.0 (+https://github.com/Yuzu-Solutions-Inc/Yuzu_Immigration)";
const ALLOWED_HOSTS = new Set(["www.canada.ca", "canada.ca"]);
const FETCH_TIMEOUT_MS = 20_000;
const PDF_MAX_BYTES = 8 * 1024 * 1024;
const SIZE_TOLERANCE = 2048;
const DOWNLOAD_CONCURRENCY = 6;

type FormRevision = {
  irccUpdated: string;
  guideEn: string;
  guideFr: string;
};

type MetaEntry = FormMeta & { bytes: number };

type Finding = { level: "error" | "warn"; message: string };

type FormResult = {
  liveUpdated: string | null;
  errors: string[];
  warnings: string[];
};

const findings: Finding[] = [];
const formResults = new Map<string, FormResult>();
const pins = revisions.forms as Record<string, FormRevision>;
const meta = formMeta as Record<string, MetaEntry>;

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

function assertAllowedUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`invalid URL ${raw}`);
  }
  if (url.protocol !== "https:") {
    throw new Error(`blocked protocol ${url.protocol} (${url.hostname})`);
  }
  const host = url.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) {
    throw new Error(`blocked host ${host}`);
  }
  return url;
}

async function fetchAllowed(
  url: string,
  accept: string,
): Promise<{ response: Response; finalUrl: string }> {
  let current = assertAllowedUrl(url);
  for (let hop = 0; hop < 5; hop++) {
    const response = await fetch(current, {
      headers: { "user-agent": UA, accept },
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error(`${current.href} redirect without Location`);
      current = assertAllowedUrl(new URL(location, current).href);
      continue;
    }
    if (!response.ok) {
      throw new Error(`${current.href} → HTTP ${response.status}`);
    }
    return { response, finalUrl: current.href };
  }
  throw new Error(`${url} too many redirects`);
}

async function fetchText(url: string): Promise<string> {
  const { response } = await fetchAllowed(url, "text/html");
  return response.text();
}

function isPdfMagic(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

async function fetchPdf(url: string): Promise<Uint8Array> {
  const { response, finalUrl } = await fetchAllowed(url, "application/pdf");
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > PDF_MAX_BYTES) {
    throw new Error(`${finalUrl} is ${declared} bytes (max ${PDF_MAX_BYTES})`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > PDF_MAX_BYTES) {
    throw new Error(`${finalUrl} is ${bytes.byteLength} bytes (max ${PDF_MAX_BYTES})`);
  }
  if (bytes.byteLength < 1000 || !isPdfMagic(bytes)) {
    throw new Error(`${finalUrl} is not a PDF`);
  }
  return bytes;
}

function parseIndexDates(html: string): Map<string, string> {
  const out = new Map<string, string>();
  const tableRe =
    /<td[^>]*>\s*IMM\s*([0-9]{4})(?:\s*SCH\s*([0-9]+))?\s*<\/td>\s*<td[^>]*>[\s\S]*?<\/td>\s*<td[^>]*>\s*(\d{4}-\d{2})\s*<\/td>/gi;
  let m: RegExpExecArray | null;
  while ((m = tableRe.exec(html))) {
    const code = m[2] ? `imm${m[1].toLowerCase()}sch${m[2]}` : `imm${m[1].toLowerCase()}`;
    out.set(code, m[3]);
  }
  if (out.size > 0) return out;
  const looseRe =
    /IMM\s*([0-9]{4})(?:\s*SCH\s*([0-9]+))?[\s\S]{0,280}?(\d{4}-\d{2})/gi;
  while ((m = looseRe.exec(html))) {
    const code = m[2] ? `imm${m[1].toLowerCase()}sch${m[2]}` : `imm${m[1].toLowerCase()}`;
    if (!out.has(code)) out.set(code, m[3]);
  }
  return out;
}

function resolveHref(href: string): string {
  if (href.startsWith("//")) return `https:${href}`;
  if (/^https?:/i.test(href)) return href;
  return `https://www.canada.ca${href.startsWith("/") ? "" : "/"}${href}`;
}

function pdfStems(blankKey: string): string[] {
  const lang = blankKey.endsWith("f") ? "f" : "e";
  if (blankKey.startsWith("imm5257sch1")) {
    return [`imm5257_1${lang}`, `imm5257sch1${lang}`];
  }
  return [blankKey];
}

function scorePdfHref(href: string, blankKey: string): number {
  const file = href.split("?")[0].split("/").pop()?.toLowerCase() ?? "";
  if (!file.endsWith(".pdf")) return -1;
  if (
    blankKey.startsWith("imm5257") &&
    !blankKey.includes("sch1") &&
    /5257_1|5257sch1|sch-?1/.test(file)
  ) {
    return -1;
  }
  const stems = pdfStems(blankKey).map((s) => s.toLowerCase());
  for (const stem of stems) {
    if (file === `${stem}.pdf`) return 100;
    if (file.startsWith(`${stem}.`)) return 80;
  }
  const lang = blankKey.endsWith("f") ? "f" : "e";
  if (file.endsWith(`${lang}.pdf`)) return 10;
  return 0;
}

function pickPdfHref(html: string, blankKey: string): string | null {
  const hrefs = [...html.matchAll(/href=["']([^"']+\.pdf)["']/gi)].map((m) => m[1]);
  let best: { href: string; score: number } | null = null;
  for (const href of hrefs) {
    const score = scorePdfHref(href, blankKey);
    if (score <= 0) continue;
    if (!best || score > best.score) best = { href, score };
  }
  return best ? resolveHref(best.href) : null;
}

function loadLocalBlank(code: string): Uint8Array | null {
  const file = path.join(process.cwd(), "assets", "ircc", "blanks", `${code}.pdf`);
  try {
    const bytes = new Uint8Array(readFileSync(file));
    return bytes.byteLength > 1000 && isPdfMagic(bytes) ? bytes : null;
  } catch {
    return null;
  }
}

function checkIntegrity() {
  for (const code of ALL_FORM_CODES) {
    if (!pins[code]) {
      error(`${code}: in catalog but missing from form-revisions.json.`);
    }
    for (const lang of ["e", "f"] as const) {
      const blankKey = `${code}${lang}`;
      if (!meta[blankKey]) {
        error(`${blankKey}: in catalog but missing from form-meta.json.`);
      }
    }
  }
  for (const code of Object.keys(pins)) {
    if (!ALL_FORM_CODES.includes(code as (typeof ALL_FORM_CODES)[number])) {
      warn(`${code}: pinned in form-revisions.json but not in the catalog.`);
    }
  }
  for (const blankKey of Object.keys(meta)) {
    const code = blankKey.replace(/[ef]$/, "");
    if (!ALL_FORM_CODES.includes(code as (typeof ALL_FORM_CODES)[number])) {
      warn(`${blankKey}: form-meta entry is not a catalog form.`);
    }
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
  for (const [code, pin] of Object.entries(pins)) {
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

async function mapPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
) {
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
}

const guideCache = new Map<string, Promise<string>>();

function loadGuide(url: string): Promise<string> {
  let pending = guideCache.get(url);
  if (!pending) {
    pending = fetchText(url);
    guideCache.set(url, pending);
  }
  return pending;
}

type Extracted = Awaited<ReturnType<typeof extractXfaLovs>> | "failed" | "skipped";

async function loadBlankPdf(
  blankKey: string,
  pin: FormRevision,
  lang: "e" | "f",
  preferLocal: boolean,
): Promise<Uint8Array | null> {
  if (preferLocal) {
    const local = loadLocalBlank(blankKey);
    if (local) {
      ok(`${blankKey}: using local blank`);
      return local;
    }
  }
  const guide = lang === "f" ? pin.guideFr : pin.guideEn;
  try {
    const page = await loadGuide(guide);
    const href = pickPdfHref(page, blankKey);
    if (!href) {
      warn(`${blankKey}: no matching PDF link on ${guide}`);
    } else {
      const pdf = await fetchPdf(href);
      ok(`${blankKey}: downloaded ${href} (${pdf.byteLength} bytes)`);
      return pdf;
    }
  } catch (err) {
    warn(
      `${blankKey}: could not download IRCC PDF (${err instanceof Error ? err.message : err}). Trying local blank.`,
    );
  }
  const fallback = loadLocalBlank(blankKey);
  if (fallback) ok(`${blankKey}: using local blank`);
  return fallback;
}

async function checkBlank(
  blankKey: string,
  pdf: Uint8Array,
  cache: Map<string, Extracted>,
  runLov: boolean,
) {
  const entry = meta[blankKey];
  if (!entry) {
    warn(`${blankKey}: no form-meta.json entry; skipped decrypt / choice check.`);
    cache.set(blankKey, "skipped");
    return;
  }
  if (Math.abs(pdf.byteLength - entry.bytes) > SIZE_TOLERANCE) {
    error(
      `${blankKey}: PDF is ${pdf.byteLength} bytes, form-meta expects ${entry.bytes}. Encryption keys and choice lists likely changed.`,
    );
  } else {
    ok(`${blankKey}: ${pdf.byteLength} bytes (matches form-meta).`);
  }

  let datasetsXml: string | null = null;
  try {
    datasetsXml = await extractDatasetsXml(pdf, entry);
    ok(`${blankKey}: datasets object ${entry.datasetsObj} decrypted.`);
  } catch (err) {
    error(
      `${blankKey}: datasets decrypt failed (${err instanceof Error ? err.message : err}). File key is stale.`,
    );
    cache.set(blankKey, "failed");
    return;
  }

  const tags = DATASET_TAG_CONTRACT[blankKey];
  if (tags?.length) {
    const missing = missingDatasetTags(datasetsXml, tags);
    if (missing.length) {
      error(`${blankKey}: datasets missing filler tags: ${missing.join(", ")}`);
    } else {
      ok(`${blankKey}: filler tags present (${tags.join(", ")}).`);
    }
  }

  if (!runLov) {
    cache.set(blankKey, "skipped");
    return;
  }

  const neededGroups = LOV_CONTRACT.filter((c) => c.blanks.includes(blankKey)).map(
    (c) => [...c.irccNames],
  );
  try {
    const extracted = await extractXfaLovs(pdf, entry.fileKeyHex, {
      preferObj: entry.datasetsObj,
      neededGroups,
      maxDecodedStreams: 32,
    });
    if (extracted.decodedStreams === 0) {
      error(
        `${blankKey}: decrypted 0 XFA streams — file key is stale for this revision.`,
      );
      cache.set(blankKey, "failed");
      return;
    }
    cache.set(blankKey, extracted);
    ok(`${blankKey}: decoded ${extracted.decodedStreams} XFA stream(s) for choice lists.`);
  } catch (err) {
    cache.set(blankKey, "failed");
    error(
      `${blankKey}: choice-list extract failed (${err instanceof Error ? err.message : err}).`,
    );
  }
}

async function checkPdfsAndChoices(preferLocal: boolean) {
  const extracted = new Map<string, Extracted>();
  const lovBlanks = new Set(LOV_CONTRACT.flatMap((c) => c.blanks));
  const jobs: Array<{ code: string; lang: "e" | "f"; blankKey: string }> = [];

  for (const [code, pin] of Object.entries(pins)) {
    for (const lang of ["e", "f"] as const) {
      const blankKey = `${code}${lang}`;
      if (!meta[blankKey] && !lovBlanks.has(blankKey)) continue;
      jobs.push({ code, lang, blankKey });
    }
  }

  await mapPool(jobs, DOWNLOAD_CONCURRENCY, async (job) => {
    const pin = pins[job.code];
    const pdf = await loadBlankPdf(job.blankKey, pin, job.lang, preferLocal);
    if (!pdf) {
      if (lovBlanks.has(job.blankKey) || DATASET_TAG_CONTRACT[job.blankKey]) {
        error(`${job.blankKey}: no PDF available for structure / choice-list check.`);
      } else {
        warn(`${job.blankKey}: no PDF available.`);
      }
      return;
    }
    await checkBlank(job.blankKey, pdf, extracted, lovBlanks.has(job.blankKey));
  });

  for (const contract of LOV_CONTRACT) {
    for (const blankKey of contract.blanks) {
      const dump = extracted.get(blankKey);
      if (!dump || dump === "failed" || dump === "skipped") continue;
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
  const codes = new Set([...Object.keys(pins), ...ALL_FORM_CODES]);
  for (const code of codes) {
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
    errors: errors.map((f) => f.message),
    warnings: warns.map((f) => f.message),
    forms,
  };
  writeFileSync(
    path.join(process.cwd(), "src/lib/ircc/form-validation-status.json"),
    `${JSON.stringify(payload, null, 2)}\n`,
  );
}

function writeGithubSummary(datesOnly: boolean) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) return;
  const errors = findings.filter((f) => f.level === "error");
  const warns = findings.filter((f) => f.level === "warn");
  const lines = [
    "## IRCC form watch",
    "",
    `- ${errors.length} error(s), ${warns.length} warning(s)${datesOnly ? " (dates only)" : ""}`,
    "",
  ];
  if (errors.length) {
    lines.push("### Errors", "");
    for (const item of errors) lines.push(`- ${item.message}`);
    lines.push("");
  }
  if (warns.length) {
    lines.push("### Warnings", "");
    for (const item of warns) lines.push(`- ${item.message}`);
    lines.push("");
  }
  appendFileSync(file, `${lines.join("\n")}\n`);
}

async function main() {
  const datesOnly = process.argv.includes("--dates-only");
  const preferLocal = process.argv.includes("--local");
  checkIntegrity();
  try {
    await checkDates();
  } catch (err) {
    error(
      `IRCC index fetch failed (${err instanceof Error ? err.message : err}).`,
    );
  }
  if (!datesOnly) {
    try {
      await checkPdfsAndChoices(preferLocal);
    } catch (err) {
      error(
        `IRCC PDF / choice-list check failed (${err instanceof Error ? err.message : err}).`,
      );
    }
  }
  const errors = findings.filter((f) => f.level === "error");
  const warns = findings.filter((f) => f.level === "warn");
  writeStatusFile(datesOnly);
  writeGithubSummary(datesOnly);
  console.log(
    `\n${errors.length} error(s), ${warns.length} warning(s).` +
      (datesOnly ? " (dates only)" : ""),
  );
  if (errors.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  try {
    error(err instanceof Error ? err.message : String(err));
    writeStatusFile(process.argv.includes("--dates-only"));
    writeGithubSummary(process.argv.includes("--dates-only"));
  } catch {
    // still fail the job
  }
  process.exit(1);
});
