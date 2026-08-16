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
import {
  ListTableCard,
  listMobileFiltersClassName,
  listStackClassName,
  listTableEdgeEndClassName,
  listTableEdgeStartClassName,
  listTableEmptyCellClassName,
  listTableHeadClassName,
} from "@/components/layout/list-layout";
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
import { Field, FieldGrid, FieldHint, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { cn, shouldIgnoreRowClick } from "@/lib/utils";

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
  isActive,
  onIsActiveChange,
  allowPayLater,
  onAllowPayLaterChange,
  showActiveToggle = true,
}: {
  locale: string;
  orgDefaultLocale: AppLocale;
  service?: BookingServiceRow;
  isActive: boolean;
  onIsActiveChange: (value: boolean) => void;
  allowPayLater: boolean;
  onAllowPayLaterChange: (value: boolean) => void;
  showActiveToggle?: boolean;
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
      <input type="hidden" name="isActive" value={isActive ? "on" : ""} />
      <input
        type="hidden"
        name="allowPayLater"
        value={allowPayLater ? "on" : ""}
      />

      <div className="space-y-4">
        <section className="space-y-3 rounded-xl border border-border bg-canvas/60 p-4">
          <div>
            <h3 className="text-sm font-semibold text-brand">{t("copyLabel")}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("copyHelp", { language: LOCALE_LABELS[orgDefaultLocale] })}
            </p>
          </div>
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
              <TabsContent
                key={code}
                value={code}
                keepMounted
                className="space-y-3 pt-3"
              >
                <Field>
                  <FieldLabel
                    htmlFor={`title-${code}`}
                    required={code === orgDefaultLocale}
                  >
                    {t("titleLabel")}
                  </FieldLabel>
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
                </Field>
                <Field>
                  <FieldLabel htmlFor={`description-${code}`}>
                    {t("description")}
                  </FieldLabel>
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
                </Field>
              </TabsContent>
            ))}
          </Tabs>
        </section>

        <section className="space-y-3 rounded-xl border border-border bg-canvas/60 p-4">
          <h3 className="text-sm font-semibold text-brand">
            {t("serviceDetailsSection")}
          </h3>
          <FieldGrid>
            <Field>
              <FieldLabel htmlFor="durationMinutes" required>
                {t("duration")}
              </FieldLabel>
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
            </Field>
            <Field>
              <FieldLabel htmlFor="price" required>
                {t("price")}
              </FieldLabel>
              <Input
                id="price"
                name="price"
                inputMode="decimal"
                defaultValue={centsToPriceInput(service?.price_cents ?? 0)}
                required
              />
            </Field>
          </FieldGrid>
        </section>

        <section className="space-y-3 rounded-xl border border-border bg-canvas/60 p-4">
          <h3 className="text-sm font-semibold text-brand">
            {t("serviceOptionsSection")}
          </h3>
          <div className="space-y-2">
            {showActiveToggle ? (
              <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface px-4 py-3">
                <div className="min-w-0 space-y-0.5">
                  <Label
                    htmlFor="service-is-active"
                    className="text-sm font-medium"
                  >
                    {t("active")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t("activeHelp")}
                  </p>
                </div>
                <Switch
                  id="service-is-active"
                  checked={isActive}
                  onCheckedChange={onIsActiveChange}
                />
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface px-4 py-3">
              <div className="min-w-0 space-y-0.5">
                <Label htmlFor="service-pay-later" className="text-sm font-medium">
                  {t("allowPayLater")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("allowPayLaterHelp")}
                </p>
              </div>
              <Switch
                id="service-pay-later"
                checked={allowPayLater}
                onCheckedChange={onAllowPayLaterChange}
              />
            </div>
          </div>
          {allowPayLater ? (
            <Field className="border-t border-border pt-3">
              <FieldLabel htmlFor="paymentReminderDays">
                {t("paymentReminders")}
              </FieldLabel>
              <Input
                id="paymentReminderDays"
                name="paymentReminderDays"
                placeholder={t("paymentRemindersPlaceholder")}
                defaultValue={(service?.payment_reminder_days ?? []).join(", ")}
              />
              <FieldHint>{t("paymentRemindersHelp")}</FieldHint>
            </Field>
          ) : null}
        </section>
      </div>
    </>
  );
}

function ServiceFormDialog({
  open,
  onOpenChange,
  mode,
  locale,
  orgDefaultLocale,
  service,
  canManage,
  action,
  pending,
  submitLabel,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  locale: string;
  orgDefaultLocale: AppLocale;
  service?: BookingServiceRow;
  canManage: boolean;
  action: (formData: FormData) => void;
  pending: boolean;
  submitLabel: string;
  onDelete?: () => void;
}) {
  const t = useTranslations("services");
  const [isActive, setIsActive] = useState(service?.is_active ?? true);
  const [allowPayLater, setAllowPayLater] = useState(
    service?.allow_pay_later ?? false,
  );

  useEffect(() => {
    if (!open) return;
    setIsActive(service?.is_active ?? true);
    setAllowPayLater(service?.allow_pay_later ?? false);
  }, [open, service?.id, service?.is_active, service?.allow_pay_later]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[90vh] w-full flex-col overflow-hidden sm:max-w-2xl"
        showCloseButton
      >
        <DialogHeader>
          <div className="flex items-start justify-between gap-4 pr-8">
            <div className="min-w-0 space-y-2">
              <DialogTitle>
                {mode === "create" ? t("createTitle") : t("editTitle")}
              </DialogTitle>
              <DialogDescription>
                {mode === "create" ? t("createSubtitle") : t("editSubtitle")}
              </DialogDescription>
            </div>
            {mode === "edit" ? (
              <div className="flex shrink-0 items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-2.5">
                <Label
                  htmlFor="service-is-active-header"
                  className="text-sm font-semibold text-brand"
                >
                  {t("active")}
                </Label>
                <Switch
                  id="service-is-active-header"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                  className="h-7 w-12 shrink-0 data-[size=default]:h-7 data-[size=default]:w-12 [&_[data-slot=switch-thumb]]:size-5 [&_[data-slot=switch-thumb]]:data-checked:translate-x-5"
                />
              </div>
            ) : null}
          </div>
        </DialogHeader>
        <form action={action} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <ServiceFormFields
              key={service?.id ?? (open ? "open" : "closed")}
              locale={locale}
              orgDefaultLocale={orgDefaultLocale}
              service={service}
              isActive={isActive}
              onIsActiveChange={setIsActive}
              allowPayLater={allowPayLater}
              onAllowPayLaterChange={setAllowPayLater}
              showActiveToggle={mode === "create"}
            />
          </div>
          <DialogFooter className="mt-4 gap-2 sm:justify-between">
            {mode === "edit" && canManage && onDelete ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={onDelete}
              >
                <Trash2 className="size-4" />
                {t("delete")}
              </Button>
            ) : (
              <span className="hidden sm:block" />
            )}
            <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? t("saving") : submitLabel}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
        <div className={listStackClassName}>
          <div className={listMobileFiltersClassName}>
            <Input
              type="search"
              value={titleQuery}
              onChange={(e) => setTitleQuery(e.target.value)}
              placeholder={t("filterTitlePlaceholder")}
              aria-label={t("filterTitle")}
            />
            <NativeSelect
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value as ActiveFilter)}
              aria-label={t("filterActive")}
              >
              <option value="all">{t("filterAll")}</option>
              <option value="active">{t("active")}</option>
              <option value="inactive">{t("inactive")}</option>
            </NativeSelect>
            <NativeSelect
              value={formFilter}
              onChange={(e) => setFormFilter(e.target.value as FormFilter)}
              aria-label={t("filterForm")}
              >
              <option value="all">{t("filterAll")}</option>
              <option value="has_form">{t("filterFormAssigned")}</option>
              <option value="no_form">{t("filterFormNone")}</option>
            </NativeSelect>
            <NativeSelect
              value={priceFilter}
              onChange={(e) => setPriceFilter(e.target.value as PriceFilter)}
              aria-label={t("filterPrice")}
              >
              <option value="all">{t("filterAll")}</option>
              <option value="free">{t("filterPriceFree")}</option>
              <option value="paid">{t("filterPricePaid")}</option>
            </NativeSelect>
          </div>

          <ListTableCard>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead
                    className={cn(
                      "min-w-[12rem]",
                      listTableHeadClassName,
                      listTableEdgeStartClassName,
                    )}
                  >
                    <div className="flex flex-col gap-1.5">
                      <SortButton column="title" label={t("titleLabel")} />
                      <Input
                        type="search"
                        value={titleQuery}
                        onChange={(e) => setTitleQuery(e.target.value)}
                        placeholder={t("filterTitlePlaceholder")}
                        aria-label={t("filterTitle")}
                        density="dense"
                      />
                    </div>
                  </TableHead>
                  <TableHead className={cn("min-w-[7rem]", listTableHeadClassName)}>
                    <SortButton column="duration" label={t("duration")} />
                  </TableHead>
                  <TableHead className={cn("min-w-[7rem]", listTableHeadClassName)}>
                    <div className="flex flex-col gap-1.5">
                      <SortButton column="price" label={t("price")} />
                      <NativeSelect
                        value={priceFilter}
                        onChange={(e) =>
                          setPriceFilter(e.target.value as PriceFilter)
                        }
                        aria-label={t("filterPrice")}
                        density="dense"
                      >
                        <option value="all">{t("filterAll")}</option>
                        <option value="free">{t("filterPriceFree")}</option>
                        <option value="paid">{t("filterPricePaid")}</option>
                      </NativeSelect>
                    </div>
                  </TableHead>
                  <TableHead className={cn("min-w-[9rem]", listTableHeadClassName)}>
                    <div className="flex flex-col gap-1.5">
                      <span className="font-medium">{t("columnForm")}</span>
                      <NativeSelect
                        value={formFilter}
                        onChange={(e) =>
                          setFormFilter(e.target.value as FormFilter)
                        }
                        aria-label={t("filterForm")}
                        density="dense"
                      >
                        <option value="all">{t("filterAll")}</option>
                        <option value="has_form">{t("filterFormAssigned")}</option>
                        <option value="no_form">{t("filterFormNone")}</option>
                      </NativeSelect>
                    </div>
                  </TableHead>
                  <TableHead className={cn("min-w-[7rem]", listTableHeadClassName)}>
                    {t("columnReminders")}
                  </TableHead>
                  <TableHead
                    className={cn(
                      "min-w-[7rem]",
                      listTableHeadClassName,
                      !canManage && listTableEdgeEndClassName,
                    )}
                  >
                    <div className="flex flex-col gap-1.5">
                      <SortButton column="is_active" label={t("active")} />
                      <NativeSelect
                        value={activeFilter}
                        onChange={(e) =>
                          setActiveFilter(e.target.value as ActiveFilter)
                        }
                        aria-label={t("filterActive")}
                        density="dense"
                      >
                        <option value="all">{t("filterAll")}</option>
                        <option value="active">{t("active")}</option>
                        <option value="inactive">{t("inactive")}</option>
                      </NativeSelect>
                    </div>
                  </TableHead>
                  {canManage ? (
                    <TableHead
                      className={cn(
                        "w-12",
                        listTableHeadClassName,
                        listTableEdgeEndClassName,
                      )}
                    >
                      <span className="sr-only">{t("edit")}</span>
                    </TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSorted.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={canManage ? 7 : 6}
                      className={listTableEmptyCellClassName}
                    >
                      {t("noMatches")}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSorted.map((service) => {
                const copy = serviceCopy(service, locale, orgDefaultLocale);
                return (
                <TableRow
                  key={service.id}
                  className={cn("group", canManage && "cursor-pointer")}
                  onClick={
                    canManage
                      ? (event) => {
                          if (shouldIgnoreRowClick(event)) return;
                          setEditing(service);
                        }
                      : undefined
                  }
                >
                  <TableCell className={listTableEdgeStartClassName}>
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
                  <TableCell className={cn(!canManage && listTableEdgeEndClassName)}>
                    <Badge variant={service.is_active ? "default" : "secondary"}>
                      {service.is_active ? t("active") : t("inactive")}
                    </Badge>
                  </TableCell>
                  {canManage ? (
                    <TableCell className={cn("text-right", listTableEdgeEndClassName)}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100"
                        onClick={() => setEditing(service)}
                        aria-label={t("edit")}
                        title={t("edit")}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
                );
              })
                )}
              </TableBody>
            </Table>
          </ListTableCard>

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

      <ServiceFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        locale={locale}
        orgDefaultLocale={orgDefaultLocale}
        canManage={canManage}
        action={createAction}
        pending={createPending}
        submitLabel={t("create")}
      />

      <ServiceFormDialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        mode="edit"
        locale={locale}
        orgDefaultLocale={orgDefaultLocale}
        service={editing ?? undefined}
        canManage={canManage}
        action={updateAction}
        pending={updatePending}
        submitLabel={t("save")}
        onDelete={
          editing
            ? async () => {
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
              }
            : undefined
        }
      />
    </div>
  );
}
