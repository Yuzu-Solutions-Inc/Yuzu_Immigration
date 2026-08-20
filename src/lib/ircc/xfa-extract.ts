/**
 * Decrypt IRCC XFA streams and collect choice lists (lic + label).
 */
import { inflate } from "pako";
import { md5 } from "js-md5";

import { decodeHtmlEntities } from "@/lib/html/entities";

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

async function aesDecryptCbc(
  key: Uint8Array,
  payload: Uint8Array,
): Promise<Uint8Array> {
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
  return { streamStart, streamEnd };
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

export type ExtractedLovs = {
  lists: Map<string, Array<{ lic: string; label: string }>>;
  fields: Array<{ name: string; values: string[]; texts: string[] }>;
  decodedStreams: number;
};

export type ExtractLovOptions = {
  /** Decrypt this object first (usually datasets — rarely has LOVs). */
  preferObj?: number;
  /** Stop once each name-group has a matching list or field. */
  neededGroups?: string[][];
  /** Cap decoded streams when scanning for LOVs (ignored if no groups). */
  maxDecodedStreams?: number;
};

export function licsFor(
  extracted: ExtractedLovs,
  names: string[],
): string[] | null {
  for (const name of names) {
    const list = extracted.lists.get(name);
    if (list && list.length) {
      return list.map((item) => item.lic).filter(Boolean);
    }
    const field = extracted.fields.find((f) => f.name === name);
    if (field && field.values.length) {
      return field.values.filter(Boolean);
    }
  }
  return null;
}

function mergeLovsFromXml(extracted: ExtractedLovs, xml: string) {
  const lovs = extractEmbeddedLovs(xml);
  for (const [tag, items] of lovs) {
    const current = extracted.lists.get(tag);
    if (!current || items.length > current.length) {
      extracted.lists.set(tag, items);
    }
  }
  if (xml.includes("<items")) {
    extracted.fields.push(...extractChoiceBlocks(xml));
  }
}

function groupsSatisfied(
  extracted: ExtractedLovs,
  groups: string[][] | undefined,
): boolean {
  if (!groups?.length) return false;
  return groups.every((names) => licsFor(extracted, names) !== null);
}

export async function extractXfaLovs(
  pdf: Uint8Array,
  fileKeyHex: string,
  options?: ExtractLovOptions,
): Promise<ExtractedLovs> {
  const fileKey = hexToBytes(fileKeyHex);
  const latin = new TextDecoder("latin1").decode(pdf);
  const objNums = new Set<number>();
  for (const m of latin.matchAll(/(\d+) 0 obj/g)) objNums.add(Number(m[1]));

  const sized: Array<{ n: number; size: number }> = [];
  for (const n of objNums) {
    const span = findStreamSpan(pdf, n);
    if (!span) continue;
    sized.push({ n, size: span.streamEnd - span.streamStart });
  }
  sized.sort((a, b) => b.size - a.size);

  const ordered: number[] = [];
  if (options?.preferObj != null) {
    const pref = sized.find((s) => s.n === options.preferObj);
    if (pref) ordered.push(pref.n);
  }
  for (const s of sized) {
    if (!ordered.includes(s.n)) ordered.push(s.n);
  }

  const extracted: ExtractedLovs = {
    lists: new Map(),
    fields: [],
    decodedStreams: 0,
  };
  const cap =
    options?.maxDecodedStreams ??
    (options?.neededGroups?.length ? 32 : Number.POSITIVE_INFINITY);

  for (const n of ordered) {
    if (extracted.decodedStreams >= cap) break;
    const xml = await tryDecode(pdf, fileKey, n);
    if (!xml) continue;
    extracted.decodedStreams += 1;
    mergeLovsFromXml(extracted, xml);
    if (groupsSatisfied(extracted, options?.neededGroups)) break;
  }
  return extracted;
}
