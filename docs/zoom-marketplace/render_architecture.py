#!/usr/bin/env python3
"""Render the Zoom Marketplace architecture diagram as PNG."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 2400, 3180
OUT = Path(__file__).with_name("yuzu-zoom-architecture.png")

CANVAS = (249, 250, 251)
SURFACE = (255, 255, 255)
BRAND = (17, 24, 39)
MUTED = (74, 85, 104)
BORDER = (229, 231, 235)
LINE = (156, 163, 175)
ACTION = (99, 102, 241)
ACTION_BG = (238, 242, 255)
ZOOM = (45, 140, 255)
ZOOM_BG = (239, 246, 255)
SUPA = (5, 150, 105)
SUPA_BG = (236, 253, 245)
OPT = (107, 114, 128)
OPT_BG = (243, 244, 246)

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


def rrect(draw: ImageDraw.ImageDraw, xy, fill, outline=BORDER, width=2, radius=18):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def card(draw, x, y, w, h, title, lines, accent, fill):
    rrect(draw, (x, y, x + w, y + h), fill=fill, outline=accent, width=3)
    draw.rectangle((x, y, x + 10, y + h), fill=accent)
    title_font = f(28, True)
    body_font = f(22)
    draw.text((x + 28, y + 18), title, font=title_font, fill=BRAND)
    ty = y + 58
    for line in lines:
        for wrapped in wrap(draw, line, body_font, w - 48):
            draw.text((x + 28, ty), wrapped, font=body_font, fill=MUTED)
            ty += 30
    return (x + w / 2, y, x + w / 2, y + h)


def arrow(draw, x1, y1, x2, y2, label=None):
    draw.line((x1, y1, x2, y2), fill=ACTION, width=4)
    # arrowhead
    if abs(y2 - y1) >= abs(x2 - x1):
        # vertical
        direction = 1 if y2 > y1 else -1
        draw.polygon(
            [
                (x2, y2),
                (x2 - 10, y2 - 16 * direction),
                (x2 + 10, y2 - 16 * direction),
            ],
            fill=ACTION,
        )
    else:
        direction = 1 if x2 > x1 else -1
        draw.polygon(
            [
                (x2, y2),
                (x2 - 16 * direction, y2 - 10),
                (x2 - 16 * direction, y2 + 10),
            ],
            fill=ACTION,
        )
    if label:
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        font = f(18, True)
        tw = draw.textlength(label, font=font)
        pad = 8
        rrect(
            draw,
            (mx - tw / 2 - pad, my - 16, mx + tw / 2 + pad, my + 16),
            fill=SURFACE,
            outline=ACTION,
            width=1,
            radius=8,
        )
        draw.text((mx - tw / 2, my - 10), label, font=font, fill=ACTION)


def step_row(draw, x, y, w, n, title, body):
    rrect(draw, (x, y, x + w, y + 108), fill=SURFACE, outline=BORDER, width=2, radius=14)
    draw.ellipse((x + 16, y + 32, x + 60, y + 76), fill=ACTION)
    nf = f(22, True)
    nw = draw.textlength(str(n), font=nf)
    draw.text((x + 38 - nw / 2, y + 42), str(n), font=nf, fill=(255, 255, 255))
    draw.text((x + 76, y + 16), title, font=f(24, True), fill=BRAND)
    ty = y + 50
    for line in wrap(draw, body, f(20), w - 100):
        draw.text((x + 76, ty), line, font=f(20), fill=MUTED)
        ty += 26


def main() -> None:
    img = Image.new("RGB", (W, H), CANVAS)
    d = ImageDraw.Draw(img)

    d.text((80, 48), "Yuzu Immigration  ·  Zoom Meeting integration", font=f(42, True), fill=BRAND)
    d.text(
        (80, 108),
        "Architecture and data flows for Zoom Marketplace review  ·  Yuzu Solutions  ·  August 2026",
        font=f(24),
        fill=MUTED,
    )
    d.line((80, 156, W - 80, 156), fill=BORDER, width=2)

    # --- 1. System architecture ---
    d.text((80, 180), "1. System architecture", font=f(32, True), fill=BRAND)
    d.text(
        (80, 224),
        "Only the Yuzu Immigration server talks to Zoom. Browsers never receive a Zoom client secret.",
        font=f(22),
        fill=MUTED,
    )

    # Actors
    card(
        d, 80, 280, 520, 150,
        "Consultant browser",
        ["Staff Settings → Calendar → Meetings", "Clicks Connect Zoom / Stop using"],
        ACTION, ACTION_BG,
    )
    card(
        d, 1800, 280, 520, 150,
        "Client / guest browser",
        ["Public booking page", "Sees join URL after booking; never talks to Zoom"],
        OPT, OPT_BG,
    )

    # Yuzu
    rrect(d, (80, 520, 2320, 900), fill=SURFACE, outline=ACTION, width=3, radius=22)
    d.rectangle((80, 520, 90, 900), fill=ACTION)
    d.text((120, 540), "Yuzu Immigration  —  Next.js 16 App Router on Vercel (Node.js / Fluid Compute)", font=f(28, True), fill=BRAND)
    d.text(
        (120, 584),
        "TLS in transit. Server-only Zoom OAuth (confidential client: Client ID + Client Secret). No Zoom SDK.",
        font=f(22),
        fill=MUTED,
    )
    card(
        d, 120, 640, 680, 220,
        "Settings + OAuth start",
        ["startZoomConnectAction", "Redirects to zoom.us/oauth/authorize", "Scopes: user:read:user,", "meeting:write/update/delete:meeting"],
        ACTION, ACTION_BG,
    )
    card(
        d, 840, 640, 700, 220,
        "OAuth callback",
        ["/auth/zoom/callback", "Exchanges code at zoom.us/oauth/token", "Basic auth with client secret", "Encrypts tokens with per-firm AES-256-GCM"],
        ACTION, ACTION_BG,
    )
    card(
        d, 1580, 640, 700, 220,
        "Booking + meeting lifecycle",
        ["Creates/updates/deletes Zoom meetings", "Stores join URL on the appointment", "Writes event to Google Calendar or Outlook", "Emails join link via Resend"],
        ACTION, ACTION_BG,
    )

    arrow(d, 340, 430, 340, 520)
    arrow(d, 2060, 430, 1930, 640)

    # Data + Zoom
    card(
        d, 80, 960, 1080, 340,
        "Supabase  —  Postgres + Auth + Storage  (AWS Canada Central)",
        [
            "public.zoom_connections — staff Zoom email + user id",
            "private.zoom_secrets — encrypted refresh/access tokens (service_role RPCs only; no client access)",
            "public.booking_appointments — conference_id (zoom:{id}) + meet_join_url",
            "Row Level Security by organization. Tokens never logged.",
        ],
        SUPA, SUPA_BG,
    )
    card(
        d, 1240, 960, 1080, 340,
        "Zoom  —  Marketplace General app (user-managed, confidential client)",
        [
            "https://zoom.us/oauth/authorize  —  user consent",
            "https://zoom.us/oauth/token  —  authorization_code + refresh_token",
            "GET /v2/users/me  —  email + Zoom user id",
            "POST /v2/users/me/meetings  ·  PATCH/DELETE /v2/meetings/{id}",
            "Payload: topic, start_time, duration. No guest email sent to Zoom.",
        ],
        ZOOM, ZOOM_BG,
    )
    arrow(d, 620, 900, 620, 960, "read/write")
    arrow(d, 1780, 860, 1780, 960, "HTTPS REST")

    # Optional services
    d.text((80, 1330), "Other services the product may use (not required for Zoom OAuth itself)", font=f(22, True), fill=MUTED)
    card(d, 80, 1374, 720, 140, "Google Calendar / Meet", ["Optional calendar + Meet join links", "Independent of Zoom"], OPT, OPT_BG)
    card(d, 840, 1374, 720, 140, "Microsoft Outlook / Teams", ["Optional calendar + Teams join links", "Independent of Zoom"], OPT, OPT_BG)
    card(d, 1600, 1374, 720, 140, "Resend", ["Transactional booking emails", "May include the Zoom join URL"], OPT, OPT_BG)

    # --- 2. Connect flow ---
    d.text((80, 1550), "2. Connect Zoom (OAuth 2.0 authorization code)", font=f(32, True), fill=BRAND)
    steps_a = [
        ("Consultant starts connect", "Signed-in staff member clicks Connect Zoom in Settings. Yuzu redirects the browser to Zoom with client_id, redirect_uri, state, and scopes."),
        ("User authorizes on Zoom", "Zoom shows consent. On Allow, Zoom redirects to https://{app}/auth/zoom/callback?code&state."),
        ("Server exchanges the code", "Yuzu server POSTs the code to zoom.us/oauth/token with HTTP Basic (Client ID:Client Secret). The browser never sees the secret."),
        ("Tokens stored encrypted", "Refresh and access tokens are AES-256-GCM encrypted with the firm’s data key and written to private.zoom_secrets. Email/user id go on zoom_connections. Meeting provider is set to zoom."),
    ]
    y = 1600
    for i, (title, body) in enumerate(steps_a, 1):
        step_row(d, 80, y, 2240, i, title, body)
        y += 124

    # --- 3. Booking flow ---
    d.text((80, 2120), "3. Booking creates a Zoom meeting", font=f(32, True), fill=BRAND)
    steps_b = [
        ("Guest books a consultation", "Client submits the public booking page. Appointment is stored in booking_appointments (guest PII encrypted)."),
        ("Yuzu creates the Zoom meeting", "Server uses the host’s stored refresh token, then POST /users/me/meetings with topic + start/end. Zoom returns id and join_url."),
        ("Join link saved and shared", "conference_id and meet_join_url are stored. The join URL is copied onto the Google/Outlook calendar event (location/description) and emailed via Resend."),
        ("Reschedule or cancel", "PATCH /meetings/{id} on time changes. DELETE /meetings/{id} on cancel or file destruction. Disconnect Zoom deletes tokens from Yuzu."),
    ]
    y = 2170
    for i, (title, body) in enumerate(steps_b, 1):
        step_row(d, 80, y, 2240, i, title, body)
        y += 124

    # --- 4. Trust boundary ---
    d.text((80, 2688), "4. Trust boundary and data that never leaves Yuzu for Zoom", font=f(32, True), fill=BRAND)
    card(
        d, 80, 2740, 1100, 340,
        "Sent to Zoom",
        [
            "Consultant Zoom identity (after they consent)",
            "Meeting topic (appointment title, max 200 chars)",
            "Start time and duration",
            "OAuth tokens used only server-side to call Zoom",
        ],
        ZOOM, ZOOM_BG,
    )
    card(
        d, 1220, 2740, 1100, 340,
        "Not sent to Zoom",
        [
            "Client/guest email, phone, address, or documents",
            "Immigration file contents or IRCC forms",
            "Zoom cloud recordings, chat, phone, or contacts (not in scope)",
            "Client secret (stored only in server environment, never in the browser)",
        ],
        SUPA, SUPA_BG,
    )

    d.text(
        (80, 3108),
        "Source: Yuzu Immigration production architecture  ·  Zoom APIs: oauth + /v2/users/me + /v2/meetings  ·  No Zoom webhooks or Meeting SDK",
        font=f(18),
        fill=MUTED,
    )

    img.save(OUT, "PNG", optimize=True)
    print(OUT)


if __name__ == "__main__":
    main()
