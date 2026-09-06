"use client";

import type { ReactNode } from "react";
import { usePathname } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function NavLink({
  href,
  className,
  end,
  children,
}: {
  href: string;
  className?: string | ((args: { isActive: boolean }) => string);
  end?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const active = end
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
  const resolved =
    typeof className === "function" ? className({ isActive: active }) : className;
  return (
    <Link href={href} className={cn(resolved)}>
      {children}
    </Link>
  );
}
