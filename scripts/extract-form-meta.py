#!/usr/bin/env python3
"""Extract IRCC XFA form-meta (fileKeyHex, datasetsObj, bytes) from blank PDFs."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

try:
    import pikepdf
except ImportError as exc:  # pragma: no cover
    raise SystemExit("Install pikepdf: pip install pikepdf") from exc


def extract_meta(path: Path) -> dict:
    pdf = pikepdf.Pdf.open(path, password="")
    key = pdf.encryption.encryption_key.hex()
    best: tuple[int, int, int] | None = None
    for obj in pdf.objects:
        if not isinstance(obj, pikepdf.Stream):
            continue
        try:
            text = bytes(obj.read_bytes()).decode("utf-8", errors="ignore")
        except Exception:
            continue
        score = 0
        if "xfa:datasets" in text and "form1" in text:
            score += 120
        elif "xfa:datasets" in text:
            score += 100
        if text.lstrip().startswith("<?xml") and "LOVFile" in text[:800]:
            score += 80
        if score == 0:
            continue
        onum = obj.objgen[0]
        if best is None or score > best[0] or (score == best[0] and len(text) < best[2]):
            best = (score, onum, len(text))
    return {
        "fileKeyHex": key,
        "datasetsObj": best[1] if best else None,
        "datasetsGen": 0,
        "bytes": path.stat().st_size,
    }


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("Usage: extract-form-meta.py blank1.pdf [blank2.pdf ...]")
    out: dict[str, dict] = {}
    for arg in sys.argv[1:]:
        path = Path(arg)
        code = path.stem  # e.g. imm0008e
        out[code] = extract_meta(path)
        print(f"{code}: {json.dumps(out[code])}")
    if len(out) == 1:
        print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
