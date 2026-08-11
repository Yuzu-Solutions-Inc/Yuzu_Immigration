import { redirect } from "next/navigation";

/** Forms management now lives on the project detail page. */
export default async function ProjectFormsPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  redirect(`/${locale}/projects/${id}`);
}
