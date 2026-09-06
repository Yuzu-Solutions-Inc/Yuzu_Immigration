import { redirect } from "next/navigation";

export default async function CompensationIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/compensation/payroll`);
}
