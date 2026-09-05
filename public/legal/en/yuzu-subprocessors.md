# Subprocessors — %PRODUCT_NAME%

**%OPERATOR_AS%** (operator of %PRODUCT_NAME%)  
**Privacy Officer:** Adrien Yvin — %PRIVACY_EMAIL%  
**Last updated:** 5 September 2026

This list is for consulting firms completing a privacy impact assessment or vendor review.

| Processor | Role | Where processing typically occurs | Optional? |
|---|---|---|---|
| Supabase (hosted on AWS) | Database, authentication, file storage | Canada Central — Montréal (`ca-central-1`) | Required |
| Vercel | Application hosting and logs | United States and global edge | Required for hosting |
| Vercel Web Analytics and Speed Insights | Usage and performance metrics | United States | Optional — off until the user consents |
| Resend | Transactional email (confirmations, reminders, manage links) | United States | When email sending is configured |
| Stripe | SaaS billing for the firm’s %PRODUCT_NAME% subscription; consultation payments when the firm connects Stripe | United States | Billing when the firm subscribes; Connect is firm opt-in |
| Google | Staff Google sign-in, optional client portal Google sign-in, Calendar, Meet | United States | Staff or firm opt-in |
| Microsoft | Outlook Calendar, Teams | United States | Staff opt-in |
| Zoom | Meeting join links | United States | Staff opt-in |
| Square | Payments on priced bookings and payment links | United States | Firm opt-in |
| Sage Business Cloud Accounting | Client matching by email, sales tax, invoices | United Kingdom / United States | Firm opt-in |

Primary records (database, auth, stored files) stay in Canada. Application compute, email, billing, and connected calendars, meetings, payments, or accounting may process personal information outside Québec, including the United States (and, for Sage, typically the United Kingdom). %OPERATOR_NAME% has assessed those communications under Law 25 s. 17. Firms that enable a calendar, meeting, payment, or accounting tool instruct us to send the related details to that provider.

%OPERATOR_NAME% personnel who hold the platform wrap key can decrypt firm data in order to operate or restore the service.

Questions: %PRIVACY_EMAIL%
