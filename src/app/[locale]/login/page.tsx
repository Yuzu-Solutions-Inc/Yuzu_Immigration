import { setRequestLocale } from "next-intl/server";

import { LoginForm } from "@/components/auth/login-form";
import { LegalLinks } from "@/components/legal/legal-links";
import { noIndexMetadata } from "@/lib/seo";

export const metadata = noIndexMetadata;

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string; mode?: string; error?: string }>;
}) {
  const { locale } = await params;
  const { next, mode, error } = await searchParams;
  setRequestLocale(locale);
  const initialMode = mode === "signup" ? "signup" : "signin";

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-14">
      <LoginForm
        locale={locale as "en" | "fr" | "es"}
        nextPath={next}
        initialMode={initialMode}
        initialError={error}
      />

      <div className="flex justify-center sm:justify-start">
        <LegalLinks />
      </div>
    </main>
  );
}
