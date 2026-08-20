/**
 * One-off: decrypt XFA streams from an IRCC blank and print choice lists.
 * Run: npx tsx scripts/extract-xfa-choices.ts
 */
import { readFileSync } from "node:fs";
import { inflate } from "pako";
import { md5 } from "js-md5";
import formMeta from "../src/lib/ircc/form-meta.json";
import { decodeHtmlEntities } from "../src/lib/html/entities";

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function indexOfBytes(haystack: Uint8Array, needle: string, from = 0): number {
  const n = new TextEncoder().encode(needle);
  outer: for (let i = from; i <= haystack.length - n.length; i++) {
    for (let j = 0; j < n.length; j++) {
      if (haystack[i + j] !== n[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function objectKey(fileKey: Uint8Array, idnum: number, gen: number): Uint8Array {
  const keyData = new Uint8Array(fileKey.length + 3 + 2 + 4);
  keyData.set(fileKey, 0);
  keyData[fileKey.length] = idnum & 0xff;
  keyData[fileKey.length + 1] = (idnum >> 8) & 0xff;
  keyData[fileKey.length + 2] = (idnum >> 16) & 0xff;
  keyData[fileKey.length + 3] = gen & 0xff;
  keyData[fileKey.length + 4] = (gen >> 8) & 0xff;
  keyData.set(new TextEncoder().encode("sAlT"), fileKey.length + 5);
  const digest = md5.arrayBuffer(keyData) as ArrayBuffer;
  return new Uint8Array(digest).subarray(0, Math.min(16, fileKey.length + 5));
}

async function aesDecryptCbc(key: Uint8Array, payload: Uint8Array): Promise<Uint8Array> {
  const iv = payload.subarray(0, 16);
  const cipher = payload.subarray(16);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as unknown as BufferSource,
    { name: "AES-CBC" },
    false,
    ["decrypt"],
  );
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-CBC", iv: iv as unknown as BufferSource },
      cryptoKey,
      cipher as unknown as BufferSource,
    ),
  );
}

function findStreamSpan(pdf: Uint8Array, objNum: number) {
  const header = new TextEncoder().encode(`${objNum} 0 obj`);
  let dictStart = -1;
  let from = 0;
  while (true) {
    const idx = indexOfBytes(pdf, `${objNum} 0 obj`, from);
    if (idx < 0) break;
    const prev = pdf[idx - 1];
    if (prev === undefined || prev < 0x30 || prev > 0x39) dictStart = idx;
    from = idx + header.length;
  }
  if (dictStart < 0) return null;
  const streamKw = indexOfBytes(pdf, "stream", dictStart);
  if (streamKw < 0) return null;
  let streamStart = streamKw + 6;
  if (pdf[streamStart] === 0x0d && pdf[streamStart + 1] === 0x0a) streamStart += 2;
  else if (pdf[streamStart] === 0x0a || pdf[streamStart] === 0x0d) streamStart += 1;
  const endstream = indexOfBytes(pdf, "endstream", streamStart);
  if (endstream < 0) return null;
  let streamEnd = endstream;
  if (pdf[streamEnd - 1] === 0x0a) streamEnd -= 1;
  if (pdf[streamEnd - 1] === 0x0d) streamEnd -= 1;
  const dict = new TextDecoder("latin1").decode(pdf.subarray(dictStart, streamKw));
  return { streamStart, streamEnd, dict };
}

async function tryDecode(
  pdf: Uint8Array,
  fileKey: Uint8Array,
  objNum: number,
): Promise<string | null> {
  const span = findStreamSpan(pdf, objNum);
  if (!span) return null;
  const payload = pdf.subarray(span.streamStart, span.streamEnd);
  if (payload.length < 32) return null;
  try {
    const okey = objectKey(fileKey, objNum, 0);
    const compressed = await aesDecryptCbc(okey, payload);
    const xmlBytes = inflate(compressed);
    return new TextDecoder("utf-8").decode(xmlBytes);
  } catch {
    try {
      const xmlBytes = inflate(payload);
      return new TextDecoder("utf-8").decode(xmlBytes);
    } catch {
      return null;
    }
  }
}

function extractEmbeddedLovs(xml: string) {
  const decoded = decodeHtmlEntities(xml);
  const lists = new Map<string, Array<{ lic: string; label: string }>>();
  const re = /<([A-Za-z][A-Za-z0-9]*)\s+lic="([^"]*)">([^<]*)<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(decoded))) {
    const tag = m[1];
    const lic = m[2];
    const label = m[3].replace(/\s+/g, " ").trim();
    if (!label && !lic) continue;
    if (!lists.has(tag)) lists.set(tag, []);
    const arr = lists.get(tag)!;
    if (!arr.some((x) => x.lic === lic)) arr.push({ lic, label });
  }
  return lists;
}

function extractChoiceBlocks(xml: string) {
  const hits: Array<{ name: string; values: string[]; texts: string[] }> = [];
  const fieldRe = /<field name="([^"]+)"[\s\S]*?<\/field\n?>/g;
  let m: RegExpExecArray | null;
  while ((m = fieldRe.exec(xml))) {
    const name = m[1];
    const body = m[0];
    if (!body.includes("<items")) continue;
    const itemBlocks = [
      ...body.matchAll(/<items\b([^>]*)>([\s\S]*?)<\/items\n?>/g),
    ];
    if (!itemBlocks.length) continue;
    const parsed = itemBlocks.map((b) => {
      const save = /save="1"/.test(b[1]);
      const texts = [...b[2].matchAll(/<text\n?>([\s\S]*?)<\/text\n?>/g)]
        .map((t) => t[1].replace(/\n/g, "").trim())
        .filter(Boolean);
      return { save, texts };
    });
    const withTexts = parsed.filter((p) => p.texts.length > 0);
    if (!withTexts.length) continue;
    const values = withTexts.find((p) => p.save)?.texts ?? withTexts[0].texts;
    const texts = withTexts.find((p) => !p.save)?.texts ?? values;
    hits.push({ name, values, texts });
  }
  return hits;
}

async function main() {
  const code = process.argv[2] || "imm1294e";
  const write = process.argv.includes("--write-json");
  const meta = (formMeta as Record<string, { fileKeyHex: string }>)[code];
  if (!meta) throw new Error(`no meta for ${code}`);
  const pdf = readFileSync(`assets/ircc/blanks/${code}.pdf`);
  const fileKey = hexToBytes(meta.fileKeyHex);
  const latin = pdf.toString("latin1");
  const objNums = new Set<number>();
  for (const m of latin.matchAll(/(\d+) 0 obj/g)) objNums.add(Number(m[1]));
  const mergedLovs = new Map<string, Array<{ lic: string; label: string }>>();
  const choiceFields: Array<{ name: string; values: string[]; texts: string[] }> = [];
  for (const n of [...objNums].sort((a, b) => a - b)) {
    const xml = await tryDecode(pdf, fileKey, n);
    if (!xml) continue;
    const lovs = extractEmbeddedLovs(xml);
    for (const [tag, items] of lovs) {
      if (!mergedLovs.has(tag) || items.length > (mergedLovs.get(tag)?.length ?? 0)) {
        mergedLovs.set(tag, items);
      }
    }
    if (xml.includes("<items")) choiceFields.push(...extractChoiceBlocks(xml));
  }
  if (write) {
    const { writeFileSync: writeFile } = await import("node:fs");
    const native = choiceFields.find((b) => b.name === "nativeLang");
    if (native) {
      const languages: Record<string, string> = {};
      native.values.forEach((v, i) => {
        if (v) languages[v] = native.texts[i] || v;
      });
      writeFile(
        `src/lib/ircc/codes/languages-${code.endsWith("f") ? "fr" : "en"}.json`,
        JSON.stringify(languages, null, 2) + "\n",
      );
      console.error(`wrote languages ${Object.keys(languages).length}`);
    }
    const countries = mergedLovs.get("Country");
    if (countries) {
      const map: Record<string, string> = {};
      for (const { lic, label } of countries) {
        if (lic) map[lic] = label;
      }
      writeFile(
        `src/lib/ircc/codes/countries-${code.endsWith("f") ? "fr" : "en"}.json`,
        JSON.stringify(map, null, 2) + "\n",
      );
      console.error(`wrote countries ${Object.keys(map).length}`);
    }
    return;
  }
  for (const [tag, items] of mergedLovs) {
    const skip = items.length > 40 && !["EducationLevel", "FieldOfStudy", "WorkPermitType", "WorkPermitTypeInLand", "PurposeOfVisit", "VisitPurpose", "VisitPurposeOriginal", "MaritalStatus", "ImmigrationStatus", "PhoneType", "PhoneTypeTRV", "GenderMel", "LevelOfStudy", "FamilyMemberRelationshipToPA"].includes(tag);
    const line = items.map((x) => `${x.lic || "(empty)"}=${x.label}`).join(" | ");
    console.log(skip ? `${tag}: ${items.length} items` : `${tag}: ${line}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
