# Vendor due-diligence pack — Yuzu Immigration

**Vendor:** Yuzu Solutions Inc.  
**Product:** Yuzu Immigration  
**Privacy Officer:** Adrien Yvin — privacy@yuzu.solutions  
**Date:** 16 August 2026  

Give this document to your privacy officer or counsel when completing a Law 25 EFVP or a PIPEDA accountability review. It describes the product as built; it is **not** a certification.

## 1. Roles

| Party | Role |
|---|---|
| Your firm | Controller of client / guest files |
| Yuzu Solutions Inc. | Processor of those files; controller of staff-account data used to run the service |

## 2. Data map (simplified)

```
Client / guest → portal or booking page → Yuzu app (Vercel)
                                              ↓
                         Encrypted fields & files → Supabase (AWS Montréal)
                                              ↓
                    Optional: Resend email, Google / Microsoft / Zoom, Square
```

## 3. Categories of personal information

Staff: name, email, role, IMM 5476 representative fields, auth identifiers, connected-account email.  
Clients/guests: name, contact, address (if collected), language, immigration-status labels, questionnaire answers, documents, notes, booking details, meeting links.  
Technical: audit IP and user-agent for some actions; hashed email/IP for booking abuse (~14 days).  
Not in product: biometric matching.

## 4. Safeguards

- TLS in transit  
- Infrastructure encryption at rest (Supabase)  
- Per-firm AES-256-GCM for documents and many client fields  
- RLS tenant isolation; assistants see only shared projects  
- Service-role key server-only  
- Unguessable booking tokens; portal passwords  
- Audit log and destruction register for firm admins  
- Analytics opt-in only  

**Residual:** Yuzu operators who hold the wrap key can decrypt firm data to operate or restore the service.

## 5. Locations

- System of record: Canada (`ca-central-1`)  
- App compute/logs: Vercel (often United States)  
- Email / optional calendars / meetings / payments: typically United States  

See `yuzu-subprocessors.pdf`. Yuzu has internal extra-Québec EFVPs. **Your firm still needs its own EFVP** (`firm-efvp-template.pdf`).

## 6. Retention

Closed files: six years in-product, then admin destroy. Backups/PITR, sent email, and calendar copies at Google/Microsoft/Zoom can last longer.

## 7. Individual rights (how the product helps)

- Export person (JSON) and full file (ZIP) — firm admins  
- Edit records in the workspace (rectification)  
- Delete person / destroy closed file after retain-until  
- Booking guests: change/cancel links in confirmation email  

Requests should come to **you**. Escalate platform issues to privacy@yuzu.solutions.

## 8. Incidents

Yuzu maintains an incident register and will notify your firm without undue delay if your tenant is affected. You remain responsible for notifying your clients and, where required, the CAI and OPC.

## 9. Contracts to sign

- Terms and Privacy Policy (accepted in-product)  
- This pack’s `firm-data-processing-addendum.pdf` (sign before loading production client PII)

## 10. What we do not claim

No “PIPEDA certified” or “Law 25 certified.” No HIPAA. No guarantee of immigration outcomes or of form acceptance by IRCC/MIFI.
