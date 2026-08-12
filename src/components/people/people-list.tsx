"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { DeletePersonButton } from "@/components/people/delete-person-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";

type PersonListItem = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
};

export function PeopleList({
  locale,
  people,
}: {
  locale: string;
  people: PersonListItem[];
}) {
  const t = useTranslations("people");
  const [nameQuery, setNameQuery] = useState("");
  const [emailQuery, setEmailQuery] = useState("");
  const deferredName = useDeferredValue(nameQuery);
  const deferredEmail = useDeferredValue(emailQuery);

  const filtered = useMemo(() => {
    const nameQ = deferredName.trim().toLowerCase();
    const emailQ = deferredEmail.trim().toLowerCase();

    return people.filter((person) => {
      if (nameQ) {
        const fullName = `${person.first_name} ${person.last_name}`.toLowerCase();
        if (!fullName.includes(nameQ)) return false;
      }
      if (emailQ) {
        if (!(person.email ?? "").toLowerCase().includes(emailQ)) return false;
      }
      return true;
    });
  }, [people, deferredName, deferredEmail]);

  const filtersActive = Boolean(nameQuery.trim() || emailQuery.trim());

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3 shadow-elevated sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-[12rem] flex-1 space-y-1.5">
          <Label htmlFor="people-filter-name">{t("filterName")}</Label>
          <Input
            id="people-filter-name"
            type="search"
            value={nameQuery}
            onChange={(e) => setNameQuery(e.target.value)}
            placeholder={t("filterNamePlaceholder")}
            className="h-8 rounded-lg px-2 text-sm"
          />
        </div>
        <div className="min-w-[12rem] flex-1 space-y-1.5">
          <Label htmlFor="people-filter-email">{t("filterEmail")}</Label>
          <Input
            id="people-filter-email"
            type="search"
            value={emailQuery}
            onChange={(e) => setEmailQuery(e.target.value)}
            placeholder={t("filterEmailPlaceholder")}
            className="h-8 rounded-lg px-2 text-sm"
          />
        </div>
        {filtersActive ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setNameQuery("");
              setEmailQuery("");
            }}
          >
            {t("clearFilters")}
          </Button>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface px-5 py-8 text-center text-[15px] text-muted-foreground shadow-elevated">
          {t("noMatches")}
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-elevated">
          {filtered.map((person) => {
            const fullName = `${person.first_name} ${person.last_name}`;
            return (
              <li
                key={person.id}
                className="group flex items-center gap-3 px-5 py-4"
              >
                <Link
                  href={`/people/${person.id}`}
                  className="min-w-0 flex-1 transition-colors hover:opacity-80"
                >
                  <p className="font-medium text-brand">{fullName}</p>
                  {person.email ? (
                    <p className="text-sm text-muted-foreground">
                      {person.email}
                    </p>
                  ) : null}
                </Link>
                <DeletePersonButton
                  locale={locale}
                  personId={person.id}
                  fullName={fullName}
                  className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100"
                />
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-sm text-muted-foreground">
        {t("showingCount", {
          shown: filtered.length,
          total: people.length,
        })}
      </p>
    </div>
  );
}
