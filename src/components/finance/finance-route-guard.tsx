import { FinanceSessionProvider } from "@/components/finance/finance-session-provider";
import { requireModule } from "@/lib/modules/require-module";

export async function FinanceRouteGuard({
  locale,
  children,
}: {
  locale: string;
  children: React.ReactNode;
}) {
  const membership = await requireModule(locale, "finance");
  return (
    <FinanceSessionProvider
      orgId={membership.organization.id}
      role={membership.role}
    >
      {children}
    </FinanceSessionProvider>
  );
}
