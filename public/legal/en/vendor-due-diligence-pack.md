# Vendor due-diligence pack — %PRODUCT_NAME%

**Vendor:** %OPERATOR_AS%  
**Product:** %PRODUCT_NAME%  
**Privacy Officer:** Adrien Yvin — %PRIVACY_EMAIL%  
**Date:** 5 September 2026  

Give this document to your privacy officer or counsel when completing a Law 25 EFVP or a PIPEDA accountability review. It describes the product as built; it is **not** a certification.

## 1. Roles

| Party | Role |
|---|---|
| Your firm | Controller of client / guest files |
| %OPERATOR_NAME% | Processor of those files; controller of staff-account data used to run the service |

## 2. Data map (simplified)

```
Client / guest → portal or booking page → %PRODUCT_NAME% app (Vercel)
                                              ↓
                         Encrypted fields & files → Supabase (AWS Montréal)
                                              ↓
     Optional: Resend email, Google / Microsoft / Zoom,
               Square or Stripe payments, Sage Accounting
     Always if subscribed: Stripe billing for the firm
```

## 3. Categories of personal information

Staff: name, email, role, IMM 5476 representative fields, auth identifiers, connected-account email.  
Clients/guests: name, contact, address (if collected), language, immigration-status labels, questionnaire answers, documents, notes, booking details, meeting links, payment identifiers when a processor is connected.  
Accounting (if Sage is connected): name, email, billing address, invoice amounts.  
Technical: audit IP and user-agent for some actions; hashed email/IP for booking abuse (~14 days).  
Not in product: biometric matching.

## 4. Safeguards

- TLS in transit  
- Infrastructure encryption at rest (Supabase)  
- Per-firm AES-256-GCM for documents and many client fields  
- RLS tenant isolation; staff access is scoped to the firm  
- Service-role key server-only  
- Unguessable booking tokens; portal passwords  
- Audit log and destruction register for firm admins  
- Analytics opt-in only  

**Residual:** %OPERATOR_NAME% operators who hold the wrap key can decrypt firm data to operate or restore the service.

## 5. Locations

- System of record: Canada (`ca-central-1`)  
- App compute/logs: Vercel (often United States)  
- Email / optional calendars / meetings / payments / accounting: typically United States (Sage typically United Kingdom / United States)  

See `yuzu-subprocessors.pdf`. %OPERATOR_NAME% has internal extra-Québec EFVPs. **Your firm still needs its own EFVP** (`firm-efvp-template.pdf`).

## 6. Retention

Closed files: six years in-product, then admin destroy. Backups/PITR, sent email, calendar copies at Google/Microsoft/Zoom, payment records at Square or Stripe, and invoices at Sage can last longer.

## 7. Individual rights (how the product helps)

- Export person (JSON) and full file (ZIP) — firm admins  
- Edit records in the workspace (rectification)  
- Delete person / destroy closed file after retain-until  
- Booking guests: change/cancel links in confirmation email  

Requests should come to **you**. Escalate platform issues to %PRIVACY_EMAIL%.

## 8. Incidents

%OPERATOR_NAME% maintains an incident register and will notify your firm without undue delay if your tenant is affected. You remain responsible for notifying your clients and, where required, the CAI and OPC.

## 9. Contracts to sign

- Terms and Privacy Policy (accepted in-product)  
- This pack’s `firm-data-processing-addendum.pdf` (sign before loading production client PII)

## 10. What we do not claim

No “PIPEDA certified” or “Law 25 certified.” No HIPAA. No guarantee of immigration outcomes or of form acceptance by IRCC/MIFI.
