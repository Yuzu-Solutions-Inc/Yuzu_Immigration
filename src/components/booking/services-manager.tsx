"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import type {
  BookingServiceFormFieldRow,
  BookingServiceRow,
  ServiceEmailAutomationRow,
} from "@/lib/booking/types";
import { centsToPriceInput, formatPriceCents } from "@/lib/booking/slots";

const initialState: ServiceActionState = {};

function ServiceFormFields({
  locale,
  service,
}: {
  locale: string;
  service?: BookingServiceRow;
}) {
  const t = useTranslations("services");
  return (
    <>
      <input type="hidden" name="locale" value={locale} />
      {service ? <input type="hidden" name="serviceId" value={service.id} /> : null}
      <div className="space-y-2">
        <Label htmlFor="title">{t("titleLabel")}</Label>
        <Input
          id="title"
          name="title"
          required
          maxLength={120}
          defaultValue={service?.title}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">{t("description")}</Label>
        <Textarea
          id="description"
          name="description"
          rows={3}
          maxLength={2000}
          defaultValue={service?.description ?? ""}
        />
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
    </>
  );
}

export function ServicesManager({
  locale,
  canManage,
  services,
  automations,
  formFields,
}: {
  locale: string;
  canManage: boolean;
  services: BookingServiceRow[];
  automations: ServiceEmailAutomationRow[];
  formFields: BookingServiceFormFieldRow[];
}) {
  const t = useTranslations("services");
  const automationsByService = new Map<string, ServiceEmailAutomationRow[]>();
  for (const automation of automations) {
    const list = automationsByService.get(automation.service_id) ?? [];
    list.push(automation);
    automationsByService.set(automation.service_id, list);
  }
  const fieldsByService = new Map<string, BookingServiceFormFieldRow[]>();
  for (const field of formFields) {
    const list = fieldsByService.get(field.service_id) ?? [];
    list.push(field);
    fieldsByService.set(field.service_id, list);
  }
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<BookingServiceRow | null>(null);
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold text-brand">
            {t("title")}
          </h1>
          <p className="text-[15px] text-muted-foreground">{t("subtitle")}</p>
        </div>
        {canManage ? (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            {t("new")}
          </Button>
        ) : null}
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
        <div className="grid gap-4 md:grid-cols-2">
          {services.map((service) => (
            <SurfaceCard key={service.id} className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-heading text-lg font-semibold text-brand">
                    {service.title}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {t("durationMinutes", { minutes: service.duration_minutes })}
                    {" · "}
                    {formatPriceCents(
                      service.price_cents,
                      locale,
                      service.currency,
                    )}
                  </p>
                </div>
                <Badge variant={service.is_active ? "default" : "secondary"}>
                  {service.is_active ? t("active") : t("inactive")}
                </Badge>
              </div>
              {service.description ? (
                <p className="text-sm text-muted-foreground">
                  {service.description}
                </p>
              ) : null}
              {canManage ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing(service)}
                  >
                    <Pencil className="size-4" />
                    {t("edit")}
                  </Button>
                  <ServiceBookingFormButton
                    locale={locale}
                    serviceId={service.id}
                    serviceTitle={service.title}
                    fields={fieldsByService.get(service.id) ?? []}
                    canManage={canManage}
                  />
                  <ServiceEmailAutomationsButton
                    locale={locale}
                    serviceId={service.id}
                    serviceTitle={service.title}
                    automations={automationsByService.get(service.id) ?? []}
                    formFields={fieldsByService.get(service.id) ?? []}
                    canManage={canManage}
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={async () => {
                      if (!window.confirm(t("deleteConfirm"))) return;
                      const result = await deleteServiceAction(
                        service.id,
                        locale,
                      );
                      if (result.error) toast.error(t(`errors.${result.error}`));
                      else if (result.message === "archived") {
                        toast.success(t("archived"));
                      } else {
                        toast.success(t("deleted"));
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                    {t("delete")}
                  </Button>
                </div>
              ) : null}
            </SurfaceCard>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>{t("createTitle")}</DialogTitle>
            <DialogDescription>{t("createSubtitle")}</DialogDescription>
          </DialogHeader>
          <form action={createAction} className="space-y-4">
            <ServiceFormFields locale={locale} />
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
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>{t("editTitle")}</DialogTitle>
            <DialogDescription>{t("editSubtitle")}</DialogDescription>
          </DialogHeader>
          {editing ? (
            <form action={updateAction} className="space-y-4">
              <ServiceFormFields locale={locale} service={editing} />
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
