import { redirect } from "next/navigation";

export default async function EngagementsIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/engagements/projects`);
}
