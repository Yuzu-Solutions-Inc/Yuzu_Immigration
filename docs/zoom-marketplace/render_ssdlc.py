#!/usr/bin/env python3
"""Render Yuzu Immigration SSDLC documentation as PNG for Zoom Marketplace."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 2400, 3300
OUT = Path(__file__).with_name("yuzu-ssdlc.png")

CANVAS = (249, 250, 251)
SURFACE = (255, 255, 255)
BRAND = (17, 24, 39)
MUTED = (74, 85, 104)
BORDER = (229, 231, 235)
ACTION = (99, 102, 241)
ACTION_BG = (238, 242, 255)
OK = (5, 150, 105)
OK_BG = (236, 253, 245)
WARN = (180, 83, 9)
WARN_BG = (255, 247, 237)

FONT_DIR = Path("/System/Library/Fonts/Supplemental")
FONT = str(FONT_DIR / "Arial.ttf")
FONT_B = str(FONT_DIR / "Arial Bold.ttf")


def f(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_B if bold else FONT, size)


def wrap(draw: ImageDraw.ImageDraw, text: str, font, max_w: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    cur = ""
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


def heading(draw, x, y, text):
    draw.text((x, y), text, font=f(30, True), fill=BRAND)
    return y + 44


def bullets(draw, x, y, items, max_w, size=22):
    font = f(size)
    for item in items:
        wrapped = wrap(draw, item, font, max_w - 28)
        draw.ellipse((x, y + 8, x + 10, y + 18), fill=ACTION)
        for i, line in enumerate(wrapped):
            draw.text((x + 22, y), line, font=font, fill=MUTED)
            y += 30
        y += 6
    return y


def main():
    img = Image.new("RGB", (W, H), CANVAS)
    d = ImageDraw.Draw(img)

    rrect(d, (40, 36, W - 40, 168), fill=SURFACE, outline=ACTION, width=3)
    d.text((72, 56), "Yuzu Immigration — Secure Software Development Lifecycle (SSDLC)", font=f(34, True), fill=BRAND)
    d.text(
        (72, 104),
        "Yuzu Solutions  ·  Product: Yuzu Immigration CRM  ·  Zoom Meeting integration  ·  August 2026",
        font=f(22),
        fill=MUTED,
    )
    d.text(
        (72, 134),
        "Internal process document for Zoom Marketplace technical design. Scope: all code that handles Zoom OAuth, tokens, and meetings.",
        font=f(20),
        fill=MUTED,
    )

    # Intro
    y = 192
    y = heading(d, 72, y, "1. Purpose")
    y = bullets(
        d,
        72,
        y,
        [
            "Ship changes that create, store, or use Zoom data only after security requirements are met: least-privilege scopes, confidential OAuth, encrypted tokens, and no Zoom secrets in the browser.",
            "This SSDLC covers requirements, design, implementation, review, deployment, and operations for the production app hosted on Vercel (my-consultant.vercel.app).",
        ],
        W - 144,
    )

    y = heading(d, 72, y + 8, "2. Roles and repositories")
    y = bullets(
        d,
        72,
        y,
        [
            "Engineering owner: Yuzu Solutions development team. Production access is limited to GitHub, Vercel, and Supabase project admins.",
            "Source of truth: private GitHub repository. Secrets are never committed. Production secrets live in Vercel environment variables and .env.local (gitignored).",
            "Security coding standards are checked into the repo (never commit secrets; service-role keys server-only; Zod validation; RLS on user-facing tables).",
        ],
        W - 144,
    )

    # Phases as cards
    y = heading(d, 72, y + 10, "3. Lifecycle phases")
    phases = [
        (
            "Requirements",
            [
                "New Zoom capability must justify each OAuth scope.",
                "Current scopes: user:read:user, meeting:write/update/delete:meeting.",
                "PIPEDA / client-PII rules: guest email is not sent to Zoom.",
                "No Zoom SDK, recordings, chat, phone, or webhooks in scope.",
            ],
        ),
        (
            "Design",
            [
                "Confidential OAuth client (Client ID + Secret).",
                "Authorization-code flow; PKCE/state on connect.",
                "Tokens stored in private.zoom_secrets via service-role RPCs.",
                "AES-256-GCM per-firm encryption; TLS 1.2+ in transit.",
            ],
        ),
        (
            "Implementation",
            [
                "TypeScript (strict) on Next.js App Router.",
                "External input validated with Zod.",
                "Zoom Client ID/Secret only on the server.",
                "Browsers never receive ZOOM_CLIENT_SECRET.",
            ],
        ),
        (
            "Review & test",
            [
                "ESLint + TypeScript + production build before release.",
                "Manual OAuth connect / disconnect / book / reschedule / cancel.",
                "Supabase Security Advisor reviewed after schema changes.",
                "Dependency updates reviewed before production deploy.",
            ],
        ),
        (
            "Deploy",
            [
                "Vercel production from the main Git branch (HTTPS only).",
                "Canada-region Supabase (ca-central-1) for stored data.",
                "Env vars set in Vercel; placeholder values are rejected at runtime.",
                "Redirect URI allow-listed in the Zoom Marketplace app.",
            ],
        ),
        (
            "Operate",
            [
                "Staff can disconnect Zoom; tokens are deleted.",
                "Access/refresh tokens are short-lived / rotated on refresh.",
                "Audit events for sensitive CRM actions; minimize Zoom logging.",
                "Incident path: revoke Zoom app, rotate env secrets, notify privacy@yuzu.solutions.",
            ],
        ),
    ]

    card_y = y
    gap = 20
    cw = (W - 72 * 2 - gap * 2) / 3
    ch = 280
    for i, (title, lines) in enumerate(phases):
        col = i % 3
        row = i // 3
        x = 72 + col * (cw + gap)
        cy = card_y + row * (ch + gap)
        rrect(d, (x, cy, x + cw, cy + ch), fill=SURFACE, outline=ACTION, width=2)
        d.rectangle((x, cy, x + 10, cy + ch), fill=ACTION)
        d.text((x + 28, cy + 18), f"{i + 1}. {title}", font=f(24, True), fill=BRAND)
        ty = cy + 58
        for line in lines:
            for wrapped in wrap(d, line, f(20), cw - 52):
                d.text((x + 28, ty), wrapped, font=f(20), fill=MUTED)
                ty += 26
            ty += 6

    y = card_y + 2 * (ch + gap) + 8
    y = heading(d, 72, y, "4. Zoom-specific controls")
    y = bullets(
        d,
        72,
        y,
        [
            "Only the Yuzu server calls Zoom REST APIs (oauth.zoom.us and api.zoom.us). Guest browsers receive a join URL after booking; they do not call Zoom APIs.",
            "Stored Zoom data: staff Zoom email and user id (zoom_connections); encrypted refresh/access tokens (private.zoom_secrets); meeting id and join URL on booking_appointments.",
            "Sent to Zoom for meetings: topic (truncated), start_time, duration. Not sent: guest email, phone, immigration files, or IRCC form contents.",
            "Least privilege: no user:read:email beyond /users/me identity, no recording, no chat, no phone, no webhook secret (webhooks are not used).",
        ],
        W - 144,
    )

    y = heading(d, 72, y + 8, "5. Vulnerability and change management")
    y = bullets(
        d,
        72,
        y,
        [
            "Static checks: TypeScript compiler, ESLint (eslint-config-next), and Next.js production build. Failed builds are not released.",
            "Dependencies: npm lockfile; upgrades reviewed for high-severity issues before production. Zoom and calendar credentials are rotated if exposure is suspected.",
            "Schema changes go through versioned Supabase SQL migrations with RLS. private.zoom_secrets has no client policies (service_role RPCs only).",
            "Third-party platforms in production: Vercel (TLS, secrets), Supabase Canada (RLS, encryption at rest), Resend (email that may include a join URL). Google/Microsoft are optional and independent of Zoom OAuth.",
        ],
        W - 144,
    )

    rrect(d, (72, y + 8, W - 72, y + 118), fill=OK_BG, outline=OK, width=2)
    d.text((96, y + 24), "Attestation", font=f(22, True), fill=BRAND)
    d.text(
        (96, y + 58),
        "Yuzu Solutions maintains this SSDLC for Yuzu Immigration, including the Zoom Meeting integration. Zoom user data is transmitted over TLS 1.2+",
        font=f(20),
        fill=MUTED,
    )
    d.text(
        (96, y + 84),
        "and OAuth tokens are encrypted at rest (AES-256-GCM). Contact: privacy@yuzu.solutions",
        font=f(20),
        fill=MUTED,
    )

    img.save(OUT, "PNG", optimize=True)
    print(OUT)


if __name__ == "__main__":
    main()
