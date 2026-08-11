import { defineRouting } from "next-intl/routing";

import { APP_LOCALES } from "@/lib/i18n/locales";

export const routing = defineRouting({
  locales: [...APP_LOCALES],
  defaultLocale: "en",
  localePrefix: "always",
});
