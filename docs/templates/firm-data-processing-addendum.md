# Firm Data Processing Addendum (template)

**Status:** Template for legal review — not executed until signed.  
**Product:** My Consultant (Yuzu Solutions)  
**Aligned with:** PIPEDA accountability / comparable protection for processors

## Parties

- **Firm (Controller):** ________________________________  
- **Yuzu Solutions (Processor):** operator of My Consultant

## Subject matter

Processing of personal information entered into or uploaded to My Consultant by the Firm or the Firm’s clients and booking guests (identity and contact data, preferred language, immigration questionnaires, supporting documents, public bookings, reminder emails, portal/share-link activity, and calendar details when Google Calendar is connected) for the purpose of providing the SaaS practice-management service.

## Obligations of the Processor

1. Process personal information only on documented instructions of the Firm.
2. Ensure persons authorized to process personal information are bound by confidentiality.
3. Implement appropriate safeguards (encryption in transit/at rest, tenant isolation, access controls, logging).
4. Engage subprocessors only under written contracts with comparable protection; maintain a current subprocessor list for the Firm on request. Current operating providers typically include Supabase (Canada — database, auth, storage), Vercel (application hosting and anonymous analytics), Resend (transactional email when configured), and Google (staff Google sign-in and/or Google Calendar/Meet when a consultant connects it).
5. Assist the Firm with individual access/correction requests and breach assessments reasonably related to the service.
6. Delete or return Firm personal information at end of service, subject to legal retention and backup cycles.
7. Make available information necessary to demonstrate compliance with this addendum.

## Obligations of the Firm

1. Ensure a lawful basis / meaningful consent for client personal information.
2. Configure retention and destruction consistent with College of Immigration and Citizenship Consultants duties and applicable privacy law.
3. Promptly notify Yuzu Solutions of security incidents involving Firm credentials or misdirected share links.

## Location

Primary hosting of database, authentication, and stored files: Canada (AWS `ca-central-1` via Supabase) unless otherwise agreed in writing. Application compute, logs, and analytics on Vercel, transactional email via Resend, and Google Calendar/Meet (when connected) may process personal information outside Canada, including the United States.

## Liability / governing law

*[To be completed by counsel — typically governing law of Québec or Ontario, Canada.]*

## Signatures

Firm: ______________________ Date: __________  
Yuzu Solutions: _____________ Date: __________
