#!/usr/bin/env python3
"""Copy Finance Vite UI into Dossierly with import/i18n/router rewrites."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path("/Users/adrienyvin/YUZU Solutions Inc/yuzu_crm")
SRC = ROOT / "app-legacy/app/src"
DST_UI = ROOT / "src/components/finance"
DST_HOOKS = ROOT / "src/components/finance/hooks"
DST_CTX = ROOT / "src/components/finance/contexts"
DST_PAGES = ROOT / "src/components/finance/screens"

CLASS_REPLACEMENTS = [
    ("bg-yuzu-light", "bg-action/10"),
    ("text-yuzu-dark", "text-brand"),
    ("hover:border-yuzu/40", "hover:border-ring/40"),
    ("focus-visible:ring-yuzu/40", "focus-visible:ring-ring/40"),
    ("border-yuzu", "border-ring"),
    ("bg-yuzu", "bg-action"),
    ("text-yuzu", "text-action"),
    ("text-ink", "text-foreground"),
    ("text-muted", "text-muted-foreground"),
    ("bg-white", "bg-surface"),
    ("bg-stone-50", "bg-muted"),
    ("bg-stone-100", "bg-muted"),
    ("hover:bg-stone-50", "hover:bg-muted"),
    ("hover:bg-stone-100", "hover:bg-muted"),
    ("hover:text-ink", "hover:text-foreground"),
    ("bg-ink/40", "bg-foreground/40"),
]


def restyle(text: str) -> str:
    for old, new in CLASS_REPLACEMENTS:
        text = text.replace(old, new)
    return text


def rewrite_imports(text: str) -> str:
    text = text.replace("from '../lib/", "from '@/lib/finance/")
    text = text.replace('from "../lib/', 'from "@/lib/finance/')
    text = text.replace("from './lib/", "from '@/lib/finance/")
    text = text.replace("from '../hooks/", "from '@/components/finance/hooks/")
    text = text.replace("from '../contexts/", "from '@/components/finance/contexts/")
    text = text.replace("from '../components/", "from '@/components/finance/")
    text = text.replace("from './", "from '@/components/finance/")
    # restore relative self-imports that should stay in the same folder for screens? handled per file
    return text


def rewrite_i18n(text: str) -> str:
    text = text.replace("from 'react-i18next'", "from 'next-intl'")
    text = text.replace('from "react-i18next"', "from 'next-intl'")
    text = text.replace("const { t } = useTranslation()", "const t = useTranslations('financeApp')")
    text = text.replace("const { t, i18n } = useTranslation()", "const t = useTranslations('financeApp')")
    return text


def rewrite_router(text: str) -> str:
    text = re.sub(
        r"import \{([^}]+)\} from 'react-router-dom'",
        lambda m: router_import(m.group(1)),
        text,
    )
    text = text.replace("<Link to=", "<Link href=")
    text = text.replace("<NavLink to=", "<NavLink href=")
    text = text.replace("navigate(", "router.push(")
    text = text.replace("const navigate = useNavigate()", "const router = useRouter()")
    text = text.replace("const location = useLocation()", "const pathname = usePathname()")
    text = text.replace("location.pathname", "pathname")
    text = text.replace("useOutletContext<", "useFinanceOutlet<")
    text = text.replace("useOutletContext()", "useFinanceOutlet()")
    text = text.replace("<Outlet context={{ refreshMetrics: loadMetrics }} />", "{children}")
    text = text.replace("<Outlet />", "{children}")
    return text


def router_import(inner: str) -> str:
    names = [p.strip() for p in inner.split(",") if p.strip()]
    next_names: list[str] = []
    extra_nav = False
    extra_outlet = False
    for name in names:
        if name == "Link":
            next_names.append("Link")
        elif name == "NavLink":
            extra_nav = True
        elif name == "useNavigate":
            next_names.append("useRouter")
        elif name == "useLocation":
            next_names.append("usePathname")
        elif name == "useOutletContext":
            extra_outlet = True
        elif name in {"Outlet", "Navigate", "useParams", "useSearchParams"}:
            continue
    parts: list[str] = []
    if next_names:
        uniq: list[str] = []
        for n in next_names:
            if n not in uniq:
                uniq.append(n)
        parts.append("import { " + ", ".join(uniq) + " } from '@/i18n/navigation'")
    if extra_nav:
        parts.append("import { NavLink } from '@/components/finance/nav-link'")
    if extra_outlet:
        parts.append("import { useFinanceOutlet } from '@/components/finance/finance-outlet'")
    if not parts:
        return ""
    return "\n".join(parts)


def ensure_client(text: str) -> str:
    if text.lstrip().startswith('"use client"') or text.lstrip().startswith("'use client'"):
        return text
    return "'use client'\n\n" + text


def transform_ts(text: str, is_screen: bool) -> str:
    text = rewrite_i18n(text)
    text = rewrite_router(text)
    if is_screen:
        text = text.replace("from '@/components/finance/", "from '@/components/finance/")
        # screens originally used ../components and ../lib — rewrite_imports handles from source
    text = restyle(text)
    text = ensure_client(text)
    return text


def copy_transformed(src: Path, dest: Path, is_screen: bool, extra_replace: list[tuple[str, str]] | None = None):
    text = src.read_text()
    if is_screen:
        text = text.replace("from '../lib/", "from '@/lib/finance/")
        text = text.replace("from '../hooks/", "from '@/components/finance/hooks/")
        text = text.replace("from '../contexts/", "from '@/components/finance/contexts/")
        text = text.replace("from '../components/", "from '@/components/finance/")
    else:
        text = text.replace("from '../lib/", "from '@/lib/finance/")
        text = text.replace("from '../hooks/", "from '@/components/finance/hooks/")
        text = text.replace("from '../contexts/", "from '@/components/finance/contexts/")
        # keep same-folder component imports relative
        text = re.sub(r"from '\.\./components/([^']+)'", r"from '@/components/finance/\1'", text)
    text = transform_ts(text, is_screen)
    if extra_replace:
        for old, new in extra_replace:
            text = text.replace(old, new)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(text)


COMPONENT_FILES = [
    "BillingWorkflowNav.tsx",
    "CompensationWorkflowNav.tsx",
    "ColumnFilters.tsx",
    "DashboardCharts.tsx",
    "DataTable.tsx",
    "DocumentAttachments.tsx",
    "EmptyState.tsx",
    "ExecutiveBreakdownPanel.tsx",
    "FinancialStatements.tsx",
    "HubCard.tsx",
    "ListToolbar.tsx",
    "MetricCard.tsx",
    "NumberInput.tsx",
    "PageHeader.tsx",
    "PageShell.tsx",
    "ReceiptScanField.tsx",
    "UpcomingDeadlinesCard.tsx",
    "WorkflowFooter.tsx",
    "WorkflowNav.tsx",
    "icons.tsx",
]

SCREEN_FILES = [
    "AdjustmentsPage.tsx",
    "BackupPage.tsx",
    "BankPage.tsx",
    "BillingPage.tsx",
    "CompensationPage.tsx",
    "CompliancePage.tsx",
    "CorporateTaxPage.tsx",
    "DashboardDetailsPage.tsx",
    "DividendsPage.tsx",
    "EmployeeExpensesPage.tsx",
    "EmployeesPage.tsx",
    "ExecutiveDashboardPage.tsx",
    "FinancialReportsPage.tsx",
    "GeneralLedgerPage.tsx",
    "InvoicesPage.tsx",
    "OtherHubPage.tsx",
    "PartnersPage.tsx",
    "PayrollPage.tsx",
    "PeriodClosePage.tsx",
    "PipelinePage.tsx",
    "ProjectsPage.tsx",
    "SalesTaxPage.tsx",
    "SettingsPage.tsx",
    "ShareholdersPage.tsx",
    "TaxExportsPage.tsx",
    "TimePage.tsx",
]


def merge_i18n():
    for locale, fallback in (("en", "en"), ("fr", "fr"), ("es", "en")):
        dest = ROOT / f"messages/{locale}.json"
        data = json.loads(dest.read_text())
        src = json.loads((SRC / "messages" / f"{fallback}.json").read_text())

        def convert(obj):
            if isinstance(obj, str):
                return re.sub(r"\{\{(\w+)\}\}", r"{\1}", obj).replace("Yuzu Finance", "Dossierly Finance")
            if isinstance(obj, dict):
                return {k: convert(v) for k, v in obj.items()}
            if isinstance(obj, list):
                return [convert(v) for v in obj]
            return obj

        data["financeApp"] = convert(src)
        dest.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def main():
    merge_i18n()
    for name in COMPONENT_FILES:
        copy_transformed(SRC / "components" / name, DST_UI / name, is_screen=False)
    for name in SCREEN_FILES:
        copy_transformed(SRC / "pages" / name, DST_PAGES / name, is_screen=True)
    copy_transformed(SRC / "hooks/useDashboardPeriod.ts", DST_HOOKS / "useDashboardPeriod.ts", is_screen=False)
    copy_transformed(SRC / "hooks/useFiscalPeriodCloses.ts", DST_HOOKS / "useFiscalPeriodCloses.ts", is_screen=False)
    copy_transformed(SRC / "contexts/AmountPrivacyContext.tsx", DST_CTX / "AmountPrivacyContext.tsx", is_screen=False)
    copy_transformed(SRC / "contexts/PeriodCloseContext.tsx", DST_CTX / "PeriodCloseContext.tsx", is_screen=False)
    print("copied finance UI")


if __name__ == "__main__":
    main()
