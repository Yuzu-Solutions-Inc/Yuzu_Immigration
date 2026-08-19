/**
 * Generic encrypted XFA datasets incremental update (UR3-safe).
 * XRef streams stay unencrypted raw Flate — matches IRCC/Adobe convention.
 */
import { deflate, inflate } from "pako";
import { md5 } from "js-md5";

export type FormMeta = {
  fileKeyHex: string;
  datasetsObj: number;
  datasetsGen: number;
  bytes: number;
};

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function asBufferSource(bytes: Uint8Array): BufferSource {
  return bytes as unknown as BufferSource;
}

function indexOfBytes(
  haystack: Uint8Array,
  needle: Uint8Array | string,
  from = 0,
): number {
  const n = typeof needle === "string" ? new TextEncoder().encode(needle) : needle;
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
  const full = new Uint8Array(digest);
  return full.subarray(0, Math.min(16, fileKey.length + 5));
}

async function aesEncryptCbc(key: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    asBufferSource(key),
    { name: "AES-CBC" },
    false,
    ["encrypt"],
  );
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-CBC", iv },
      cryptoKey,
      asBufferSource(plaintext),
    ),
  );
  const out = new Uint8Array(16 + cipher.length);
  out.set(iv, 0);
  out.set(cipher, 16);
  return out;
}

async function aesDecryptCbc(key: Uint8Array, payload: Uint8Array): Promise<Uint8Array> {
  const iv = payload.subarray(0, 16);
  const cipher = payload.subarray(16);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    asBufferSource(key),
    { name: "AES-CBC" },
    false,
    ["decrypt"],
  );
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-CBC", iv: asBufferSource(iv) },
      cryptoKey,
      asBufferSource(cipher),
    ),
  );
}

function isDigitByte(b: number | undefined): boolean {
  return b !== undefined && b >= 0x30 && b <= 0x39;
}

function findStreamSpan(
  pdf: Uint8Array,
  objNum: number,
): { streamStart: number; streamEnd: number } {
  // Require a non-digit before the object number so "8 0 obj" does not match inside "18 0 obj".
  const header = new TextEncoder().encode(`${objNum} 0 obj`);
  let dictStart = -1;
  let from = 0;
  while (true) {
    const idx = indexOfBytes(pdf, header, from);
    if (idx < 0) break;
    if (!isDigitByte(pdf[idx - 1])) {
      dictStart = idx;
    }
    from = idx + header.length;
  }
  if (dictStart < 0) throw new Error(`PDF object ${objNum} not found`);

  const streamKw = indexOfBytes(pdf, "stream", dictStart);
  if (streamKw < 0) throw new Error(`stream missing for obj ${objNum}`);
  let streamStart = streamKw + 6;
  if (pdf[streamStart] === 0x0d && pdf[streamStart + 1] === 0x0a) streamStart += 2;
  else if (pdf[streamStart] === 0x0a || pdf[streamStart] === 0x0d) streamStart += 1;

  const endstream = indexOfBytes(pdf, "endstream", streamStart);
  if (endstream < 0) throw new Error("endstream missing");
  let streamEnd = endstream;
  if (pdf[streamEnd - 1] === 0x0a) streamEnd -= 1;
  if (pdf[streamEnd - 1] === 0x0d) streamEnd -= 1;
  return { streamStart, streamEnd };
}

function parseLastStartXref(pdf: Uint8Array): number {
  const tailStart = Math.max(0, pdf.length - 4096);
  const text = new TextDecoder("latin1").decode(pdf.subarray(tailStart));
  const matches = [...text.matchAll(/startxref\s+(\d+)/g)];
  if (!matches.length) throw new Error("startxref not found");
  return Number(matches[matches.length - 1][1]);
}

function parseTrailerMeta(pdf: Uint8Array): {
  size: number;
  root: string;
  info: string;
  encrypt: string;
  id: string;
} {
  const tail = new TextDecoder("latin1").decode(pdf.slice(-1600));
  const size = Number(/\/Size\s+(\d+)/.exec(tail)?.[1]);
  const root = /\/Root\s+(\d+\s+\d+\s+R)/.exec(tail)?.[1];
  const info = /\/Info\s+(\d+\s+\d+\s+R)/.exec(tail)?.[1];
  const encrypt = /\/Encrypt\s+(\d+\s+\d+\s+R)/.exec(tail)?.[1];
  const id = /\/ID\s*(\[[^\]]+\])/.exec(tail)?.[1]?.replace(/\s+/g, "");
  if (!size || !root || !info || !encrypt || !id) {
    throw new Error("Could not parse PDF trailer metadata");
  }
  return { size, root, info, encrypt, id };
}

function be3(n: number): Uint8Array {
  return new Uint8Array([(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]);
}

export async function extractDatasetsXml(
  pdf: Uint8Array,
  meta: FormMeta,
): Promise<string> {
  const span = findStreamSpan(pdf, meta.datasetsObj);
  const encrypted = pdf.subarray(span.streamStart, span.streamEnd);
  const okey = objectKey(hexToBytes(meta.fileKeyHex), meta.datasetsObj, meta.datasetsGen);
  const compressed = await aesDecryptCbc(okey, encrypted);
  return new TextDecoder("utf-8").decode(inflate(compressed));
}

export async function fillXfaDatasetsIncremental(
  blankPdf: Uint8Array,
  meta: FormMeta,
  patchXml: (datasetsXml: string) => string,
): Promise<Uint8Array> {
  const datasetsXml = await extractDatasetsXml(blankPdf, meta);
  const patchedXml = patchXml(datasetsXml);
  const compressed = deflate(new TextEncoder().encode(patchedXml));
  const okey = objectKey(hexToBytes(meta.fileKeyHex), meta.datasetsObj, meta.datasetsGen);
  const streamBytes = await aesEncryptCbc(okey, compressed);

  const prev = parseLastStartXref(blankPdf);
  const trailerMeta = parseTrailerMeta(blankPdf);
  const objOffset = blankPdf.length;
  const objNum = meta.datasetsObj;

  const lengthField = String(streamBytes.length).padStart(10, " ");
  const header = new TextEncoder().encode(
    `${objNum} 0 obj\n` +
      `<</Filter[/FlateDecode]/Length${lengthField}/Type/EmbeddedFile>>stream\n`,
  );
  const footer = new TextEncoder().encode("\nendstream\nendobj\n");
  const objBody = new Uint8Array(header.length + streamBytes.length + footer.length);
  objBody.set(header, 0);
  objBody.set(streamBytes, header.length);
  objBody.set(footer, header.length + streamBytes.length);

  const xrefObjNum = trailerMeta.size;
  const xrefOffset = objOffset + objBody.length;
  const xrefBin = new Uint8Array(5);
  xrefBin[0] = 1;
  xrefBin.set(be3(objOffset), 1);
  const predicted = new Uint8Array(6);
  predicted[0] = 2;
  predicted.set(xrefBin, 1);
  const xrefFlate = deflate(predicted);
  const xrefLenField = String(xrefFlate.length).padStart(7, " ");
  const xrefHeader = new TextEncoder().encode(
    `${xrefObjNum} 0 obj\n` +
      `<</Length${xrefLenField}/Type/XRef/Root ${trailerMeta.root}/Info ${trailerMeta.info}` +
      `/Encrypt ${trailerMeta.encrypt}/ID${trailerMeta.id}/Size ${trailerMeta.size + 1}` +
      `/Prev ${prev}/Index[${objNum} 1]/W[1 3 1]` +
      `/DecodeParms<</Columns 5/Predictor 12>>/Filter/FlateDecode>>stream\n`,
  );
  const xrefFooter = new TextEncoder().encode("\nendstream\nendobj\n");
  const xrefBody = new Uint8Array(
    xrefHeader.length + xrefFlate.length + xrefFooter.length,
  );
  xrefBody.set(xrefHeader, 0);
  xrefBody.set(xrefFlate, xrefHeader.length);
  xrefBody.set(xrefFooter, xrefHeader.length + xrefFlate.length);
  const tail = new TextEncoder().encode(`startxref\n${xrefOffset}\n%%EOF\n`);

  const out = new Uint8Array(
    blankPdf.length + objBody.length + xrefBody.length + tail.length,
  );
  out.set(blankPdf, 0);
  out.set(objBody, blankPdf.length);
  out.set(xrefBody, blankPdf.length + objBody.length);
  out.set(tail, blankPdf.length + objBody.length + xrefBody.length);
  return out;
}

export function xmlEscape(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Fill first empty `<Tag\n/>` or `<Tag\n></Tag\n>` occurrence with text. */
export function setEmptyTag(xml: string, tag: string, value: string): string {
  const safe = xmlEscape(value);
  const selfClosing = new RegExp(`<${tag}\\n/>`);
  if (selfClosing.test(xml)) {
    return xml.replace(selfClosing, `<${tag}\n>${safe}</${tag}\n>`);
  }
  const empty = new RegExp(`<${tag}\\n></${tag}\\n>`);
  if (empty.test(xml)) {
    return xml.replace(empty, `<${tag}\n>${safe}</${tag}\n>`);
  }
  return xml;
}

/** Set the first occurrence of a tag, whether empty or already valued (e.g. `0`). */
export function setTag(xml: string, tag: string, value: string): string {
  const filled = setEmptyTag(xml, tag, value);
  if (filled !== xml) return filled;
  const safe = xmlEscape(value);
  const existing = new RegExp(`<${tag}\\n>[^<]*</${tag}\\n>`);
  if (existing.test(xml)) {
    return xml.replace(existing, `<${tag}\n>${safe}</${tag}\n>`);
  }
  return xml;
}

export function setFlag01(xml: string, tag: string, on: boolean): string {
  return setTag(xml, tag, on ? "1" : "0");
}

/** Patch the inner XML of the first `<openTag>...</openTag>` element. */
export function mapInner(
  xml: string,
  openTag: string,
  patcher: (inner: string) => string,
): string {
  const open = new RegExp(`<${openTag}\\n?>`);
  const m = open.exec(xml);
  if (!m) return xml;
  const start = m.index + m[0].length;
  const close = xml.indexOf(`</${openTag}`, start);
  if (close < 0) return xml;
  return xml.slice(0, start) + patcher(xml.slice(start, close)) + xml.slice(close);
}

export function mapForm1(
  datasetsXml: string,
  patcher: (form1: string) => string,
): string {
  const start = datasetsXml.indexOf("<form1");
  if (start < 0) throw new Error("form1 missing in XFA datasets");
  const endMatch = datasetsXml.slice(start).match(/<\/form1\n?>/);
  if (!endMatch || endMatch.index === undefined) {
    throw new Error("form1 close tag missing");
  }
  const end = start + endMatch.index + endMatch[0].length;
  return datasetsXml.slice(0, start) + patcher(datasetsXml.slice(start, end)) + datasetsXml.slice(end);
}

export function replaceBlock(
  xml: string,
  tag: string,
  innerXml: string,
): string {
  const re = new RegExp(`<${tag}\\n?>[\\s\\S]*?</${tag}\\n?>`);
  if (!re.test(xml)) return xml;
  return xml.replace(re, `<${tag}\n>${innerXml}</${tag}\n>`);
}

export function setNthEmptyTag(xml: string, tag: string, value: string, n: number): string {
  let count = 0;
  const selfClosing = new RegExp(`<${tag}\\n/>`, "g");
  return xml.replace(selfClosing, (match) => {
    if (count++ === n) {
      const safe = xmlEscape(value);
      return `<${tag}\n>${safe}</${tag}\n>`;
    }
    return match;
  });
}

export function setCheckbox(xml: string, section: string, on: boolean): string {
  const re = new RegExp(`<${section}\\n><CheckBox\\n>([01])</CheckBox\\n>`);
  return xml.replace(re, `<${section}\n><CheckBox\n>${on ? "1" : "0"}</CheckBox\n>`);
}
