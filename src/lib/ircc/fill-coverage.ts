/**
 * Compare filled XFA datasets to the blank and list leaf cells the
 * questionnaire fill left empty (office-use / signature / extra rows skipped).
 */

const IGNORE_EXACT = new Set([
  "checkBoxCalcField",
  "calcField",
  "dummy",
  "spacer",
  "Barcode",
  "barcode",
  "PageNumber",
  "form1",
  "datasets",
  "data",
  "CRCNum",
  "Age",
  "PrevAge",
  "PrevSpouseAge",
  "ApplicationValidatedFlag",
  "HiddenStat",
  "Instructions",
  "Banner",
  "span",
  "p",
  "body",
  "DateLastValidated",
  "DateCalc",
  "languagesHeader",
  "TaiwanPIN",
  "IsraelPassportIndicator",
  "Title",
  "stop",
  "top",
  "HeaderRow",
  "POBox",
  "District",
  "NumberExt",
  "AreaCode",
  "FirstThree",
  "LastFive",
  "titlewrap",
  "VisaType",
  "AddrLbl",
  "StayDates",
  "backgroundInfoCalc",
  "militaryServiceDetails",
  "TextField2",
  "C1CertificateIssueDate",
  "Disclosure",
  "PrincipalApplicant",
  "FormName",
  "FormVersion",
  "FormValidated",
  "ReaderInfo",
  "noPersons",
  "studyProgram",
]);

const IGNORE_SUBSTRING = [
  "signature",
  "barcode",
  "officeuse",
  "foroffice",
  "pagenumber",
  "printbutton",
  "clearbutton",
  "validatebutton",
  "sectionheader",
  "watermark",
  "lovfile",
];

const IGNORE_PATH = [
  /\/LOVFile\//i,
  /\/LOV\//i,
  /\/OfficeUse\//i,
  /\/Header\/CRC/i,
  /\/DateLastValidated\//i,
  /\/AltPhone\//i,
  /\/NANumber\//i,
  /\/FaxEmail\/Phone\//i,
  /\/q5\/Fax\//i,
  /\/OccupationRow[3-9]\//,
  /\/Edu_Row[3-9]\//,
  /(?:^|\/)xfa\/dd\//i,
  /\/Signature\//i,
  /\/CountryWhereApplying\/.*\/Other$/i,
  /\/CurrentCOR\/.*\/Other$/i,
  /\/expensesPaid\/Other$/i,
];

function ignoredName(name: string): boolean {
  if (IGNORE_EXACT.has(name)) return true;
  if (/^Row\d+$/.test(name) || /^Rec\d+$/.test(name)) return true;
  if (/Header$/i.test(name)) return true;
  const lower = name.toLowerCase();
  return IGNORE_SUBSTRING.some((part) => lower.includes(part));
}

function ignoredPath(path: string, name: string): boolean {
  if (ignoredName(name)) return true;
  return IGNORE_PATH.some((re) => re.test(path));
}

const TAG_RE = /<(\/?)([A-Za-z][\w]*)([^>]*?)\n?(\/)?>/g;

export type DatasetLeaf = {
  path: string;
  name: string;
  value: string;
};

type Frame = { name: string; text: string; children: number };

export function collectDatasetLeaves(xml: string): DatasetLeaf[] {
  const start = xml.indexOf("<form1");
  const slice = start >= 0 ? xml.slice(start) : xml;
  const stack: Frame[] = [];
  const leaves: DatasetLeaf[] = [];
  TAG_RE.lastIndex = 0;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(slice))) {
    const text = slice.slice(last, m.index);
    if (stack.length) stack[stack.length - 1]!.text += text;
    last = m.index + m[0].length;
    const closing = m[1] === "/";
    const selfClose = m[4] === "/" || /\/>$/.test(m[0]);
    const name = m[2]!;
    if (closing) {
      const frame = stack.pop();
      if (!frame) continue;
      if (frame.children === 0 && !ignoredName(frame.name)) {
        const path = [...stack.map((f) => f.name), frame.name].join("/");
        leaves.push({ path, name: frame.name, value: frame.text.replace(/\s+/g, " ").trim() });
      }
      if (stack.length) stack[stack.length - 1]!.children += 1;
      continue;
    }
    if (selfClose) {
      if (!ignoredName(name)) {
        const path = [...stack.map((f) => f.name), name].join("/");
        leaves.push({ path, name, value: "" });
      }
      if (stack.length) stack[stack.length - 1]!.children += 1;
      continue;
    }
    stack.push({ name, text: "", children: 0 });
  }
  return leaves;
}

function unusedRepeatSlot(path: string): boolean {
  return (
    /\/Row(?:[3-9]|\d{2})\b/.test(path) ||
    /\/Rec(?:[3-9]|\d{2})\b/.test(path) ||
    /OccupationRow[3-9]/.test(path) ||
    /Edu_Row[3-9]/.test(path)
  );
}

/**
 * Empty leaves after a full questionnaire fill. Extra unused table rows and
 * chrome (signatures, barcodes, headers) are omitted.
 */
export function unfilledLeaves(filledXml: string, limit = 40): string[] {
  const empty = collectDatasetLeaves(filledXml).filter((leaf) => {
    if (leaf.value) return false;
    if (unusedRepeatSlot(leaf.path)) return false;
    if (ignoredPath(leaf.path, leaf.name)) return false;
    return true;
  });
  const seen = new Set<string>();
  const out: string[] = [];
  for (const leaf of empty) {
    const label = leaf.path.replace(/^form1\/?/, "") || leaf.name;
    if (seen.has(label)) continue;
    seen.add(label);
    out.push(label);
    if (out.length >= limit) break;
  }
  return out;
}
