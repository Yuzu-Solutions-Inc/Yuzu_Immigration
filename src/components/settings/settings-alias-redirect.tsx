"use client";

import { useEffect } from "react";

import { useRouter } from "@/i18n/navigation";

export function SettingsAliasRedirect({ href }: { href: string }) {
  const router = useRouter();

  useEffect(() => {
    router.replace(href);
  }, [href, router]);

  return (
    <p className="text-sm text-muted-foreground">Redirecting…</p>
  );
}
