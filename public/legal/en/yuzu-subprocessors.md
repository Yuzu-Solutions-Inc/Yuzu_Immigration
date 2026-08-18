# Subprocessors — Yuzu Immigration

**Yuzu Solutions Inc.**  
**Privacy Officer:** Adrien Yvin — privacy@yuzu.solutions  
**Last updated:** 17 August 2026

This list is for consulting firms completing a privacy impact assessment or vendor review.

| Processor | Role | Where processing typically occurs | Optional? |
|---|---|---|---|
| Supabase (hosted on AWS) | Database, authentication, file storage | Canada Central — Montréal (`ca-central-1`) | Required |
| Vercel | Application hosting and logs | United States and global edge | Required for hosting |
| Vercel Web Analytics and Speed Insights | Usage and performance metrics | United States | Optional — off until the user consents |
| Resend | Transactional email (confirmations, reminders, manage links) | United States | When email sending is configured |
| Google | Staff Google sign-in, optional client portal Google sign-in, Calendar, Meet | United States | Staff or firm opt-in |
| Microsoft | Outlook Calendar, Teams | United States | Staff opt-in |
| Zoom | Meeting join links | United States | Staff opt-in |
| Square | Payments on priced bookings | United States | Firm opt-in |

Primary records (database, auth, stored files) stay in Canada. Application compute, email, and connected calendars/meetings/payments may process personal information outside Québec, including the United States. Yuzu Solutions Inc. has assessed those communications under Law 25 s. 17. Firms that enable a calendar, meeting, or payment tool instruct us to send the related details to that provider.

Yuzu personnel who hold the platform wrap key can decrypt firm data in order to operate or restore the service.

Questions: privacy@yuzu.solutions
