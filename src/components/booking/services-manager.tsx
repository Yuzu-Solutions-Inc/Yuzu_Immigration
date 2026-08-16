"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useActionState, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  createServiceAction,
  deleteServiceAction,
  updateServiceAction,
  type ServiceActionState,
} from "@/app/actions/services";
import { SurfaceCard } from "@/components/layout/surface-card";
import { ServiceBookingFormButton } from "@/components/booking/service-booking-form";
import { ServiceEmailAutomationsButton } from "@/components/booking/service-email-automations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  parseServiceTranslations,
  serviceCopy,
  type ServiceLocaleCopy,
} from "@/lib/booking/service-i18n";
import type {
  BookingFormFieldRow,
  BookingFormRow,
  BookingServiceRow,
  ServiceEmailAutomationRow,
} from "@/lib/booking/types";
import {
  APP_LOCALES,
  LOCALE_LABELS,
  type AppLocale,
} from "@/lib/i18n/locales";
import { centsToPriceInput, formatPriceCents } from "@/lib/booking/slots";
import { cn } from "@/lib/utils";

const initialState: ServiceActionState = {};

type ActiveFilter = "all" | "active" | "inactive";
type FormFilter = "all" | "has_form" | "no_form";
type PriceFilter = "all" | "free" | "paid";
type SortKey =
  | "sort_order"
  | "title"
  | "duration"
  | "price"
  | "created_at"
  | "is_active";
type SortDir = "asc" | "desc";

const headerControlClassName =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-surface px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-60";

const EMPTY_COPY: ServiceLocaleCopy = { title: "", description: "" };

function emptyCopies(): Record<AppLocale, ServiceLocaleCopy> {
  return {
    en: { ...EMPTY_COPY },
    fr: { ...EMPTY_COPY },
    es: { ...EMPTY_COPY },
  };
}

function initialCopies(
  service: BookingServiceRow | undefined,
  orgDefaultLocale: AppLocale,
) {
  const copies = emptyCopies();
  if (!service) return copies;
  const translations = parseServiceTranslations(service.translations);
  let any = false;
  for (const code of APP_LOCALES) {
    if (translations[code]?.title) {
      copies[code] = {
        title: translations[code]!.title,
        description: translations[code]!.description,
      };
      any = true;
    }
  }
  if (!any) {
    copies[orgDefaultLocale] = {
      title: service.title,
      description: service.description ?? "",
    };
  } else if (!copies[orgDefaultLocale].title && service.title) {
    copies[orgDefaultLocale] = {
      title: service.title,
      description: service.description ?? "",
    };
  }
  return copies;
}

function ServiceFormFields({
  locale,
  orgDefaultLocale,
  service,
}: {
  locale: string;
  orgDefaultLocale: AppLocale;
  service?: BookingServiceRow;
}) {
  const t = useTranslations("services");
  const [copies, setCopies] = useState(() =>
    initialCopies(service, orgDefaultLocale),
  );

  return (
    <>
      <input type="hidden" name="locale" value={locale} />
      {service ? <input type="hidden" name="serviceId" value={service.id} /> : null}
      <input type="hidden" name="translations" value={JSON.stringify(copies)} />

      <div className="space-y-2">
        <p className="text-sm font-medium">{t("copyLabel")}</p>
        <p className="text-xs text-muted-foreground">
          {t("copyHelp", { language: LOCALE_LABELS[orgDefaultLocale] })}
        </p>
        <Tabs defaultValue={orgDefaultLocale}>
          <TabsList variant="line" className="w-full">
            {APP_LOCALES.map((code) => (
              <TabsTrigger key={code} value={code}>
                {LOCALE_LABELS[code]}
                {code === orgDefaultLocale ? (
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {t("automationDefaultLang")}
                  </span>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
          {APP_LOCALES.map((code) => (
            <TabsContent key={code} value={code} keepMounted className="space-y-3 pt-3">
              <div className="space-y-2">
                <Label htmlFor={`title-${code}`}>
                  {t("titleLabel")}
                  {code === orgDefaultLocale ? " *" : ""}
                </Label>
                <Input
                  id={`title-${code}`}
                  required={code === orgDefaultLocale}
                  maxLength={120}
                  value={copies[code].title}
                  onChange={(event) =>
                    setCopies((prev) => ({
                      ...prev,
                      [code]: { ...prev[code], title: event.target.value },
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`description-${code}`}>{t("description")}</Label>
                <Textarea
                  id={`description-${code}`}
                  rows={3}
                  maxLength={2000}
                  value={copies[code].description}
                  onChange={(event) =>
                    setCopies((prev) => ({
                      ...prev,
                      [code]: {
                        ...prev[code],
                        description: event.target.value,
                      },
                    }))
                  }
                />
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="durationMinutes">{t("duration")}</Label>
          <Input
            id="durationMinutes"
            name="durationMinutes"
            type="number"
            min={5}
            max={480}
            step={5}
            defaultValue={service?.duration_minutes ?? 30}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="price">{t("price")}</Label>
          <Input
            id="price"
            name="price"
            inputMode="decimal"
            defaultValue={centsToPriceInput(service?.price_cents ?? 0)}
            required
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={service?.is_active ?? true}
          className="size-4 rounded border-input"
        />
        {t("active")}
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="allowPayLater"
          defaultChecked={service?.allow_pay_later ?? false}
          className="mt-0.5 size-4 rounded border-input"
        />
        <span>
          <span className="font-medium text-brand">{t("allowPayLater")}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {t("allowPayLaterHelp")}
          </span>
        </span>
      </label>
      <div className="space-y-2">
        <Label htmlFor="paymentReminderDays">{t("paymentReminders")}</Label>
        <Input
          id="paymentReminderDays"
          name="paymentReminderDays"
          placeholder={t("paymentRemindersPlaceholder")}
          defaultValue={(service?.payment_reminder_days ?? []).join(", ")}
        />
        <p className="text-xs text-muted-foreground">{t("paymentRemindersHelp")}</p>
      </div>
    </>
  );
}

export function ServicesManager({
  locale,
  orgDefaultLocale,
  canManage,
  services,
  forms,
  automations,
  formFields,
}: {
  locale: string;
  orgDefaultLocale: AppLocale;
  canManage: boolean;
  services: BookingServiceRow[];
  forms: BookingFormRow[];
  automations: ServiceEmailAutomationRow[];
  formFields: BookingFormFieldRow[];
}) {
  const t = useTranslations("services");
  const router = useRouter();
  const formById = new Map(forms.map((form) => [form.id, form]));
  const reminderCountByService = new Map<string, number>();
  for (const automation of automations) {
    for (const serviceId of automation.service_ids) {
      reminderCountByService.set(
        serviceId,
        (reminderCountByService.get(serviceId) ?? 0) + 1,
      );
    }
  }
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<BookingServiceRow | null>(null);
  const [titleQuery, setTitleQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [formFilter, setFormFilter] = useState<FormFilter>("all");
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("sort_order");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const deferredTitle = useDeferredValue(titleQuery);
  const [createState, createAction, createPending] = useActionState(
    createServiceAction,
    initialState,
  );
  const [updateState, updateAction, updatePending] = useActionState(
    updateServiceAction,
    initialState,
  );

  useEffect(() => {
    if (createState.message === "created") {
      toast.success(t("created"));
      setCreateOpen(false);
    }
    if (createState.error) toast.error(t(`errors.${createState.error}`));
  }, [createState, t]);

  useEffect(() => {
    if (updateState.message === "saved") {
      toast.success(t("saved"));
      setEditing(null);
    }
    if (updateState.error) toast.error(t(`errors.${updateState.error}`));
  }, [updateState, t]);

  const filteredSorted = useMemo(() => {
    const titleQ = deferredTitle.trim().toLowerCase();

    const rows = services.filter((service) => {
      const copy = serviceCopy(service, locale, orgDefaultLocale);
      if (titleQ && !copy.title.toLowerCase().includes(titleQ)) return false;
      if (activeFilter === "active" && !service.is_active) return false;
      if (activeFilter === "inactive" && service.is_active) return false;
      if (formFilter === "has_form" && !service.form_id) return false;
      if (formFilter === "no_form" && service.form_id) return false;
      if (priceFilter === "free" && service.price_cents !== 0) return false;
      if (priceFilter === "paid" && service.price_cents === 0) return false;
      return true;
    });

    rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "sort_order") {
        cmp = a.sort_order - b.sort_order;
        if (cmp === 0) {
          cmp = a.created_at.localeCompare(b.created_at);
        }
      } else if (sortKey === "title") {
        cmp = serviceCopy(a, locale, orgDefaultLocale).title.localeCompare(
          serviceCopy(b, locale, orgDefaultLocale).title,
          undefined,
          { sensitivity: "base" },
        );
      } else if (sortKey === "duration") {
        cmp = a.duration_minutes - b.duration_minutes;
      } else if (sortKey === "price") {
        cmp = a.price_cents - b.price_cents;
      } else if (sortKey === "created_at") {
        cmp = a.created_at.localeCompare(b.created_at);
      } else {
        cmp = Number(b.is_active) - Number(a.is_active);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return rows;
  }, [
    services,
    deferredTitle,
    activeFilter,
    formFilter,
    priceFilter,
    sortKey,
    sortDir,
    locale,
    orgDefaultLocale,
  ]);

  const filtersActive = Boolean(
    titleQuery.trim() ||
      activeFilter !== "all" ||
      formFilter !== "all" ||
      priceFilter !== "all",
  );

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "sort_order" || key === "title" ? "asc" : "desc");
  }

  function SortButton({
    column,
    label,
  }: {
    column: SortKey;
    label: string;
  }) {
    const active = sortKey === column;
    const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
    return (
      <button
        type="button"
        onClick={() => toggleSort(column)}
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-0.5 py-0.5 text-left font-medium transition-colors",
          "hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
          active ? "text-brand" : "text-foreground",
        )}
      >
        {label}
        <Icon className="size-3.5 shrink-0 opacity-70" aria-hidden />
      </button>
    );
  }

  function clearFilters() {
    setTitleQuery("");
    setActiveFilter("all");
    setFormFilter("all");
    setPriceFilter("all");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold text-brand">
            {t("title")}
          </h1>
          <p className="text-[15px] text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ServiceBookingFormButton
            locale={locale}
            services={services}
            forms={forms}
            formFields={formFields}
            canManage={canManage}
          />
          <ServiceEmailAutomationsButton
            locale={locale}
            orgDefaultLocale={orgDefaultLocale}
            services={services}
            formFields={formFields}
            automations={automations}
            canManage={canManage}
          />
          {canManage ? (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              {t("new")}
            </Button>
          ) : null}
        </div>
      </div>

      {services.length === 0 ? (
        <SurfaceCard className="space-y-3">
          <p className="text-[15px] text-muted-foreground">{t("empty")}</p>
          {canManage ? (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              {t("new")}
            </Button>
          ) : null}
        </SurfaceCard>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-2 rounded-xl border border-border bg-surface p-3 shadow-elevated md:hidden">
            <Input
              type="search"
              value={titleQuery}
              onChange={(e) => setTitleQuery(e.target.value)}
              placeholder={t("filterTitlePlaceholder")}
              aria-label={t("filterTitle")}
              className="h-10"
            />
            <select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value as ActiveFilter)}
              aria-label={t("filterActive")}
              className={cn(headerControlClassName, "h-10")}
            >
              <option value="all">{t("filterAll")}</option>
              <option value="active">{t("active")}</option>
              <option value="inactive">{t("inactive")}</option>
            </select>
            <select
              value={formFilter}
              onChange={(e) => setFormFilter(e.target.value as FormFilter)}
              aria-label={t("filterForm")}
              className={cn(headerControlClassName, "h-10")}
            >
              <option value="all">{t("filterAll")}</option>
              <option value="has_form">{t("filterFormAssigned")}</option>
              <option value="no_form">{t("filterFormNone")}</option>
            </select>
            <select
              value={priceFilter}
              onChange={(e) => setPriceFilter(e.target.value as PriceFilter)}
              aria-label={t("filterPrice")}
              className={cn(headerControlClassName, "h-10")}
            >
              <option value="all">{t("filterAll")}</option>
              <option value="free">{t("filterPriceFree")}</option>
              <option value="paid">{t("filterPricePaid")}</option>
            </select>
          </div>

          <SurfaceCard className="overflow-hidden p-0 sm:p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-auto min-w-[12rem] py-2.5 align-bottom">
                    <div className="flex flex-col gap-1.5">
                      <SortButton column="title" label={t("titleLabel")} />
                      <Input
                        type="search"
                        value={titleQuery}
                        onChange={(e) => setTitleQuery(e.target.value)}
                        placeholder={t("filterTitlePlaceholder")}
                        aria-label={t("filterTitle")}
                        className={headerControlClassName}
                      />
                    </div>
                  </TableHead>
                  <TableHead className="h-auto min-w-[7rem] py-2.5 align-bottom">
                    <SortButton column="duration" label={t("duration")} />
                  </TableHead>
                  <TableHead className="h-auto min-w-[7rem] py-2.5 align-bottom">
                    <div className="flex flex-col gap-1.5">
                      <SortButton column="price" label={t("price")} />
                      <select
                        value={priceFilter}
                        onChange={(e) =>
                          setPriceFilter(e.target.value as PriceFilter)
                        }
                        aria-label={t("filterPrice")}
                        className={headerControlClassName}
                      >
                        <option value="all">{t("filterAll")}</option>
                        <option value="free">{t("filterPriceFree")}</option>
                        <option value="paid">{t("filterPricePaid")}</option>
                      </select>
                    </div>
                  </TableHead>
                  <TableHead className="h-auto min-w-[9rem] py-2.5 align-bottom">
                    <div className="flex flex-col gap-1.5">
                      <span className="font-medium">{t("columnForm")}</span>
                      <select
                        value={formFilter}
                        onChange={(e) =>
                          setFormFilter(e.target.value as FormFilter)
                        }
                        aria-label={t("filterForm")}
                        className={headerControlClassName}
                      >
                        <option value="all">{t("filterAll")}</option>
                        <option value="has_form">{t("filterFormAssigned")}</option>
                        <option value="no_form">{t("filterFormNone")}</option>
                      </select>
                    </div>
                  </TableHead>
                  <TableHead className="h-auto min-w-[7rem] py-2.5 align-bottom">
                    {t("columnReminders")}
                  </TableHead>
                  <TableHead className="h-auto min-w-[7rem] py-2.5 align-bottom">
                    <div className="flex flex-col gap-1.5">
                      <SortButton column="is_active" label={t("active")} />
                      <select
                        value={activeFilter}
                        onChange={(e) =>
                          setActiveFilter(e.target.value as ActiveFilter)
                        }
                        aria-label={t("filterActive")}
                        className={headerControlClassName}
                      >
                        <option value="all">{t("filterAll")}</option>
                        <option value="active">{t("active")}</option>
                        <option value="inactive">{t("inactive")}</option>
                      </select>
                    </div>
                  </TableHead>
                  {canManage ? (
                    <TableHead className="h-auto py-2.5 align-bottom text-right">
                      {t("actions")}
                    </TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSorted.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={canManage ? 7 : 6}
                      className="px-5 py-8 text-center whitespace-normal text-[15px] text-muted-foreground"
                    >
                      {t("noMatches")}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSorted.map((service) => {
                const copy = serviceCopy(service, locale, orgDefaultLocale);
                return (
                <TableRow key={service.id}>
                  <TableCell>
                    <p className="font-medium text-brand">{copy.title}</p>
                    {copy.description ? (
                      <p className="max-w-md truncate text-xs text-muted-foreground">
                        {copy.description}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {t("durationMinutes", { minutes: service.duration_minutes })}
                  </TableCell>
                  <TableCell>
                    {formatPriceCents(
                      service.price_cents,
                      locale,
                      service.currency,
                    )}
                  </TableCell>
                  <TableCell>
                    {service.form_id
                      ? (formById.get(service.form_id)?.title ?? t("noneAssigned"))
                      : t("noneAssigned")}
                  </TableCell>
                  <TableCell>
                    {t("remindersCount", {
                      count: reminderCountByService.get(service.id) ?? 0,
                    })}
                  </TableCell>
                  <TableCell>
                    <Badge variant={service.is_active ? "default" : "secondary"}>
                      {service.is_active ? t("active") : t("inactive")}
                    </Badge>
                  </TableCell>
                  {canManage ? (
                    <TableCell className="text-right">
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setEditing(service)}
                        >
                          <Pencil className="size-4" />
                          {t("edit")}
                        </Button>
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
                );
              })
                )}
              </TableBody>
            </Table>
          </SurfaceCard>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {t("showingCount", {
                shown: filteredSorted.length,
                total: services.length,
              })}
            </p>
            {filtersActive ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={clearFilters}
              >
                {t("clearFilters")}
              </Button>
            ) : null}
          </div>
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg" showCloseButton>
          <DialogHeader>
            <DialogTitle>{t("createTitle")}</DialogTitle>
            <DialogDescription>{t("createSubtitle")}</DialogDescription>
          </DialogHeader>
          <form action={createAction} className="space-y-4">
            <ServiceFormFields
              key={createOpen ? "open" : "closed"}
              locale={locale}
              orgDefaultLocale={orgDefaultLocale}
            />
            <DialogFooter>
              <Button type="submit" disabled={createPending}>
                {createPending ? t("saving") : t("create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="sm:max-w-lg" showCloseButton>
          <DialogHeader>
            <div className="flex items-start gap-3 pr-8">
              <div className="min-w-0 flex-1 space-y-2">
                <DialogTitle>{t("editTitle")}</DialogTitle>
                <DialogDescription>{t("editSubtitle")}</DialogDescription>
              </div>
              {canManage && editing ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label={t("delete")}
                  title={t("delete")}
                  onClick={async () => {
                    if (!window.confirm(t("deleteConfirm"))) return;
                    const result = await deleteServiceAction(editing.id, locale);
                    if (result.error) {
                      toast.error(t(`errors.${result.error}`));
                      return;
                    }
                    if (result.message === "archived") {
                      toast.success(t("archived"));
                    } else {
                      toast.success(t("deleted"));
                    }
                    setEditing(null);
                    router.refresh();
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              ) : null}
            </div>
          </DialogHeader>
          {editing ? (
            <form action={updateAction} className="space-y-4">
              <ServiceFormFields
                key={editing.id}
                locale={locale}
                orgDefaultLocale={orgDefaultLocale}
                service={editing}
              />
              <DialogFooter>
                <Button type="submit" disabled={updatePending}>
                  {updatePending ? t("saving") : t("save")}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
