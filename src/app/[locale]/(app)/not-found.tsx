import { getTranslations } from "next-intl/server";

import { NotFoundView } from "@/components/status/not-found-view";

export async function generateMetadata() {
  const t = await getTranslations("statusPages");
  return { title: t("notFoundTitle") };
}

export default function AppNotFound() {
  return <NotFoundView homeHref="/home" />;
}
