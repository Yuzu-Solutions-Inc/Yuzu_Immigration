"use client";

import { FileText } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  resendContractSignerAction,
  sendAppointmentContractsAction,
  staffSignContractAction,
  voidContractEnvelopeAction,
} from "@/app/actions/contracts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldHint, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { ContractEnvelopeSummary } from "@/lib/contracts/types";

export function BookingContractsButton({
  locale,
  appointmentId,
  guestName,
  hostName,
  isHost,
  contracts,
}: {
  locale: string;
  appointmentId: string;
  guestName: string;
  hostName: string;
  isHost: boolean;
  contracts: ContractEnvelopeSummary[];
}) {
  const t = useTranslations("bookings");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [typedName, setTypedName] = useState("");
  const pendingConsultant = contracts.find((row) => row.needs_consultant_sign);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100"
        onClick={() => setOpen(true)}
        aria-label={t("contracts")}
        title={t("contracts")}
      >
        <FileText className="size-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg" showCloseButton>
          <DialogHeader>
            <DialogTitle>{t("contractsTitle")}</DialogTitle>
            <DialogDescription>{t("contractsSubtitle")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {contracts.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("contractsEmpty")}</p>
            ) : (
              <ul className="space-y-2">
                {contracts.map((row) => (
                  <li
                    key={row.id}
                    className="rounded-xl border border-border px-3 py-2 text-sm"
                  >
                    <p className="font-medium">{row.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {t(`contractStatus.${row.status}`)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {row.status === "completed" ? (
                        <a
                          href={`/api/contracts/${row.id}/pdf`}
                          className="inline-flex h-9 items-center rounded-xl border border-border bg-surface px-3 text-sm font-semibold"
                        >
                          {t("downloadSigned")}
                        </a>
                      ) : null}
                      {["sent", "viewed", "partially_signed"].includes(row.status) ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() => {
                              startTransition(async () => {
                                const result = await resendContractSignerAction(
                                  row.id,
                                  locale,
                                );
                                if (result.error) {
                                  toast.error(t(`errors.${result.error}`));
                                  return;
                                }
                                toast.success(t("contractResent"));
                                router.refresh();
                              });
                            }}
                          >
                            {t("resendContract")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() => {
                              if (!window.confirm(t("voidContractConfirm"))) return;
                              startTransition(async () => {
                                const result = await voidContractEnvelopeAction(
                                  row.id,
                                  locale,
                                );
                                if (result.error) {
                                  toast.error(t(`errors.${result.error}`));
                                  return;
                                }
                                toast.success(t("contractVoided"));
                                router.refresh();
                              });
                            }}
                          >
                            {t("voidContract")}
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {pendingConsultant ? (
              isHost ? (
                <div className="space-y-2 rounded-xl border border-border p-3">
                  <Field>
                    <FieldLabel htmlFor={`sign-${appointmentId}`} required>
                      {t("consultantSignName")}
                    </FieldLabel>
                    <Input
                      id={`sign-${appointmentId}`}
                      value={typedName}
                      onChange={(event) => setTypedName(event.target.value)}
                    />
                    <FieldHint>
                      {t("consultantSignHint", { name: guestName })}
                    </FieldHint>
                  </Field>
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending || typedName.trim().length < 2}
                    onClick={() => {
                      startTransition(async () => {
                        const result = await staffSignContractAction(
                          pendingConsultant.id,
                          typedName,
                          "typed",
                          null,
                          locale,
                        );
                        if (result.error) {
                          toast.error(t(`errors.${result.error}`));
                          return;
                        }
                        toast.success(t("contractSigned"));
                        router.refresh();
                      });
                    }}
                  >
                    {t("signAsConsultant")}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("consultantWaiting", { name: hostName })}
                </p>
              )
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  const result = await sendAppointmentContractsAction(
                    appointmentId,
                    locale,
                  );
                  if (result.error) {
                    toast.error(t(`errors.${result.error}`));
                    return;
                  }
                  toast.success(
                    t(
                      result.message === "none_due"
                        ? "contractsNoneDue"
                        : "contractsSent",
                    ),
                  );
                  router.refresh();
                });
              }}
            >
              {t("sendContracts")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
