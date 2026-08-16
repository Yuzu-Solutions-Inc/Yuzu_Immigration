#!/usr/bin/env python3
"""Yuzu Immigration policy pack for Zoom Marketplace additional documents."""

from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    KeepTogether,
    ListFlowable,
    ListItem,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

OUT = Path(__file__).with_name("yuzu-policy-pack.pdf")
BRAND = HexColor("#111827")
MUTED = HexColor("#4A5568")
ACTION = HexColor("#4F46E5")
RULE = HexColor("#E5E7EB")
OK_BG = HexColor("#ECFDF5")
OK = HexColor("#059669")
WARN_BG = HexColor("#FFF7ED")
WARN = HexColor("#C2410C")


def styles():
    base = getSampleStyleSheet()
    s = {
        "cover": ParagraphStyle(
            "cover",
            parent=base["Title"],
            fontName="Times-Bold",
            fontSize=22,
            leading=26,
            textColor=BRAND,
            spaceAfter=8,
            alignment=TA_LEFT,
        ),
        "sub": ParagraphStyle(
            "sub",
            parent=base["Normal"],
            fontName="Times-Italic",
            fontSize=11,
            leading=14,
            textColor=MUTED,
            spaceAfter=10,
        ),
        "h1": ParagraphStyle(
            "h1",
            parent=base["Heading1"],
            fontName="Times-Bold",
            fontSize=14,
            leading=18,
            textColor=BRAND,
            spaceBefore=14,
            spaceAfter=8,
        ),
        "h2": ParagraphStyle(
            "h2",
            parent=base["Heading2"],
            fontName="Times-Bold",
            fontSize=12,
            leading=15,
            textColor=BRAND,
            spaceBefore=10,
            spaceAfter=6,
        ),
        "body": ParagraphStyle(
            "body",
            parent=base["Normal"],
            fontName="Times-Roman",
            fontSize=10,
            leading=13.5,
            textColor=BRAND,
            alignment=TA_JUSTIFY,
            spaceAfter=7,
        ),
        "small": ParagraphStyle(
            "small",
            parent=base["Normal"],
            fontName="Times-Roman",
            fontSize=9,
            leading=12,
            textColor=MUTED,
            spaceAfter=4,
        ),
        "callout": ParagraphStyle(
            "callout",
            parent=base["Normal"],
            fontName="Times-Roman",
            fontSize=10,
            leading=13.5,
            textColor=BRAND,
            spaceAfter=0,
        ),
        "footer": ParagraphStyle(
            "footer",
            parent=base["Normal"],
            fontName="Times-Roman",
            fontSize=8,
            textColor=MUTED,
        ),
        "li": ParagraphStyle(
            "li",
            parent=base["Normal"],
            fontName="Times-Roman",
            fontSize=10,
            leading=13,
            textColor=BRAND,
            leftIndent=0,
        ),
    }
    return s


def bullets(items, s):
    return ListFlowable(
        [ListItem(Paragraph(i, s["li"]), leftIndent=12, bulletColor=ACTION) for i in items],
        bulletType="bullet",
        leftIndent=18,
        bulletFontName="Times-Roman",
        bulletFontSize=10,
        spaceAfter=8,
    )


def callout(text, s, bg, border):
    inner = Paragraph(text, s["callout"])
    t = Table([[inner]], colWidths=[6.5 * inch])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), bg),
                ("BOX", (0, 0), (-1, -1), 0.8, border),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    return KeepTogether([t, Spacer(1, 10)])


def header_footer(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(ACTION)
    canvas.rect(0, letter[1] - 8, letter[0], 8, fill=1, stroke=0)
    canvas.setFillColor(MUTED)
    canvas.setFont("Times-Roman", 8)
    canvas.drawString(
        0.75 * inch,
        0.45 * inch,
        "Yuzu Solutions — Yuzu Immigration policy pack — confidential Zoom Marketplace review",
    )
    canvas.drawRightString(letter[0] - 0.75 * inch, 0.45 * inch, f"Page {doc.page}")
    canvas.restoreState()


def build():
    s = styles()
    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=letter,
        leftMargin=0.75 * inch,
        rightMargin=0.75 * inch,
        topMargin=0.7 * inch,
        bottomMargin=0.7 * inch,
        title="Yuzu Immigration — Security, privacy, and operations policy pack",
        author="Yuzu Solutions",
    )
    story = []

    story.append(Paragraph("Yuzu Immigration", s["cover"]))
    story.append(
        Paragraph(
            "Security, privacy, and operations policy pack<br/>Zoom Marketplace additional documents — 16 August 2026",
            s["sub"],
        )
    )
    story.append(
        Paragraph(
            "Operator: Yuzu Solutions. Product: Yuzu Immigration (practice-management CRM for Canadian immigration consultants). "
            "Production: https://my-consultant.vercel.app. Privacy contact: privacy@yuzu.solutions.",
            s["body"],
        )
    )
    story.append(
        callout(
            "<b>SOC 2:</b> Yuzu Solutions does <b>not</b> currently hold a SOC 2 report for Yuzu Immigration. "
            "Do not treat this pack as a Yuzu SOC 2 certification. Primary data host <b>Supabase</b> and application host "
            "<b>Vercel</b> each publish SOC 2 Type 2 reports for their platforms. Those reports cover subprocessors, not Yuzu Solutions as the app operator.",
            s,
            WARN_BG,
            WARN,
        )
    )
    story.append(Paragraph("Contents", s["h2"]))
    story.append(
        bullets(
            [
                "A. Information security policy",
                "B. Vulnerability management policy",
                "C. Data retention and protection policy",
                "D. Incident management and response policy",
                "E. Infrastructure and dependency management policy",
                "F. Privacy policy (summary + public URL)",
                "G. Certifications and subprocessors",
            ],
            s,
        )
    )
    story.append(
        Paragraph(
            "These documents describe how Yuzu Solutions actually operates Yuzu Immigration, including the Zoom Meeting "
            "integration (OAuth, meeting create/update/delete, encrypted token storage). They are written for Zoom’s "
            "confidential security review. They are not legal advice and are not a PIPEDA or ISO certification.",
            s["small"],
        )
    )

    # A Security
    story.append(Paragraph("A. Information security policy", s["h1"]))
    story.append(
        Paragraph(
            "Purpose. Protect firm, staff, client, booking-guest, and Zoom-connected account data against unauthorized "
            "access, alteration, and disclosure, in proportion to the sensitivity of Canadian immigration files.",
            s["body"],
        )
    )
    story.append(Paragraph("Scope", s["h2"]))
    story.append(
        Paragraph(
            "All production systems for Yuzu Immigration: Next.js application on Vercel, Supabase (Auth, Postgres, Storage) "
            "in AWS Canada Central, and third-party integrations a consultant may connect (Google, Microsoft, Zoom, Resend).",
            s["body"],
        )
    )
    story.append(Paragraph("Controls", s["h2"]))
    story.append(
        bullets(
            [
                "<b>Secrets:</b> Zoom, Google, Microsoft, Supabase service-role, and encryption keys are stored only in Vercel environment variables and local .env.local (gitignored). Never in NEXT_PUBLIC_* variables, client bundles, or source control.",
                "<b>Authentication:</b> Staff use Supabase Auth (email/password or Google). Client portal passwords are stored in a private schema and verified only on the server. Public booking and share links use unguessable tokens.",
                "<b>Authorization:</b> Postgres row-level security isolates firms. Assistants see only shared projects. Service-role database access is limited to audited server paths and RPCs.",
                "<b>Encryption in transit:</b> TLS 1.2+ for the application, database connections, and Zoom/Google/Microsoft APIs.",
                "<b>Encryption at rest:</b> Platform encryption for database and storage. Application-level AES-256-GCM for uploaded documents, many client fields, and Zoom/Google/Microsoft OAuth tokens, using a per-firm data key.",
                "<b>Zoom least privilege:</b> Confidential OAuth client. Scopes limited to user:read:user and meeting write/update/delete. No Zoom SDK, recordings, chat, phone, or webhooks. Guest email is not sent to Zoom as a registrant.",
                "<b>Logging:</b> Security audit events for sensitive CRM actions. Zoom tokens are not written to application logs. Minimize PII in logs.",
                "<b>Access to production:</b> GitHub, Vercel, and Supabase admin access is limited to Yuzu Solutions operators who need it.",
            ],
            s,
        )
    )
    story.append(
        Paragraph(
            "Coding standards (checked into the engineering repo) require Zod validation of external input, no secrets in git, "
            "and RLS on user-facing tables. Failed TypeScript, ESLint, or production builds are not released.",
            s["body"],
        )
    )

    # B Vuln mgmt
    story.append(Paragraph("B. Vulnerability management policy", s["h1"]))
    story.append(
        Paragraph(
            "Identify, triage, and remediate vulnerabilities in Yuzu Immigration source code and production dependencies before "
            "they can be exploited, with extra scrutiny on code that handles OAuth tokens or Zoom APIs.",
            s["body"],
        )
    )
    story.append(
        bullets(
            [
                "<b>Static testing (SAST):</b> Semgrep with OWASP Top 10, TypeScript, and Next.js rules on src/. Latest scan 16 August 2026: 380 files, 0 findings after triage. An earlier GCM authTagLength finding was fixed by passing { authTagLength: 16 } on AES-256-GCM cipher APIs.",
                "<b>Component analysis (OSCA):</b> npm audit against the lockfile before production releases. Latest production-omit audit: 0 vulnerabilities.",
                "<b>Complementary gates:</b> TypeScript strict compile, ESLint (eslint-config-next), Next.js production build.",
                "<b>Schema review:</b> Versioned Supabase SQL migrations. Security Advisor reviewed after schema changes. private.zoom_secrets has no client RLS policies (service-role RPCs only).",
                "<b>Severity and SLA:</b> Critical/high issues that expose Zoom tokens, client PII, or tenant isolation are treated as incidents (section D) and patched before further Zoom-related releases. Medium/low issues are scheduled into the next production deploy.",
                "<b>Disclosure:</b> Researchers or firms may report issues to privacy@yuzu.solutions. We do not run a public bug bounty.",
                "<b>Out of current pipeline:</b> Automated DAST (ZAP/Burp CI) and third-party penetration testing are not yet scheduled. Zoom’s Marketplace review includes OWASP testing of Zoom-facing surfaces.",
            ],
            s,
        )
    )

    # C Retention
    story.append(Paragraph("C. Data retention and protection policy", s["h1"]))
    story.append(Paragraph("Protection", s["h2"]))
    story.append(
        bullets(
            [
                "Primary application data (database, Auth, Storage) is hosted in Canada (Supabase / AWS ca-central-1).",
                "Uploaded client documents and many identity/contact fields are encrypted with AES-256-GCM using a per-firm data encryption key wrapped by DOCUMENT_ENCRYPTION_KEY.",
                "Zoom refresh and access tokens are encrypted the same way and stored in private.zoom_secrets. Staff Zoom email and user id are stored on zoom_connections. Meeting id and join URL are stored on booking_appointments.",
                "Data sent to Zoom for a meeting: topic (truncated to 200 characters), start_time, duration. Not sent: guest email, phone, address, immigration files, or IRCC form contents.",
            ],
            s,
        )
    )
    story.append(Paragraph("Retention", s["h2"]))
    story.append(
        bullets(
            [
                "Active firm workspaces retain client and project records while the workspace is active.",
                "When a file is closed, the product sets retain_until to six years after closure (College of Immigration and Citizenship Consultants closed-file practice).",
                "Staff may delete a person or project (erasing application PII, documents, questionnaire answers, share links, portal access, and attempting to delete the matching calendar event and Zoom/Teams meeting).",
                "Disconnecting Zoom deletes that staff member’s Zoom OAuth tokens from Yuzu Immigration.",
                "After retain_until, a firm administrator may destroy a closed file. A placeholder project row and an encrypted destruction-register entry remain for the firm’s professional record. Related security audit rows are retained with IP, user-agent, and event metadata removed.",
                "Hashed booking rate-limit events are deleted after about 14 days.",
                "Emails already sent, copies of meetings held by Zoom/Google/Microsoft, and database backups can outlive an application delete until those copies expire.",
            ],
            s,
        )
    )

    # D Incident
    story.append(Paragraph("D. Incident management and response policy", s["h1"]))
    story.append(
        Paragraph(
            "An incident is unauthorized access, disclosure, or loss of personal information or Zoom OAuth tokens; a suspected "
            "compromise of production credentials; or a vulnerability being actively exploited.",
            s["body"],
        )
    )
    story.append(Paragraph("Roles", s["h2"]))
    story.append(
        Paragraph(
            "Privacy and security contact: privacy@yuzu.solutions. Engineering owner: Yuzu Solutions development team. "
            "Firms remain responsible for notifying their own clients when their files or bookings are affected.",
            s["body"],
        )
    )
    story.append(Paragraph("Response steps", s["h2"]))
    story.append(
        bullets(
            [
                "<b>Detect:</b> Operator alerts, customer reports, unusual Zoom/Google/Microsoft API errors, failed auth spikes, or Security Advisor findings.",
                "<b>Contain:</b> Revoke or rotate exposed secrets (ZOOM_CLIENT_SECRET, DOCUMENT_ENCRYPTION_KEY, service-role key). Disconnect or delete stored OAuth tokens. Disable the affected integration if needed. Rotate Zoom Marketplace credentials if the confidential client secret leaked.",
                "<b>Assess:</b> Determine what data was involved (Zoom tokens vs client PII vs tenant isolation). Under PIPEDA, assess whether there is a real risk of significant harm.",
                "<b>Notify:</b> Where required, notify affected firms and individuals and report to the Office of the Privacy Commissioner of Canada. Give firms the facts they need for their own notices. Notify Zoom if Zoom user tokens or the Zoom app secret were compromised.",
                "<b>Eradicate and recover:</b> Patch, redeploy, confirm tokens were deleted or re-encrypted, and restore service from known-good configuration.",
                "<b>Post-incident:</b> Record the event, root cause, and follow-up actions. Update this pack and the public privacy policy if practices change.",
            ],
            s,
        )
    )
    story.append(
        Paragraph(
            "In-product audit logs (Settings → Security) support investigation of downloads, uploads, share links, and deletions. "
            "They are not a SIEM. Near-misses should still be recorded internally.",
            s["body"],
        )
    )

    # E Infra / deps
    story.append(Paragraph("E. Infrastructure and dependency management policy", s["h1"]))
    story.append(
        bullets(
            [
                "<b>Source control:</b> Private GitHub repository. Production deploys from the main branch to Vercel over HTTPS.",
                "<b>Runtime:</b> Next.js 16 App Router, React 19, TypeScript, Node.js on Vercel Fluid Compute. No Zoom Meeting SDK.",
                "<b>Data plane:</b> Supabase project in Canada Central (Postgres + Auth + Storage). Drizzle ORM. RLS enabled on user-facing tables.",
                "<b>Dependencies:</b> npm with a committed lockfile. Production dependencies are audited (npm audit). Upgrades that fix high-severity issues are prioritized. Unused or abandoned packages are not added without review.",
                "<b>Zoom SDK / libraries:</b> Zoom is called with native HTTPS fetch to oauth.zoom.us and api.zoom.us. No zoomus SDK in the application.",
                "<b>Environments:</b> Local development uses .env.local. Production secrets are set in Vercel. Placeholder values such as the string ZOOM_CLIENT_ID are rejected at runtime.",
                "<b>Patching hosts:</b> Vercel and Supabase apply platform patches. Yuzu patches application dependencies and Next.js via planned upgrades and production builds.",
                "<b>Subprocessors:</b> listed in section G. New subprocessors that receive personal information require a privacy-policy update and firm notice when practical.",
            ],
            s,
        )
    )

    # F Privacy
    story.append(Paragraph("F. Privacy policy", s["h1"]))
    story.append(
        callout(
            "<b>Public policy (authoritative):</b> https://my-consultant.vercel.app/en/privacy<br/>"
            "French: /fr/privacy &nbsp;&nbsp; Spanish: /es/privacy<br/>"
            "Last updated: 16 August 2026. Contact: privacy@yuzu.solutions",
            s,
            OK_BG,
            OK,
        )
    )
    story.append(
        Paragraph(
            "Yuzu Immigration is operated by Yuzu Solutions as a service provider to consulting firms. The firm is generally "
            "responsible for the client file. Yuzu Solutions is responsible for staff account data used to run the service. "
            "The public policy is written to support PIPEDA accountability. It is not a certification.",
            s["body"],
        )
    )
    story.append(Paragraph("Zoom-related processing (from the public policy)", s["h2"]))
    story.append(
        bullets(
            [
                "A consultant may connect Zoom under Settings → Calendar → Meetings. This is independent of Google Calendar or Outlook.",
                "We store encrypted OAuth tokens, the connected Zoom email and user id, and (for bookings) the Zoom meeting id and join URL.",
                "We create/update/delete meetings with topic, start time, and duration. We do not send the guest’s email to Zoom, do not access recordings/chat/phone, and do not use Zoom data for advertising.",
                "Disconnecting Zoom deletes that staff member’s Zoom tokens from Yuzu Immigration. Deleting a booking attempts to delete the matching Zoom meeting.",
                "Zoom processes meeting metadata outside Canada. Firms remain responsible for Law 25 transfer assessments where those apply.",
            ],
            s,
        )
    )
    story.append(
        Paragraph(
            "Consent: staff accept the Privacy Policy and Terms when creating an account. Public booking and client share links "
            "require both checkboxes before data is submitted. We do not sell personal information.",
            s["body"],
        )
    )

    # G certs
    story.append(Paragraph("G. Certifications and subprocessors", s["h1"]))
    story.append(Paragraph("Yuzu Solutions certifications", s["h2"]))
    story.append(
        Paragraph(
            "Yuzu Solutions does not currently hold SOC 2, ISO/IEC 27001, or similar third-party certifications for Yuzu Immigration. "
            "This pack plus the live privacy policy, SSDLC document, architecture diagram, and Semgrep/npm-audit evidence are the "
            "security artifacts available for this Zoom review.",
            s["body"],
        )
    )
    story.append(Paragraph("Subprocessor certifications (not Yuzu’s own)", s["h2"]))
    rows = [
        [
            Paragraph("<b>Provider</b>", s["li"]),
            Paragraph("<b>Role</b>", s["li"]),
            Paragraph("<b>Notes</b>", s["li"]),
        ],
        [
            Paragraph("Supabase", s["li"]),
            Paragraph("Database, Auth, Storage (Canada)", s["li"]),
            Paragraph("SOC 2 Type 2 available to customers from the Supabase dashboard. DPA available at supabase.com/legal/dpa.", s["li"]),
        ],
        [
            Paragraph("Vercel", s["li"]),
            Paragraph("Application hosting, analytics", s["li"]),
            Paragraph("SOC 2 Type 2 / platform security reports published by Vercel. TLS termination for my-consultant.vercel.app.", s["li"]),
        ],
        [
            Paragraph("Resend", s["li"]),
            Paragraph("Transactional email (when configured)", s["li"]),
            Paragraph("May include a Zoom join URL in booking mail. Used only if the firm enables email.", s["li"]),
        ],
        [
            Paragraph("Google / Microsoft", s["li"]),
            Paragraph("Optional calendar or meeting tools", s["li"]),
            Paragraph("Connected per staff member. Independent of Zoom OAuth.", s["li"]),
        ],
        [
            Paragraph("Zoom", s["li"]),
            Paragraph("Optional meeting join links", s["li"]),
            Paragraph("User-managed OAuth. Confidential client. Meeting APIs only.", s["li"]),
        ],
    ]
    table = Table(rows, colWidths=[1.3 * inch, 2.0 * inch, 3.2 * inch])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), HexColor("#EEF2FF")),
                ("GRID", (0, 0), (-1, -1), 0.4, RULE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(table)
    story.append(Spacer(1, 12))
    story.append(
        Paragraph(
            "A firm data-processing addendum template exists for legal review (not an executed certificate). "
            "Public Terms: https://my-consultant.vercel.app/en/terms",
            s["body"],
        )
    )
    story.append(
        callout(
            "<b>Attestation.</b> This pack is the current Yuzu Solutions policy set for Yuzu Immigration as of 16 August 2026. "
            "Questions: privacy@yuzu.solutions.",
            s,
            OK_BG,
            OK,
        )
    )

    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
    print(OUT)


if __name__ == "__main__":
    build()
