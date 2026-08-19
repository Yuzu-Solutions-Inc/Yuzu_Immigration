import { getTranslations, setRequestLocale } from "next-intl/server";

import { DocumentReviewScreen } from "@/components/documents/document-review-screen";
import { SurfaceCard } from "@/components/layout/surface-card";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { listDocumentsToReview } from "@/lib/documents/review-queue";
import { cn } from "@/lib/utils";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function ReviewDocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ project?: string }>;
}) {
  const { locale } = await params;
  const { project } = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations("documents");
  const items = await listDocumentsToReview();
  const projectId = project && UUID_RE.test(project) ? project : null;
  const startIndex = projectId
    ? Math.max(
        0,
        items.findIndex((item) => item.projectId === projectId),
      )
    : 0;

  if (items.length === 0) {
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold text-brand">
            {t("review.queueTitle")}
          </h1>
          <p className="text-[15px] text-muted-foreground">
            {t("review.queueHelp")}
          </p>
        </div>
        <SurfaceCard className="space-y-3">
          <p className="text-[15px] text-muted-foreground">
            {t("review.queueEmpty")}
          </p>
          <Link
            href="/home"
            className={cn(buttonVariants({ size: "sm" }))}
          >
            {t("review.queueEmptyCta")}
          </Link>
        </SurfaceCard>
      </div>
    );
  }

  return (
    <DocumentReviewScreen
      items={items}
      startIndex={startIndex}
      locale={locale}
    />
  );
}
