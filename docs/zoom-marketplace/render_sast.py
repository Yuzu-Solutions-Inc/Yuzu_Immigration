#!/usr/bin/env python3
"""Render SAST / OSCA evidence PNG for Zoom Marketplace."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 2400, 2800
OUT = Path(__file__).with_name("yuzu-sast-dast-evidence.png")

CANVAS = (249, 250, 251)
SURFACE = (255, 255, 255)
BRAND = (17, 24, 39)
MUTED = (74, 85, 104)
BORDER = (229, 231, 235)
ACTION = (99, 102, 241)
OK = (5, 150, 105)
OK_BG = (236, 253, 245)
MUTED_BG = (243, 244, 246)

FONT_DIR = Path("/System/Library/Fonts/Supplemental")
FONT = str(FONT_DIR / "Arial.ttf")
FONT_B = str(FONT_DIR / "Arial Bold.ttf")


def f(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_B if bold else FONT, size)


def wrap(draw, text, font, max_w):
    words = text.split()
    lines, cur = [], ""
    for word in words:
        trial = f"{cur} {word}".strip()
        if draw.textlength(trial, font=font) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines or [""]


def rrect(draw, xy, fill, outline=BORDER, width=2, radius=16):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def bullets(draw, x, y, items, max_w, size=22):
    font = f(size)
    for item in items:
        wrapped = wrap(draw, item, font, max_w - 28)
        draw.ellipse((x, y + 8, x + 10, y + 18), fill=ACTION)
        for line in wrapped:
            draw.text((x + 22, y), line, font=font, fill=MUTED)
            y += 30
        y += 6
    return y


def main():
    img = Image.new("RGB", (W, H), CANVAS)
    d = ImageDraw.Draw(img)

    rrect(d, (40, 36, W - 40, 176), fill=SURFACE, outline=ACTION, width=3)
    d.text((72, 56), "Yuzu Immigration — SAST / DAST evidence", font=f(36, True), fill=BRAND)
    d.text(
        (72, 108),
        "Yuzu Solutions  ·  Zoom Meeting integration  ·  Scan date: 16 August 2026",
        font=f(22),
        fill=MUTED,
    )
    d.text(
        (72, 140),
        "Attestation: Yes — the application undergoes SAST (and open-source component analysis). DAST is not yet in the release pipeline.",
        font=f(20),
        fill=MUTED,
    )

    # Three result cards
    cards = [
        (
            ACTION,
            (238, 242, 255),
            "SAST — Semgrep (primary)",
            [
                "Tool: Semgrep 1.136.0 (OSS)",
                "Rules: p/owasp-top-ten, p/typescript, p/nextjs",
                "Scope: src/ (380 git-tracked files, TypeScript/Next.js)",
                "Result: 0 findings (0 blocking) after triage",
                "Rules run: 83   ·   Parsed lines: ~100%",
            ],
        ),
        (
            OK,
            OK_BG,
            "OSCA — npm audit",
            [
                "Tool: npm audit (production dependencies)",
                "Lockfile: package-lock.json",
                "Result: 0 vulnerabilities",
                "High/critical: 0",
                "Used as Open Source Component Analysis (OSCA)",
            ],
        ),
        (
            (107, 114, 128),
            MUTED_BG,
            "Complementary static checks",
            [
                "TypeScript strict compiler (tsc --noEmit)",
                "ESLint with eslint-config-next",
                "Next.js production build before Vercel release",
                "Zoom-related paths: src/lib/zoom, /auth/zoom, actions/zoom.ts — no ESLint errors",
                "These complement Semgrep; they are not a substitute for it",
            ],
        ),
    ]
    y = 204
    cw = (W - 144 - 40) / 3
    ch = 320
    for i, (accent, fill, title, lines) in enumerate(cards):
        x = 72 + i * (cw + 20)
        rrect(d, (x, y, x + cw, y + ch), fill=fill, outline=accent, width=3)
        d.rectangle((x, y, x + 10, y + ch), fill=accent)
        d.text((x + 28, y + 18), title, font=f(22, True), fill=BRAND)
        ty = y + 62
        for line in lines:
            for wrapped in wrap(d, line, f(20), cw - 52):
                d.text((x + 28, ty), wrapped, font=f(20), fill=MUTED)
                ty += 28
            ty += 4

    y = 204 + ch + 36
    d.text((72, y), "Latest Semgrep scan summary", font=f(28, True), fill=BRAND)
    y += 44
    rrect(d, (72, y, W - 72, y + 420), fill=(17, 24, 39), outline=(17, 24, 39), width=1)
    mono = f(20)
    scan_lines = [
        "Scan Status",
        "  Scanning 380 files tracked by git with 563 Code rules",
        "  Language     Rules   Files          Origin       Rules",
        "  ts              74     366          Community      563",
        "  json             3      11",
        "  <multilang>      6     380",
        "",
        "Scan Summary",
        "  Scan completed successfully.",
        "  • Findings: 0 (0 blocking)",
        "  • Rules run: 83",
        "  • Targets scanned: 380",
        "  • Parsed lines: ~100.0%",
        "  • Scan was limited to files tracked by git",
        "  Ran 83 rules on 380 files: 0 findings.",
    ]
    ty = y + 24
    for line in scan_lines:
        d.text((104, ty), line, font=mono, fill=(229, 231, 235))
        ty += 24

    y = y + 420 + 28
    d.text((72, y), "Triage notes (this scan)", font=f(28, True), fill=BRAND)
    y += 44
    y = bullets(
        d,
        72,
        y,
        [
            "An earlier pass reported 2 blocking findings: javascript.node-crypto.security.gcm-no-tag-length in field-crypto.ts and documents/crypto.ts.",
            "Both decrypt paths already sliced a 16-byte GCM tag and called setAuthTag. createCipheriv/createDecipheriv now also pass { authTagLength: 16 }.",
            "Rescan after that change: 0 findings. No Zoom OAuth, token, or meeting-API issues were reported.",
        ],
        W - 144,
    )

    y += 8
    d.text((72, y), "DAST status", font=f(28, True), fill=BRAND)
    y += 44
    y = bullets(
        d,
        72,
        y,
        [
            "Dynamic Application Security Testing is not in the current automated release pipeline (no ZAP/Burp CI job).",
            "The Zoom question is SAST and/or DAST. This attestation is based on SAST (Semgrep) plus OSCA (npm audit).",
            "Production is HTTPS-only on Vercel. Zoom’s own Marketplace review also includes OWASP Top 10 testing of the Zoom-facing surfaces.",
        ],
        W - 144,
    )

    rrect(d, (72, y + 12, W - 72, y + 118), fill=OK_BG, outline=OK, width=2)
    d.text((96, y + 28), "Attestation", font=f(22, True), fill=BRAND)
    d.text(
        (96, y + 62),
        "Yuzu Immigration undergoes SAST with Semgrep (OWASP Top 10 / TypeScript / Next.js) before production release. Latest scan: 16 Aug 2026, 0 findings.",
        font=f(20),
        fill=MUTED,
    )
    d.text((96, y + 88), "Contact: privacy@yuzu.solutions", font=f(20), fill=MUTED)

    img.save(OUT, "PNG", optimize=True)
    print(OUT)


if __name__ == "__main__":
    main()
