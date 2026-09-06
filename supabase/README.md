# Supabase (MyConsultant)

Canonical project: `cezwtrsleuubrfmbhosn` (ca-central-1).

## extract-receipt

Finance screens upload a receipt to the `documents` bucket inbox, then invoke this Edge Function to pre-fill vendor, date, and TPS/TVQ amounts via Gemini.

```bash
npx supabase functions deploy extract-receipt --project-ref cezwtrsleuubrfmbhosn
npx supabase secrets set GEMINI_API_KEY=your_key --project-ref cezwtrsleuubrfmbhosn
```

Optional: `GEMINI_MODEL` (defaults to `gemini-flash-latest`). JWT verification stays on — the browser sends the user session.
